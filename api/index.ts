import {
  getSql,
  json,
  options,
  readBody,
  mapEmployee,
  mapLocation,
  mapAttendance,
  mapVacation,
  mapAttempt,
  mapAudit,
  mapNotification,
  mapEquipment,
  mapCheckout,
} from './lib/db';
import { sha256 } from './lib/crypto';

export const config = { runtime: 'edge' };

// 🆕 Rate Limiting بسيط ضد brute force على /login
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000;

function checkRateLimit(ip: string): { allowed: boolean; wait?: number } {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record || record.resetAt < now) {
    loginAttempts.set(ip, { count: 0, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }
  if (record.count >= MAX_ATTEMPTS) {
    return { allowed: false, wait: Math.ceil((record.resetAt - now) / 1000) };
  }
  return { allowed: true };
}

function recordFailedAttempt(ip: string): void {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record || record.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    record.count++;
  }
}

function pathOf(req: Request) {
  const u = new URL(req.url);
  return u.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '') || '';
}

function dateOnly(v: any): string {
  if (v == null || v === '') return '';
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return '';
}

function listDateRange(start: any, end: any): string[] {
  const dates: string[] = [];
  const s = dateOnly(start);
  const e = dateOnly(end);
  if (!s || !e) return dates;
  let cur = new Date(s + 'T12:00:00.000Z');
  const last = new Date(e + 'T12:00:00.000Z');
  if (Number.isNaN(cur.getTime()) || Number.isNaN(last.getTime()) || last < cur) return dates;
  while (cur <= last && dates.length < 120) {
    dates.push(cur.toISOString().slice(0, 10));
    cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
  }
  return dates;
}

async function getSessionUser(sql: any, req: Request) {
  const sessionId = req.headers.get('X-Session-Id');
  if (!sessionId) return null;
  const rows = await sql`
    SELECT e.* FROM sessions s
    JOIN employees e ON s.employee_id = e.id
    WHERE s.id = ${sessionId} AND s.expires_at > NOW()
    LIMIT 1
  `;
  return rows[0] ? mapEmployee(rows[0]) : null;
}

// 🛡️ حارس الصلاحيات — نفس قواعد الواجهة بالظبط، مفيش أي تغيير في الحسابات
// الأدمن له كل الصلاحيات، وغيره حسب الفلاجات المخزنة في الداتابيز
function isAdmin(user: any): boolean {
  return user?.role === 'admin';
}

function hasPerm(user: any, perm: string): boolean {
  if (isAdmin(user)) return true;
  return Boolean(user?.[perm]);
}

function forbidden(message = 'ليس لديك صلاحية لتنفيذ هذا الإجراء') {
  return json({ error: 'forbidden', message }, 403);
}

function vacationTypeToStatus(type: string | null | undefined): string {
  const t = type || 'اعتيادية';
  if (['عارضة', 'عارضة إجازة', 'إجازة عارضة'].includes(t)) return 'عارضة إجازة';
  if (['رسمية', 'إجازة رسمية'].includes(t)) return 'إجازة رسمية';
  if (['سنوية', 'إجازة سنوية'].includes(t)) return 'إجازة سنوية';
  if (['مرضية', 'إجازة مرضية'].includes(t)) return 'إجازة مرضية';
  if (t === 'بدون مرتب') return 'بدون مرتب';
  if (t === 'بدل سهرة') return 'بدل سهرة';
  return 'إجازة اعتيادية';
}

async function syncVacationDays(sql: any, vac: any): Promise<{ synced: number; skipped: number; dates: string[] }> {
  const start = vac.vacation_start_date || vac.start_date;
  const end = vac.vacation_end_date || vac.end_date;
  const dates = listDateRange(start, end);
  if (dates.length === 0) return { synced: 0, skipped: 0, dates: [] };
  const status = vacationTypeToStatus(vac.vacation_type);
  const marker = `AUTO_VACATION:${vac.id}`;
  const presence = new Set(['حاضر', 'سهر', 'عارضة حضور']);
  let synced = 0;
  let skipped = 0;
  for (const iso of dates) {
    const existing = await sql`
      SELECT id, status, notes FROM attendance
      WHERE employee_id = ${vac.employee_id} AND date = ${iso}
      LIMIT 1
    `;
    const row = existing[0] as any;
    if (row && presence.has(row.status) && !String(row.notes || '').startsWith('AUTO_VACATION:')) {
      skipped++;
      continue;
    }
    await sql`
      INSERT INTO attendance (employee_id, date, status, notes, vacation_id)
      VALUES (${vac.employee_id}, ${iso}, ${status}, ${marker}, ${vac.id})
      ON CONFLICT (employee_id, date) DO UPDATE SET
        status = EXCLUDED.status,
        notes = EXCLUDED.notes,
        vacation_id = EXCLUDED.vacation_id
    `;
    synced++;
  }
  return { synced, skipped, dates };
}

