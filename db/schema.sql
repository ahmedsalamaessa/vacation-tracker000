-- نظام إدارة الإجازات • قسم المساحة
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS employees (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  username        TEXT NOT NULL UNIQUE,
  job_title       TEXT,
  phone           TEXT,
  work_cycle      INTEGER NOT NULL DEFAULT 12,
  cycle_type      TEXT NOT NULL DEFAULT 'graduated' CHECK (cycle_type IN ('fixed', 'variable', 'graduated')),
  role            TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'manager', 'employee')),
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
);

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
);

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
);

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
);

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
);

CREATE TABLE IF NOT EXISTS month_locks (
  id              SERIAL PRIMARY KEY,
  year_month      TEXT NOT NULL UNIQUE,
  locked_by       INTEGER,
  locked_by_name  TEXT,
  locked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes           TEXT
);

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
);

CREATE TABLE IF NOT EXISTS notifications (
  id              SERIAL PRIMARY KEY,
  type            TEXT NOT NULL,
  title            TEXT NOT NULL,
  body            TEXT NOT NULL,
  employee_id     INTEGER,
  target_user_ids INTEGER[] NOT NULL DEFAULT '{}',
  read_by         INTEGER[] NOT NULL DEFAULT '{}',
  entity_type     TEXT,
  entity_id       INTEGER,
  severity        TEXT NOT NULL DEFAULT 'info',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,
  employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL
);
