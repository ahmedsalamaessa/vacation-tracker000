import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env.local') });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL missing in .env.local');
  process.exit(1);
}

const sql = neon(url);

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

async function q(label, fn) {
  try {
    await fn();
    console.log('  ✓', label);
  } catch (e) {
    if (String(e.message || e).includes('already exists')) {
      console.log('  ~', label, '(already exists)');
      return;
    }
    console.error('  ✗', label, e.message || e);
    throw e;
  }
}

async function run() {
  console.log('1) Creating schema...');

  await q('extension pgcrypto', () => sql`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

  await q('table employees', () => sql`
    CREATE TABLE IF NOT EXISTS employees (
      id              SERIAL PRIMARY KEY,
      name            TEXT NOT NULL,
      username        TEXT NOT NULL UNIQUE,
      job_title       TEXT,
      phone           TEXT,
      work_cycle      INTEGER NOT NULL DEFAULT 12,
      cycle_type      TEXT NOT NULL DEFAULT 'graduated'
                      CHECK (cycle_type IN ('fixed', 'variable', 'graduated')),
      role            TEXT NOT NULL DEFAULT 'employee'
                      CHECK (role IN ('admin', 'manager', 'employee')),
      password        TEXT NOT NULL,
      manager_id      INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      work_location_lat DOUBLE PRECISION,
      work_location_lng DOUBLE PRECISION,
      active          BOOLEAN NOT NULL DEFAULT TRUE,
      location_ids    INTEGER[] NOT NULL DEFAULT '{}',
      can_view_dashboard      BOOLEAN NOT NULL DEFAULT FALSE,
      can_check_in            BOOLEAN NOT NULL DEFAULT TRUE,
      can_view_my_account     BOOLEAN NOT NULL DEFAULT TRUE,
      can_request_vacations   BOOLEAN NOT NULL DEFAULT TRUE,
      can_view_notifications  BOOLEAN NOT NULL DEFAULT TRUE,
      can_view_daily_review   BOOLEAN NOT NULL DEFAULT FALSE,
      can_view_attendance     BOOLEAN NOT NULL DEFAULT FALSE,
      can_edit_attendance     BOOLEAN NOT NULL DEFAULT FALSE,
      can_approve_vacations   BOOLEAN NOT NULL DEFAULT FALSE,
      can_view_reports        BOOLEAN NOT NULL DEFAULT FALSE,
      can_manage_employees    BOOLEAN NOT NULL DEFAULT FALSE,
      can_manage_settings     BOOLEAN NOT NULL DEFAULT FALSE,
      can_manage_locations    BOOLEAN NOT NULL DEFAULT FALSE,
      can_lock_months         BOOLEAN NOT NULL DEFAULT FALSE,
      can_view_audit_log      BOOLEAN NOT NULL DEFAULT FALSE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await q('idx employees', async () => {
    await sql`CREATE INDEX IF NOT EXISTS idx_employees_username ON employees(username)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_employees_phone ON employees(phone)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(active)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_employees_role ON employees(role)`;
  });

  await q('table work_locations', () => sql`
    CREATE TABLE IF NOT EXISTS work_locations (
      id              SERIAL PRIMARY KEY,
      name            TEXT NOT NULL,
      lat             DOUBLE PRECISION,
      lng             DOUBLE PRECISION,
      radius_meters   INTEGER NOT NULL DEFAULT 1000,
      active          BOOLEAN NOT NULL DEFAULT TRUE,
      notes           TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await q('table attendance', () => sql`
    CREATE TABLE IF NOT EXISTS attendance (
      id                  SERIAL PRIMARY KEY,
      employee_id         INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      date                DATE NOT NULL,
      status              TEXT NOT NULL,
      notes               TEXT,
      check_in_lat        DOUBLE PRECISION,
      check_in_lng        DOUBLE PRECISION,
      work_location_id    INTEGER REFERENCES work_locations(id) ON DELETE SET NULL,
      work_location_name  TEXT,
      distance_meters     INTEGER,
      vacation_id         INTEGER,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (employee_id, date)
    )
  `);

  await q('idx attendance', async () => {
    await sql`CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendance(employee_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date)`;
  });

  await q('table vacations', () => sql`
    CREATE TABLE IF NOT EXISTS vacations (
      id                    SERIAL PRIMARY KEY,
      employee_id           INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      work_days             INTEGER NOT NULL DEFAULT 0,
      vacation_days         INTEGER NOT NULL DEFAULT 0,
      vacation_type         TEXT NOT NULL DEFAULT 'اعتيادية',
      start_date            DATE,
      end_date              DATE,
      vacation_start_date   DATE,
      vacation_end_date     DATE,
      status                TEXT NOT NULL DEFAULT 'بانتظار الموافقة',
      notes                 TEXT,
      requested_by          INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      approved_by           INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await q('idx vacations', async () => {
    await sql`CREATE INDEX IF NOT EXISTS idx_vacations_employee ON vacations(employee_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_vacations_status ON vacations(status)`;
  });

  await q('table audit_logs', () => sql`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id              SERIAL PRIMARY KEY,
      actor_id        INTEGER,
      actor_name      TEXT,
      action          TEXT NOT NULL,
      entity_type     TEXT NOT NULL,
      entity_id       INTEGER,
      employee_id     INTEGER,
      employee_name   TEXT,
      date            DATE,
      old_value       TEXT,
      new_value       TEXT,
      notes           TEXT,
      device          TEXT,
      user_agent      TEXT,
      ip              TEXT,
      override        BOOLEAN DEFAULT FALSE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await q('idx audit', () => sql`CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC)`);

  await q('table month_locks', () => sql`
    CREATE TABLE IF NOT EXISTS month_locks (
      id              SERIAL PRIMARY KEY,
      year_month      TEXT NOT NULL UNIQUE,
      locked_by       INTEGER,
      locked_by_name  TEXT,
      locked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      notes           TEXT
    )
  `);

  await q('table check_in_attempts', () => sql`
    CREATE TABLE IF NOT EXISTS check_in_attempts (
      id                      SERIAL PRIMARY KEY,
      employee_id             INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      employee_name           TEXT,
      date                    DATE NOT NULL,
      status                  TEXT,
      success                 BOOLEAN NOT NULL DEFAULT FALSE,
      reason                  TEXT,
      lat                     DOUBLE PRECISION,
      lng                     DOUBLE PRECISION,
      nearest_location_id     INTEGER,
      nearest_location_name   TEXT,
      accepted_location_id    INTEGER,
      accepted_location_name  TEXT,
      distance_meters         INTEGER,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await q('idx attempts', async () => {
    await sql`CREATE INDEX IF NOT EXISTS idx_attempts_employee ON check_in_attempts(employee_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_attempts_date ON check_in_attempts(date)`;
  });

  await q('table notifications', () => sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id              SERIAL PRIMARY KEY,
      type            TEXT NOT NULL,
      title           TEXT NOT NULL,
      body            TEXT NOT NULL,
      employee_id     INTEGER,
      target_user_ids INTEGER[] NOT NULL DEFAULT '{}',
      read_by         INTEGER[] NOT NULL DEFAULT '{}',
      entity_type     TEXT,
      entity_id       INTEGER,
      severity        TEXT NOT NULL DEFAULT 'info',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await q('idx notifications', () => sql`CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC)`);

  await q('table settings', () => sql`
    CREATE TABLE IF NOT EXISTS settings (
      key             TEXT PRIMARY KEY,
      value           TEXT NOT NULL DEFAULT ''
    )
  `);

  await q('table sessions', () => sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id              TEXT PRIMARY KEY,
      employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at      TIMESTAMPTZ NOT NULL
    )
  `);

  await q('idx sessions', async () => {
    await sql`CREATE INDEX IF NOT EXISTS idx_sessions_employee ON sessions(employee_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)`;
  });

  console.log('2) Seeding defaults...');

  const adminHash = 'sha256:' + sha256('admin123');
  const settingsHash = 'sha256:' + sha256('settings123');

  await q('seed locations', async () => {
    await sql`
      INSERT INTO work_locations (id, name, lat, lng, radius_meters, active, notes)
      VALUES
        (1, 'NAIA BAY', 27.0574, 33.8129, 1000, true, 'موقع NAIA BAY'),
        (2, 'Beach 5', 27.0612, 33.8215, 1000, true, 'موقع بيتش 5')
      ON CONFLICT (id) DO NOTHING
    `;
    await sql`SELECT setval(pg_get_serial_sequence('work_locations','id'), (SELECT COALESCE(MAX(id),1) FROM work_locations))`;
  });

  await q('seed admin', async () => {
    await sql`
      INSERT INTO employees (
        id, name, username, job_title, phone, work_cycle, cycle_type, role, password,
        active, location_ids,
        can_view_dashboard, can_check_in, can_view_my_account, can_request_vacations,
        can_view_notifications, can_view_daily_review, can_view_attendance, can_edit_attendance,
        can_approve_vacations, can_view_reports, can_manage_employees, can_manage_settings,
        can_manage_locations, can_lock_months, can_view_audit_log
      ) VALUES (
        1, 'Eng Ahmed Salama', 'admin', 'مدير النظام', '01000000000', 12, 'graduated', 'admin', ${adminHash},
        true, ARRAY[1,2]::integer[],
        true, true, true, true,
        true, true, true, true,
        true, true, true, true,
        true, true, true
      )
      ON CONFLICT (username) DO UPDATE SET
        password = EXCLUDED.password,
        role = 'admin',
        active = true,
        can_view_dashboard = true,
        can_check_in = true,
        can_view_my_account = true,
        can_request_vacations = true,
        can_view_notifications = true,
        can_view_daily_review = true,
        can_view_attendance = true,
        can_edit_attendance = true,
        can_approve_vacations = true,
        can_view_reports = true,
        can_manage_employees = true,
        can_manage_settings = true,
        can_manage_locations = true,
        can_lock_months = true,
        can_view_audit_log = true,
        updated_at = NOW()
    `;
    await sql`SELECT setval(pg_get_serial_sequence('employees','id'), (SELECT COALESCE(MAX(id),1) FROM employees))`;
  });

  await q('seed settings', async () => {
    const settings = {
      department_name: 'قسم المساحة',
      work_radius: '1000',
      work_location_lat: '',
      work_location_lng: '',
      default_work_cycle: '12',
      stage1_days: '12',
      stage1_vacation: '3',
      annual_leave_balance: '21',
      footer_text: 'نظام إجازات قسم المساحة',
      settings_password: settingsHash,
    };
    for (const [key, value] of Object.entries(settings)) {
      await sql`
        INSERT INTO settings (key, value) VALUES (${key}, ${value})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `;
    }
  });

  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name
  `;
  console.log('3) Tables:', tables.map(t => t.table_name).join(', '));

  const emps = await sql`SELECT id, username, role FROM employees`;
  const locs = await sql`SELECT id, name FROM work_locations`;
  console.log('   Employees:', emps);
  console.log('   Locations:', locs);

  console.log('\n✅ Database ready!');
  console.log('   Login: admin / admin123');
}

run().catch(err => {
  console.error('❌ Setup failed:', err);
  process.exit(1);
});
