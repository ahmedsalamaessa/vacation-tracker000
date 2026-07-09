import { neon } from '@neondatabase/serverless';


function toDateOnly(v: any): string {
  if (v == null) return v as any;
  if (typeof v === 'string') {
    // already yyyy-mm-dd or ISO
    return v.slice(0, 10);
  }
  try {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  } catch {}
  return String(v);
}

export function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return neon(url);
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export function options() {
  return json({ ok: true });
}

export async function readBody<T = any>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

export function mapEmployee(r: any) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    username: r.username,
    jobTitle: r.job_title,
    phone: r.phone,
    workCycle: r.work_cycle,
    cycleType: r.cycle_type,
    role: r.role,
    password: r.password,
    managerId: r.manager_id,
    workLocationLat: r.work_location_lat,
    workLocationLng: r.work_location_lng,
    active: r.active,
    locationIds: r.location_ids || [],
    canViewDashboard: r.can_view_dashboard,
    canCheckIn: r.can_check_in,
    canViewMyAccount: r.can_view_my_account,
    canRequestVacations: r.can_request_vacations,
    canViewNotifications: r.can_view_notifications,
    canViewDailyReview: r.can_view_daily_review,
    canViewAttendance: r.can_view_attendance,
    canEditAttendance: r.can_edit_attendance,
    canApproveVacations: r.can_approve_vacations,
    canViewReports: r.can_view_reports,
    canManageEmployees: r.can_manage_employees,
    canManageSettings: r.can_manage_settings,
    canManageLocations: r.can_manage_locations,
    canLockMonths: r.can_lock_months,
    canViewAuditLog: r.can_view_audit_log,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function mapLocation(r: any) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    lat: r.lat,
    lng: r.lng,
    radiusMeters: r.radius_meters,
    active: r.active,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function mapAttendance(r: any) {
  if (!r) return null;
  return {
    id: r.id,
    employeeId: r.employee_id,
    date: toDateOnly(r.date),
    status: r.status,
    notes: r.notes,
    checkInLat: r.check_in_lat,
    checkInLng: r.check_in_lng,
    workLocationId: r.work_location_id,
    workLocationName: r.work_location_name,
    distanceMeters: r.distance_meters,
    vacationId: r.vacation_id,
    createdAt: r.created_at,
  };
}

export function mapVacation(r: any) {
  if (!r) return null;
  return {
    id: r.id,
    employeeId: r.employee_id,
    workDays: r.work_days,
    vacationDays: r.vacation_days,
    vacationType: r.vacation_type,
    startDate: toDateOnly(r.start_date),
    endDate: toDateOnly(r.end_date),
    vacationStartDate: toDateOnly(r.vacation_start_date),
    vacationEndDate: toDateOnly(r.vacation_end_date),
    status: r.status,
    notes: r.notes,
    requestedBy: r.requested_by,
    approvedBy: r.approved_by,
    createdAt: r.created_at,
  };
}

export function mapAttempt(r: any) {
  if (!r) return null;
  return {
    id: r.id,
    employeeId: r.employee_id,
    employeeName: r.employee_name,
    date: toDateOnly(r.date),
    status: r.status,
    success: r.success,
    reason: r.reason,
    lat: r.lat,
    lng: r.lng,
    nearestLocationId: r.nearest_location_id,
    nearestLocationName: r.nearest_location_name,
    acceptedLocationId: r.accepted_location_id,
    acceptedLocationName: r.accepted_location_name,
    distanceMeters: r.distance_meters,
    createdAt: r.created_at,
  };
}

export function mapAudit(r: any) {
  if (!r) return null;
  return {
    id: r.id,
    actorId: r.actor_id,
    actorName: r.actor_name,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    employeeId: r.employee_id,
    employeeName: r.employee_name,
    date: r.date,
    oldValue: r.old_value,
    newValue: r.new_value,
    notes: r.notes,
    device: r.device,
    userAgent: r.user_agent,
    ip: r.ip,
    override: r.override,
    createdAt: r.created_at,
  };
}

export function mapNotification(r: any) {
  if (!r) return null;
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body,
    employeeId: r.employee_id,
    targetUserIds: r.target_user_ids || [],
    readBy: r.read_by || [],
    entityType: r.entity_type,
    entityId: r.entity_id,
    severity: r.severity,
    createdAt: r.created_at,
  };
}