// 🧰 إنشاء جداول العدة تلقائيًا (مرة لكل Cold Start — CREATE IF NOT EXISTS آمنة ومتكررة)
let equipmentTablesReady = false;
async function ensureEquipmentTables(sql: any) {
  if (equipmentTablesReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS equipment (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'أخرى',
      serial_number TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'متاحة',
      notes TEXT,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS equipment_checkouts (
      id SERIAL PRIMARY KEY,
      equipment_id INT NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
      surveyor_id INT NOT NULL,
      assistant_id INT,
      checkout_date DATE NOT NULL,
      return_date DATE,
      condition_return TEXT,
      notes TEXT,
      created_by INT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_equipment_checkouts_equipment ON equipment_checkouts(equipment_id)`;
  // 🆕 وجهة المأمورية — كان السطر ده ضايع فالعمود مكانش بيتعمل! (اتصلح)
  await sql`ALTER TABLE equipment_checkouts ADD COLUMN IF NOT EXISTS destination TEXT`;
  // 🆕 عهدة المساحين: الجهاز مع مين ومن امتى وملاحظاته (هالك...)
  await sql`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS custody_employee_id INT`;
  await sql`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS custody_since DATE`;
  await sql`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS custody_notes TEXT`;
  equipmentTablesReady = true;
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return options();
  const sql = getSql();
  const path = pathOf(req);
  const method = req.method || 'GET';

  try {
    await ensureEquipmentTables(sql);
    if (path === '' || path === 'health') {
      return json({ ok: true, service: 'vacation-api', time: new Date().toISOString() });
    }

    // 🛡️ البوابة العامة: كل النقاط محتاجة جلسة صالحة (عدا health و login)
    const isLogin = path === 'login' && method === 'POST';
    let authUser: any = null;
    if (!isLogin) {
      authUser = await getSessionUser(sql, req);
      if (!authUser) return json({ error: 'unauthorized' }, 401);
    }

    if (path === 'login' && method === 'POST') {
      // 🆕 فحص Rate Limit
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
              || req.headers.get('cf-connecting-ip')
              || 'unknown';
      const rateCheck = checkRateLimit(ip);
      if (!rateCheck.allowed) {
        return json({
          error: 'too_many_attempts',
          message: `محاولات كتيرة. حاول تاني بعد ${rateCheck.wait} ثانية`,
          wait: rateCheck.wait
        }, 429);
      }

      const body = await readBody<{ username?: string; password?: string }>(req);
      const loginValue = (body.username || '').trim();
      const passwordHash = 'sha256:' + await sha256(body.password || '');
      const normalizedPhone = loginValue.replace(/\s|-/g, '');
      const rows = await sql`
        SELECT * FROM employees
        WHERE active = true
          AND password = ${passwordHash}
          AND (
            username = ${loginValue}
            OR (phone IS NOT NULL AND REPLACE(REPLACE(phone, ' ', ''), '-', '') = ${normalizedPhone})
          )
        LIMIT 1
      `;
      const emp = mapEmployee(rows[0]);
      if (!emp) {
        recordFailedAttempt(ip);
        return json({ error: 'invalid_credentials' }, 401);
      }
      loginAttempts.delete(ip);

      const { password, ...safe } = emp as any;

      // 🆕 استخدام crypto.randomUUID بدل Math.random
      const sessionId = crypto.randomUUID();
      await sql`
        INSERT INTO sessions (id, employee_id, expires_at)
        VALUES (${sessionId}, ${emp.id}, NOW() + INTERVAL '30 days')
        ON CONFLICT (id) DO UPDATE SET expires_at = EXCLUDED.expires_at
      `;
      return json({
        user: { ...safe, hasPassword: Boolean(password), password: password ? '***' : '' },
        sessionId
      });
    }

    if (path === 'bootstrap' && method === 'GET') {
      const user = await getSessionUser(sql, req);
      if (!user) return json({ error: 'unauthorized' }, 401);
      const [employees, locations, attendance, vacations, auditLogs, monthLocks, attempts, notifications, settingsRows, equipmentRows, checkoutRows] =
        await Promise.all([
          sql`SELECT * FROM employees ORDER BY id`,
          sql`SELECT * FROM work_locations ORDER BY id`,
          sql`SELECT * FROM attendance ORDER BY date DESC, id DESC`,
          sql`SELECT * FROM vacations ORDER BY created_at DESC`,
          sql`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 500`,
          sql`SELECT * FROM month_locks ORDER BY year_month DESC`,
          sql`SELECT * FROM check_in_attempts ORDER BY created_at DESC LIMIT 2000`,
          sql`SELECT * FROM notifications ORDER BY created_at DESC LIMIT 500`,
          sql`SELECT key, value FROM settings`,
          sql`SELECT * FROM equipment ORDER BY id`,
          sql`SELECT * FROM equipment_checkouts ORDER BY created_at DESC LIMIT 1000`,
        ]);

      let filteredEmployees: any[] = (employees as any[]).map(mapEmployee).filter(Boolean);
      if (user.role === 'employee') {
        filteredEmployees = filteredEmployees.filter((e: any) => e && e.id === user.id);
      } else if (user.role === 'manager') {
        const userLocs = user.locationIds || [];
        filteredEmployees = filteredEmployees.filter((e: any) =>
          e && (e.id === user.id || (e.locationIds && e.locationIds.some((id: number) => userLocs.includes(id))))
        );
      }
      const empIds = new Set(filteredEmployees.map((e: any) => e.id));
      const filteredAttendance = (attendance as any[]).map(mapAttendance).filter((a: any) => a !== null && empIds.has(a.employeeId));
      const filteredVacations = (vacations as any[]).map(mapVacation).filter((v: any) => v !== null && empIds.has(v.employeeId));

      const settings: Record<string, string> = {};
      for (const r of settingsRows as any[]) settings[r.key] = r.value;

      return json({
        employees: filteredEmployees.map((e: any) => {
          const { password, ...rest } = e;
          return { ...rest, hasPassword: Boolean(password), password: password ? '***' : '' };
        }),
        locations: (locations as any[]).map(mapLocation).filter(Boolean),
        attendance: filteredAttendance,
        vacations: filteredVacations,
        auditLogs: (auditLogs as any[]).map(mapAudit).filter(Boolean),
        monthLocks: (monthLocks as any[]).map((r: any) => ({
          id: r.id,
          yearMonth: r.year_month,
          lockedBy: r.locked_by,
          lockedByName: r.locked_by_name,
          lockedAt: r.locked_at,
          notes: r.notes,
        })),
        checkInAttempts: (attempts as any[]).map(mapAttempt).filter(Boolean),
        notifications: (notifications as any[]).map(mapNotification).filter(Boolean),
        equipment: (equipmentRows as any[]).map(mapEquipment).filter(Boolean),
        equipmentCheckouts: (checkoutRows as any[]).map(mapCheckout).filter(Boolean),
        settings,
      });
    }

    if (path === 'employees' && method === 'GET') {
      const user = await getSessionUser(sql, req);
      if (!user) return json({ error: 'unauthorized' }, 401);
      const rows = await sql`SELECT * FROM employees ORDER BY id`;
      let filteredRows = (rows as any[]);
      if (user.role === 'employee') {
        filteredRows = filteredRows.filter((r: any) => r.id === user.id);
      } else if (user.role === 'manager') {
        const userLocs = user.locationIds || [];
        filteredRows = filteredRows.filter((r: any) =>
          r.id === user.id || (r.location_ids && r.location_ids.some((id: number) => userLocs.includes(id)))
        );
      }
      return json(
        filteredRows.map((r: any) => {
          const e = mapEmployee(r);
          if (!e) return null;
          const employee = e as any;
          const hasPassword = Boolean(employee.password);
          employee.hasPassword = hasPassword;
          employee.password = hasPassword ? '***' : '';
          return employee;
        }).filter(Boolean),
      );
    }

    if (path === 'employees' && method === 'POST') {
      // 🛡️ إدارة الموظفين
      if (!hasPerm(authUser, 'canManageEmployees')) return forbidden('صلاحية إدارة الموظفين مطلوبة');
      const b = await readBody<any>(req);
      let password = b.password || '';
      if (password && !password.startsWith('sha256:')) password = 'sha256:' + await sha256(password);
      const rows = await sql`
        INSERT INTO employees (
          name, username, job_title, phone, work_cycle, cycle_type, role, password, manager_id,
          work_location_lat, work_location_lng, active, location_ids,
          can_view_dashboard, can_check_in, can_view_my_account, can_request_vacations,
          can_view_notifications, can_view_daily_review, can_view_attendance, can_edit_attendance,
          can_approve_vacations, can_view_reports, can_manage_employees, can_manage_settings,
          can_manage_locations, can_lock_months, can_view_audit_log
        ) VALUES (
          ${b.name}, ${b.username}, ${b.jobTitle ?? null}, ${b.phone ?? null},
          ${b.workCycle ?? 12}, ${b.cycleType ?? 'graduated'}, ${b.role ?? 'employee'}, ${password},
          ${b.managerId ?? null}, ${b.workLocationLat ?? null}, ${b.workLocationLng ?? null},
          ${b.active ?? true}, ${b.locationIds ?? []},
          ${!!b.canViewDashboard}, ${b.canCheckIn ?? true}, ${b.canViewMyAccount ?? true}, ${b.canRequestVacations ?? true},
          ${b.canViewNotifications ?? true}, ${!!b.canViewDailyReview}, ${!!b.canViewAttendance}, ${!!b.canEditAttendance},
          ${!!b.canApproveVacations}, ${!!b.canViewReports}, ${!!b.canManageEmployees}, ${!!b.canManageSettings},
          ${!!b.canManageLocations}, ${!!b.canLockMonths}, ${!!b.canViewAuditLog}
        ) RETURNING *
      `;
      const e = mapEmployee(rows[0]) as any;
      if (e) {
        e.hasPassword = Boolean(e.password);
        e.password = e.hasPassword ? '***' : '';
      }
      return json(e, 201);
    }

    if (path.startsWith('employees/') && method === 'PUT') {
      // 🛡️ إدارة الموظفين
      if (!hasPerm(authUser, 'canManageEmployees')) return forbidden('صلاحية إدارة الموظفين مطلوبة');
      const id = Number(path.split('/')[1]);
      const b = await readBody<any>(req);
      let passwordSql = null as string | null;
      if (b.password && b.password !== '') {
        passwordSql = b.password.startsWith('sha256:') ? b.password : 'sha256:' + await sha256(b.password);
      }
      const rows = await sql`
        UPDATE employees SET
          name = COALESCE(${b.name ?? null}, name),
          username = COALESCE(${b.username ?? null}, username),
          job_title = COALESCE(${b.jobTitle ?? null}, job_title),
          phone = COALESCE(${b.phone ?? null}, phone),
          work_cycle = COALESCE(${b.workCycle ?? null}, work_cycle),
          cycle_type = COALESCE(${b.cycleType ?? null}, cycle_type),
          role = COALESCE(${b.role ?? null}, role),
          password = COALESCE(${passwordSql}, password),
          manager_id = COALESCE(${b.managerId ?? null}, manager_id),
          active = COALESCE(${b.active ?? null}, active),
          location_ids = COALESCE(${b.locationIds ?? null}, location_ids),
          can_view_dashboard = COALESCE(${b.canViewDashboard ?? null}, can_view_dashboard),
          can_check_in = COALESCE(${b.canCheckIn ?? null}, can_check_in),
          can_view_my_account = COALESCE(${b.canViewMyAccount ?? null}, can_view_my_account),
          can_request_vacations = COALESCE(${b.canRequestVacations ?? null}, can_request_vacations),
          can_view_notifications = COALESCE(${b.canViewNotifications ?? null}, can_view_notifications),
          can_view_daily_review = COALESCE(${b.canViewDailyReview ?? null}, can_view_daily_review),
          can_view_attendance = COALESCE(${b.canViewAttendance ?? null}, can_view_attendance),
          can_edit_attendance = COALESCE(${b.canEditAttendance ?? null}, can_edit_attendance),
          can_approve_vacations = COALESCE(${b.canApproveVacations ?? null}, can_approve_vacations),
          can_view_reports = COALESCE(${b.canViewReports ?? null}, can_view_reports),
          can_manage_employees = COALESCE(${b.canManageEmployees ?? null}, can_manage_employees),
          can_manage_settings = COALESCE(${b.canManageSettings ?? null}, can_manage_settings),
          can_manage_locations = COALESCE(${b.canManageLocations ?? null}, can_manage_locations),
          can_lock_months = COALESCE(${b.canLockMonths ?? null}, can_lock_months),
          can_view_audit_log = COALESCE(${b.canViewAuditLog ?? null}, can_view_audit_log),
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;
      if (!rows[0]) return json({ error: 'not_found' }, 404);
      const e = mapEmployee(rows[0]) as any;
      if (e) {
        e.hasPassword = Boolean(e.password);
        e.password = e.hasPassword ? '***' : '';
      }
      return json(e);
    }

    if (path.startsWith('employees/') && method === 'DELETE') {
      // 🛡️ إدارة الموظفين
      if (!hasPerm(authUser, 'canManageEmployees')) return forbidden('صلاحية إدارة الموظفين مطلوبة');
      const id = Number(path.split('/')[1]);
      await sql`UPDATE employees SET active = false, updated_at = NOW() WHERE id = ${id}`;
      return json({ ok: true });
    }

    if (path === 'locations' && method === 'GET') {
      const rows = await sql`SELECT * FROM work_locations ORDER BY id`;
      return json((rows as any[]).map(mapLocation));
    }

    if (path === 'locations' && method === 'POST') {
      // 🛡️ إدارة المواقع
      if (!hasPerm(authUser, 'canManageLocations')) return forbidden('صلاحية إدارة مواقع العمل مطلوبة');
      const b = await readBody<any>(req);
      const rows = await sql`
        INSERT INTO work_locations (name, lat, lng, radius_meters, active, notes)
        VALUES (${b.name}, ${b.lat ?? null}, ${b.lng ?? null}, ${b.radiusMeters ?? 1000}, ${b.active ?? true}, ${b.notes ?? null})
        RETURNING *
      `;
      return json(mapLocation(rows[0]), 201);
    }

    if (path.startsWith('locations/') && method === 'PUT') {
      // 🛡️ إدارة المواقع
      if (!hasPerm(authUser, 'canManageLocations')) return forbidden('صلاحية إدارة مواقع العمل مطلوبة');
      const id = Number(path.split('/')[1]);
      const b = await readBody<any>(req);
      const rows = await sql`
        UPDATE work_locations SET
          name = COALESCE(${b.name ?? null}, name),
          lat = COALESCE(${b.lat ?? null}, lat),
          lng = COALESCE(${b.lng ?? null}, lng),
          radius_meters = COALESCE(${b.radiusMeters ?? null}, radius_meters),
          active = COALESCE(${b.active ?? null}, active),
          notes = COALESCE(${b.notes ?? null}, notes),
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;
      if (!rows[0]) return json({ error: 'not_found' }, 404);
      return json(mapLocation(rows[0]));
    }

    if (path.startsWith('locations/') && method === 'DELETE') {
      // 🛡️ إدارة المواقع
      if (!hasPerm(authUser, 'canManageLocations')) return forbidden('صلاحية إدارة مواقع العمل مطلوبة');
      const id = Number(path.split('/')[1]);
      await sql`DELETE FROM work_locations WHERE id = ${id}`;
      return json({ ok: true });
    }

    if (path === 'attendance' && method === 'GET') {
      const user = await getSessionUser(sql, req);
      if (!user) return json({ error: 'unauthorized' }, 401);
      const rows = await sql`SELECT * FROM attendance ORDER BY date DESC, id DESC`;
      if (user.role === 'admin') return json((rows as any[]).map(mapAttendance).filter(Boolean));
      const userLocs = user.locationIds || [];
      const empIds = await sql`
        SELECT id FROM employees
        WHERE id = ${user.id}
        OR (location_ids && ${userLocs})
      `;
      const ids = new Set((empIds as any[]).map((r: any) => r.id));
      return json((rows as any[]).map(mapAttendance).filter((a: any) => a && ids.has(a.employeeId)));
    }

    if (path === 'attendance' && method === 'POST') {
      const b = await readBody<any>(req);
      // 🛡️ الحضور: تسجيل الذات مسموح بصلاحية التشيكن، وغيره محتاج صلاحية تعديل الحضور
      const selfRecord = Number(b.employeeId) === authUser.id;
      const attendanceAllowed = selfRecord
        ? (hasPerm(authUser, 'canCheckIn') || hasPerm(authUser, 'canEditAttendance'))
        : hasPerm(authUser, 'canEditAttendance');
      if (!attendanceAllowed) return forbidden('صلاحية تعديل الحضور مطلوبة');
      const rows = await sql`
        INSERT INTO attendance (
          employee_id, date, status, notes, check_in_lat, check_in_lng,
          work_location_id, work_location_name, distance_meters, vacation_id
        ) VALUES (
          ${b.employeeId}, ${b.date}, ${b.status}, ${b.notes ?? null},
          ${b.checkInLat ?? null}, ${b.checkInLng ?? null},
          ${b.workLocationId ?? null}, ${b.workLocationName ?? null},
          ${b.distanceMeters ?? null}, ${b.vacationId ?? null}
        )
        ON CONFLICT (employee_id, date) DO UPDATE SET
          status = EXCLUDED.status,
          notes = CASE
            WHEN EXCLUDED.notes IS NOT NULL THEN EXCLUDED.notes
            ELSE attendance.notes
          END,
          check_in_lat = COALESCE(EXCLUDED.check_in_lat, attendance.check_in_lat),
          check_in_lng = COALESCE(EXCLUDED.check_in_lng, attendance.check_in_lng),
          work_location_id = COALESCE(EXCLUDED.work_location_id, attendance.work_location_id),
          work_location_name = COALESCE(EXCLUDED.work_location_name, attendance.work_location_name),
          distance_meters = COALESCE(EXCLUDED.distance_meters, attendance.distance_meters),
          vacation_id = COALESCE(EXCLUDED.vacation_id, attendance.vacation_id)
        RETURNING *
      `;
      return json(mapAttendance(rows[0]));
    }

    if (path === 'attendance' && method === 'DELETE') {
      // 🛡️ حذف حضور = صلاحية تعديل الحضور
      if (!hasPerm(authUser, 'canEditAttendance')) return forbidden('صلاحية تعديل الحضور مطلوبة');
      const u = new URL(req.url);
      const employeeId = Number(u.searchParams.get('employeeId'));
      const date = u.searchParams.get('date') || '';
      await sql`DELETE FROM attendance WHERE employee_id = ${employeeId} AND date = ${date}`;
      return json({ ok: true });
    }

    if (path === 'vacations' && method === 'GET') {
      const user = await getSessionUser(sql, req);
      if (!user) return json({ error: 'unauthorized' }, 401);
      const rows = await sql`SELECT * FROM vacations ORDER BY created_at DESC`;
      if (user.role === 'admin') return json((rows as any[]).map(mapVacation).filter(Boolean));
      const userLocs = user.locationIds || [];
      const empIds = await sql`
        SELECT id FROM employees
        WHERE id = ${user.id}
        OR (location_ids && ${userLocs})
      `;
      const ids = new Set((empIds as any[]).map((r: any) => r.id));
      return json((rows as any[]).map(mapVacation).filter((v: any) => v && ids.has(v.employeeId)));
    }

    if (path === 'vacations' && method === 'POST') {
      const b = await readBody<any>(req);
      // 🛡️ إنشاء إجازة: لغيره = صلاحية الموافقة، لنفسه = صلاحية طلب إجازة
      const canApprove = hasPerm(authUser, 'canApproveVacations');
      const ownRequest = Number(b.employeeId) === authUser.id && hasPerm(authUser, 'canRequestVacations');
      if (!canApprove && !ownRequest) return forbidden('لا يمكنك إنشاء إجازة لموظف آخر');
      const rows = await sql`
        INSERT INTO vacations (
          employee_id, work_days, vacation_days, vacation_type,
          start_date, end_date, vacation_start_date, vacation_end_date,
          status, notes, requested_by, approved_by
        ) VALUES (
          ${b.employeeId}, ${b.workDays ?? 0}, ${b.vacationDays ?? 0}, ${b.vacationType ?? 'اعتيادية'},
          ${b.startDate ?? null}, ${b.endDate ?? null},
          ${b.vacationStartDate ?? b.startDate ?? null}, ${b.vacationEndDate ?? b.endDate ?? null},
          ${b.status ?? 'بانتظار الموافقة'}, ${b.notes ?? null},
          ${b.requestedBy ?? null}, ${b.approvedBy ?? null}
        ) RETURNING *
      `;
      const created = rows[0] as any;
      let syncResult: any = null;
      if (created && ['مقبولة', 'مجدولة', 'جارية'].includes(created.status)) {
        syncResult = await syncVacationDays(sql, created);
      }
      return json({ ...mapVacation(created), sync: syncResult }, 201);
    }

    if (path.startsWith('vacations/') && method === 'PUT') {
      const id = Number(path.split('/')[1]);
      if (Number.isFinite(id) && id > 0) {
        // 🛡️ التعديل: موافقة = صلاحية الموافقة، وإلا طلباته الشخصية المعلقة فقط
        if (!hasPerm(authUser, 'canApproveVacations')) {
          const own = await sql`SELECT employee_id, status FROM vacations WHERE id = ${id} LIMIT 1`;
          const v = own[0] as any;
          if (!v || v.employee_id !== authUser.id || v.status !== 'بانتظار الموافقة') {
            return forbidden('لا يمكنك تعديل هذه الإجازة');
          }
        }
        const b = await readBody<any>(req);
        const prevRows = await sql`SELECT status FROM vacations WHERE id = ${id} LIMIT 1`;
        const prevStatus = (prevRows[0] as any)?.status;
        // 🔧 إصلاح: كان workdays غلط، الصح work_days
        const rows = await sql`
          UPDATE vacations SET
            work_days = COALESCE(${b.workDays ?? null}, work_days),
            vacation_days = COALESCE(${b.vacationDays ?? null}, vacation_days),
            vacation_type = COALESCE(${b.vacationType ?? null}, vacation_type),
            start_date = COALESCE(${b.startDate ?? null}, start_date),
            end_date = COALESCE(${b.endDate ?? null}, end_date),
            vacation_start_date = COALESCE(${b.vacationStartDate ?? null}, vacation_start_date),
            vacation_end_date = COALESCE(${b.vacationEndDate ?? null}, vacation_end_date),
            status = COALESCE(${b.status ?? null}, status),
            notes = COALESCE(${b.notes ?? null}, notes),
            approved_by = COALESCE(${b.approvedBy ?? null}, approved_by)
          WHERE id = ${id}
          RETURNING *
        `;
        if (!rows[0]) return json({ error: 'not_found' }, 404);
        const vac = rows[0] as any;
        const newStatus = vac.status;
        let syncResult: any = null;
        if (['مقبولة', 'مجدولة', 'جارية'].includes(newStatus)) {
          syncResult = await syncVacationDays(sql, vac);
        }
        if (newStatus === 'مرفوضة' && prevStatus !== 'مرفوضة') {
          const marker = `AUTO_VACATION:${id}`;
          await sql`DELETE FROM attendance WHERE notes = ${marker} OR vacation_id = ${id}`;
          syncResult = { cleared: true };
        }
        return json({ ...mapVacation(vac), sync: syncResult });
      }
    }

    if (path.startsWith('vacations/') && method === 'DELETE') {
      const id = Number(path.split('/')[1]);
      // 🛡️ الحذف: موافقة = صلاحية الموافقة، وإلا طلباته الشخصية المعلقة فقط
      if (!hasPerm(authUser, 'canApproveVacations')) {
        const own = await sql`SELECT employee_id, status FROM vacations WHERE id = ${id} LIMIT 1`;
        const v = own[0] as any;
        if (!v || v.employee_id !== authUser.id || v.status !== 'بانتظار الموافقة') {
          return forbidden('لا يمكنك حذف هذه الإجازة');
        }
      }
      await sql`DELETE FROM vacations WHERE id = ${id}`;
      return json({ ok: true });
    }

    if (path === 'check-in-attempts' && method === 'GET') {
      // 🛡️ عرض محاولات البصمة = صلاحية سجل التدقيق (زي الواجهة)
      if (!hasPerm(authUser, 'canViewAuditLog')) return forbidden('صلاحية سجل التدقيق مطلوبة');
      const rows = await sql`SELECT * FROM check_in_attempts ORDER BY created_at DESC LIMIT 2000`;
      return json((rows as any[]).map(mapAttempt).filter(Boolean));
    }

    if (path === 'check-in-attempts' && method === 'POST') {
      // 🛡️ تسجيل محاولة بصمة = صلاحية التشيكن أو تعديل الحضور
      if (!(hasPerm(authUser, 'canCheckIn') || hasPerm(authUser, 'canEditAttendance'))) {
        return forbidden('صلاحية تسجيل الحضور مطلوبة');
      }
      const b = await readBody<any>(req);
      const rows = await sql`
        INSERT INTO check_in_attempts (
          employee_id, employee_name, date, status, success, reason, lat, lng,
          nearest_location_id, nearest_location_name, accepted_location_id, accepted_location_name, distance_meters
        ) VALUES (
          ${b.employeeId}, ${b.employeeName ?? null}, ${b.date}, ${b.status ?? null},
          ${!!b.success}, ${b.reason ?? null}, ${b.lat ?? null}, ${b.lng ?? null},
          ${b.nearestLocationId ?? null}, ${b.nearestLocationName ?? null},
          ${b.acceptedLocationId ?? null}, ${b.acceptedLocationName ?? null},
          ${b.distanceMeters ?? null}
        ) RETURNING *
      `;
      return json(mapAttempt(rows[0]), 201);
    }

    if (path === 'check-in-attempts' && method === 'DELETE') {
      // 🛡️ حذف بصمات قديمة = صلاحية تعديل الحضور (أدمن/مدير)
      // (إصلاح: الزرار كان محلي بس والسيرفر بيرجّع البصمات مع أول bootstrap)
      if (!hasPerm(authUser, 'canEditAttendance')) return forbidden('صلاحية تعديل الحضور مطلوبة');
      const u = new URL(req.url);
      const days = Math.max(1, Number(u.searchParams.get('days') || '30'));
      const failedOnly = u.searchParams.get('failedOnly') === '1';
      const cutoff = new Date(Date.now() - days * 86400000).toISOString();
      const rows = failedOnly
        ? await sql`DELETE FROM check_in_attempts WHERE success = false AND created_at < ${cutoff} RETURNING id`
        : await sql`DELETE FROM check_in_attempts WHERE created_at < ${cutoff} RETURNING id`;
      return json({ ok: true, deleted: (rows as any[]).length });
    }

    if (path === 'audit-logs' && method === 'GET') {
      // 🛡️ سجل التدقيق
      if (!hasPerm(authUser, 'canViewAuditLog')) return forbidden('صلاحية سجل التدقيق مطلوبة');
      const rows = await sql`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 500`;
      return json((rows as any[]).map(mapAudit).filter(Boolean));
    }

    if (path === 'audit-logs' && method === 'POST') {
      const b = await readBody<any>(req);
      const rows = await sql`
        INSERT INTO audit_logs (
          actor_id, actor_name, action, entity_type, entity_id, employee_id, employee_name,
          date, old_value, new_value, notes, device, user_agent, ip, override
        ) VALUES (
          ${b.actorId ?? null}, ${b.actorName ?? null}, ${b.action}, ${b.entityType},
          ${b.entityId ?? null}, ${b.employeeId ?? null}, ${b.employeeName ?? null},
          ${b.date ?? null}, ${b.oldValue ?? null}, ${b.newValue ?? null}, ${b.notes ?? null},
          ${b.device ?? null}, ${b.userAgent ?? null}, ${b.ip ?? null}, ${b.override ?? false}
        ) RETURNING *
      `;
      return json(mapAudit(rows[0]), 201);
    }

    if (path === 'notifications' && method === 'GET') {
      const u = new URL(req.url);
      const userId = Number(u.searchParams.get('userId') || 0);
      const rows = userId
        ? await sql`SELECT * FROM notifications WHERE ${userId} = ANY(target_user_ids) ORDER BY created_at DESC LIMIT 200`
        : await sql`SELECT * FROM notifications ORDER BY created_at DESC LIMIT 200`;
      return json((rows as any[]).map(mapNotification).filter(Boolean));
    }

    if (path === 'notifications' && method === 'POST') {
      const b = await readBody<any>(req);
      const rows = await sql`
        INSERT INTO notifications (
          type, title, body, employee_id, target_user_ids, read_by, entity_type, entity_id, severity
        ) VALUES (
          ${b.type}, ${b.title}, ${b.body}, ${b.employeeId ?? null},
          ${b.targetUserIds ?? []}, ${b.readBy ?? []},
          ${b.entityType ?? null}, ${b.entityId ?? null}, ${b.severity ?? 'info'}
        ) RETURNING *
      `;
      return json(mapNotification(rows[0]), 201);
    }

    if (path === 'settings' && method === 'GET') {
      const rows = await sql`SELECT key, value FROM settings`;
      const out: Record<string, string> = {};
      for (const r of rows as any[]) out[r.key] = r.value;
      return json(out);
    }

    if (path === 'settings' && method === 'PUT') {
      // 🛡️ تغيير الإعدادات = صلاحية إدارة الإعدادات
      if (!hasPerm(authUser, 'canManageSettings')) return forbidden('صلاحية إدارة الإعدادات مطلوبة');
      const b = await readBody<Record<string, string>>(req);
      for (const [key, value] of Object.entries(b)) {
        await sql`
          INSERT INTO settings (key, value) VALUES (${key}, ${String(value ?? '')})
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        `;
      }
      return json({ ok: true });
    }

    if (path === 'month-locks' && method === 'GET') {
      const rows = await sql`SELECT * FROM month_locks ORDER BY year_month DESC`;
      return json(
        (rows as any[]).map((r: any) => ({
          id: r.id,
          yearMonth: r.year_month,
          lockedBy: r.locked_by,
          lockedByName: r.locked_by_name,
          lockedAt: r.locked_at,
          notes: r.notes,
        })),
      );
    }

    if (path === 'month-locks' && method === 'POST') {
      // 🛡️ قفل الشهر
      if (!hasPerm(authUser, 'canLockMonths')) return forbidden('صلاحية قفل الشهور مطلوبة');
      const b = await readBody<any>(req);
      const rows = await sql`
        INSERT INTO month_locks (year_month, locked_by, locked_by_name, notes)
        VALUES (${b.yearMonth}, ${b.lockedBy ?? null}, ${b.lockedByName ?? null}, ${b.notes ?? null})
        ON CONFLICT (year_month) DO UPDATE SET
          locked_by = EXCLUDED.locked_by,
          locked_by_name = EXCLUDED.locked_by_name,
          locked_at = NOW()
        RETURNING *
      `;
      const r = rows[0] as any;
      return json({
        id: r.id,
        yearMonth: r.year_month,
        lockedBy: r.locked_by,
        lockedByName: r.locked_by_name,
        lockedAt: r.locked_at,
        notes: r.notes,
      });
    }

    if (path.startsWith('month-locks/') && method === 'DELETE') {
      // 🛡️ فتح الشهر
      if (!hasPerm(authUser, 'canLockMonths')) return forbidden('صلاحية قفل الشهور مطلوبة');
      const yearMonth = decodeURIComponent(path.split('/')[1] || '');
      await sql`DELETE FROM month_locks WHERE year_month = ${yearMonth}`;
      return json({ ok: true });
    }

    if (path === 'vacations/sync-attendance' && method === 'POST') {
      // 🛡️ مزامنة الحضور
      if (!hasPerm(authUser, 'canApproveVacations')) return forbidden('صلاحية إدارة الإجازات مطلوبة');
      const b = await readBody<any>(req);
      const vacationId = Number(b.vacationId);
      const vacRows = await sql`SELECT * FROM vacations WHERE id = ${vacationId}`;
      const vac = vacRows[0] as any;
      if (!vac) return json({ error: 'not_found' }, 404);
      const result = await syncVacationDays(sql, vac);
      return json({ ...result, status: vacationTypeToStatus(vac.vacation_type), vacationId });
    }

    if (path === 'vacations/clear-attendance' && method === 'POST') {
      // 🛡️ مسح الحضور المرتبط
      if (!hasPerm(authUser, 'canApproveVacations')) return forbidden('صلاحية إدارة الإجازات مطلوبة');
      const b = await readBody<any>(req);
      const vacationId = Number(b.vacationId);
      const marker = `AUTO_VACATION:${vacationId}`;
      await sql`DELETE FROM attendance WHERE notes = ${marker} OR vacation_id = ${vacationId}`;
      return json({ ok: true, vacationId });
    }

    if (path === 'vacations/sync-all-approved' && method === 'POST') {
      // 🛡️ مزامنة شاملة
      if (!hasPerm(authUser, 'canApproveVacations')) return forbidden('صلاحية إدارة الإجازات مطلوبة');
      const vacs = await sql`
        SELECT * FROM vacations
        WHERE status IN ('مقبولة', 'مجدولة', 'جارية', 'منتهية')
        ORDER BY id
      `;
      const results: any[] = [];
      for (const vac of vacs as any[]) {
        const r = await syncVacationDays(sql, vac);
        results.push({ vacationId: vac.id, ...r });
      }
      return json({ ok: true, count: results.length, results });
    }

    // ============ 🧰 استلام وتسليم العدة ============
    if (path === 'equipment' && method === 'GET') {
      const rows = await sql`SELECT * FROM equipment ORDER BY id`;
      return json((rows as any[]).map(mapEquipment).filter(Boolean));
    }

    if (path === 'equipment' && method === 'POST') {
      // 🛡️ إدارة المعدات = صلاحية تعديل الحضور (أدمن/مدير)
      if (!hasPerm(authUser, 'canEditAttendance')) return forbidden('صلاحية إدارة العدة مطلوبة');
      const b = await readBody<any>(req);
      if (!b?.name || !b?.serialNumber) return json({ error: 'bad_request', message: 'الاسم والسيريال نمبر مطلوبين' }, 400);
      const dupe = await sql`SELECT id FROM equipment WHERE serial_number = ${String(b.serialNumber).trim()}`;
      if ((dupe as any[]).length > 0) return json({ error: 'duplicate', message: 'السيريال نمبر ده مسجل قبل كده' }, 409);
      const rows = await sql`
        INSERT INTO equipment (name, kind, serial_number, status, notes, active)
        VALUES (${b.name}, ${b.kind || 'أخرى'}, ${String(b.serialNumber).trim()}, 'متاحة', ${b.notes ?? null}, ${b.active !== false})
        RETURNING *`;
      return json(mapEquipment((rows as any[])[0]), 201);
    }

    if (path.startsWith('equipment/') && method === 'PUT') {
      if (!hasPerm(authUser, 'canEditAttendance')) return forbidden('صلاحية إدارة العدة مطلوبة');
      const id = Number(path.split('/')[1]);
      const b = await readBody<any>(req);
      const cur = await sql`SELECT * FROM equipment WHERE id = ${id}`;
      if ((cur as any[]).length === 0) return json({ error: 'not_found' }, 404);
      const c = (cur as any[])[0];
      const rows = await sql`
        UPDATE equipment SET
          name = ${b.name ?? c.name},
          kind = ${b.kind ?? c.kind},
          serial_number = ${b.serialNumber !== undefined ? String(b.serialNumber).trim() : c.serial_number},
          status = ${b.status ?? c.status},
          notes = ${b.notes !== undefined ? b.notes : c.notes},
          active = ${b.active !== undefined ? b.active : c.active},
          custody_employee_id = ${b.custodyEmployeeId !== undefined ? (b.custodyEmployeeId ?? null) : c.custody_employee_id},
          custody_since = ${b.custodySince !== undefined ? (b.custodySince ?? null) : c.custody_since},
          custody_notes = ${b.custodyNotes !== undefined ? (b.custodyNotes ?? null) : c.custody_notes}
        WHERE id = ${id} RETURNING *`;
      return json(mapEquipment((rows as any[])[0]));
    }

    if (path.startsWith('equipment/') && method === 'DELETE') {
      if (!hasPerm(authUser, 'canEditAttendance')) return forbidden('صلاحية إدارة العدة مطلوبة');
      const id = Number(path.split('/')[1]);
      const cur = await sql`SELECT status FROM equipment WHERE id = ${id}`;
      if ((cur as any[]).length === 0) return json({ error: 'not_found' }, 404);
      if ((cur as any[])[0].status === 'خارجة') return json({ error: 'conflict', message: 'الجهاز خارج دلوقتي — رجّعه الأول' }, 409);
      await sql`DELETE FROM equipment WHERE id = ${id}`;
      return json({ ok: true });
    }

    if (path === 'equipment-checkouts' && method === 'GET') {
      const rows = await sql`SELECT * FROM equipment_checkouts ORDER BY created_at DESC LIMIT 1000`;
      return json((rows as any[]).map(mapCheckout).filter(Boolean));
    }

    if (path === 'equipment-checkouts' && method === 'POST') {
      // خروج العدة العادي: المساح بيسجله لنفسه | المأمورية (وجهة موقع تاني): إدارة بس
      const b = await readBody<any>(req);
      const ids: number[] = Array.isArray(b?.equipmentIds) ? b.equipmentIds.map(Number).filter(Boolean) : [];
      const surveyorId = Number(b?.surveyorId);
      const isMission = Boolean(b?.destination);
      if (!hasPerm(authUser, 'canEditAttendance')) {
        if (isMission) return forbidden('المأموريات (الخروج لموقع تاني) من إدارة النظام بس');
        if (surveyorId !== authUser.id) return forbidden('تقدر تسجل خروج العدة لنفسك بس');
      }
      if (ids.length === 0 || !surveyorId || !b?.checkoutDate) {
        return json({ error: 'bad_request', message: 'المساح والتاريخ وجهاز واحد على الأقل مطلوبين' }, 400);
      }
      const blocked: string[] = [];
      for (const eid of ids) {
        const rows = await sql`SELECT * FROM equipment WHERE id = ${eid}`;
        const eq = (rows as any[])[0];
        if (!eq || !eq.active || eq.status !== 'متاحة') blocked.push(eq ? `${eq.name} (${eq.serial_number})` : `#${eid}`);
      }
      if (blocked.length > 0) return json({ error: 'conflict', message: `أجهزة مش متاحة: ${blocked.join('، ')}` }, 409);
      const created: any[] = [];
      for (const eid of ids) {
        const rows = await sql`
          INSERT INTO equipment_checkouts (equipment_id, surveyor_id, assistant_id, checkout_date, destination, notes, created_by)
          VALUES (${eid}, ${surveyorId}, ${b.assistantId ? Number(b.assistantId) : null}, ${b.checkoutDate}, ${b.destination ?? null}, ${b.notes ?? null}, ${authUser.id})
          RETURNING *`;
        created.push(mapCheckout((rows as any[])[0]));
        await sql`UPDATE equipment SET status = 'خارجة' WHERE id = ${eid}`;
      }
      return json({ ok: true, created: created.length, checkouts: created }, 201);
    }

    if (path === 'equipment-checkouts/return' && method === 'POST') {
      // رجوع عدة: المساح صاحب السجل أو أدمن/مدير
      const b = await readBody<any>(req);
      const id = Number(b?.id);
      const cur = await sql`SELECT * FROM equipment_checkouts WHERE id = ${id}`;
      const co = (cur as any[])[0];
      if (!co) return json({ error: 'not_found' }, 404);
      // العدة العادية: المساح يرجعها بنفسه | مأمورية أو عدة حد تاني: إدارة بس
      if (!hasPerm(authUser, 'canEditAttendance')) {
        if (co.destination) return forbidden('رجوع مأموريات العدة من إدارة النظام بس');
        if (co.surveyor_id !== authUser.id) return forbidden('تقدر تسجل رجوع عدتك بس');
      }
      if (co.return_date) return json({ error: 'conflict', message: 'العدة دي مسجّل رجوعها خلاص' }, 409);
      const today = new Date().toISOString().slice(0, 10);
      const condition = b?.conditionReturn || 'سليم';
      const newStatus = condition === 'يحتاج صيانة' ? 'صيانة' : 'متاحة';
      await sql`
        UPDATE equipment_checkouts SET return_date = ${today}, condition_return = ${condition},
          notes = COALESCE(${b.notes ?? null}, notes)
        WHERE id = ${id}`;
      await sql`UPDATE equipment SET status = ${newStatus} WHERE id = ${co.equipment_id}`;
      return json({ ok: true });
    }

    return json({ error: 'not_found', path, method }, 404);
  } catch (err: any) {
    console.error(err);
    return json({ error: 'server_error', message: err?.message || String(err) }, 500);
  }
}
