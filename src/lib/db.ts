import type { Employee, WorkLocation, AttendanceRecord, Vacation, Settings, AuditLog, CheckInAttempt, SystemNotification } from './types';
import { sha256 } from './crypto';

const PREFIX = 'vsys_';
const STORAGE_KEYS = {
  employees: PREFIX + 'employees',
  locations: PREFIX + 'locations',
  attendance: PREFIX + 'attendance',
  vacations: PREFIX + 'vacations',
  auditLogs: PREFIX + 'audit_logs',
  monthLocks: PREFIX + 'month_locks',
  checkInAttempts: PREFIX + 'check_in_attempts',
  notifications: PREFIX + 'notifications',
  settings: PREFIX + 'settings',
  currentUser: PREFIX + 'current_user',
};

function getItem<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : defaultValue;
  } catch { return defaultValue; }
}
function setItem<T>(key: string, value: T): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export async function _hashOnce(text: string): Promise<string> {
  return sha256(text);
}

export async function clearAllData() {
  Object.values(STORAGE_KEYS).forEach(k => { try { localStorage.removeItem(k); } catch {} });
  localStorage.removeItem('hr_session');
  localStorage.removeItem('vacation_system_initialized_v4');
}

export async function initializeData() {
  const shaAdmin = await sha256('admin123');

  let employees = getItem<Employee[]>(STORAGE_KEYS.employees, []);
  const adminExists = employees.some(e => e.username === 'admin');

  if (!adminExists) {
    await clearAllData();
    employees = [];
    const defaultAdmin: Employee = {
      id: 1, name: 'Eng Ahmed Salama', username: 'admin', jobTitle: 'مدير النظام',
      phone: '01000000000', workCycle: 12, cycleType: 'graduated', role: 'admin',
      password: 'sha256:' + shaAdmin,
      workLocationLat: null, workLocationLng: null, active: true, locationIds: [1, 2],
      canViewAttendance: true, canEditAttendance: true, canApproveVacations: true,
      canViewReports: true, canManageEmployees: true, canManageSettings: true,
      canManageLocations: true, canLockMonths: true, canViewAuditLog: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    setItem(STORAGE_KEYS.employees, [defaultAdmin]);
  } else {
    // Migrate plain-text passwords to hashed
    let migrated = false;
    for (const emp of employees) {
      if (emp.password && !emp.password.startsWith('sha256:') && emp.password.length < 100) {
        emp.password = 'sha256:' + await sha256(emp.password);
        migrated = true;
      }
    }
    if (migrated) {
      setItem(STORAGE_KEYS.employees, employees);
    }
    // Extra safety: if admin exists but password doesn't start with sha256:, force re-init
    const adminEmp = employees.find(e => e.username === 'admin');
    if (adminEmp && !adminEmp.password.startsWith('sha256:')) {
      // Admin has plain-text password — force clean re-init
      await clearAllData();
      const freshAdmin: Employee = {
        id: 1, name: 'Eng Ahmed Salama', username: 'admin', jobTitle: 'مدير النظام',
        phone: '01000000000', workCycle: 12, cycleType: 'graduated', role: 'admin',
        password: 'sha256:' + await sha256('admin123'),
        workLocationLat: null, workLocationLng: null, active: true, locationIds: [1, 2],
        canViewAttendance: true, canEditAttendance: true, canApproveVacations: true,
        canViewReports: true, canManageEmployees: true, canManageSettings: true,
        canManageLocations: true, canLockMonths: true, canViewAuditLog: true,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      setItem(STORAGE_KEYS.employees, [freshAdmin]);
    }
  }

  const locations = getItem<WorkLocation[]>(STORAGE_KEYS.locations, []);
  if (locations.length === 0) {
    const defaultLocations: WorkLocation[] = [
      { id: 1, name: 'Naya Bay', lat: 27.0574, lng: 33.8129, radiusMeters: 1000, active: true, notes: 'موقع نايا باي', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 2, name: 'Beach 5', lat: 27.0612, lng: 33.8215, radiusMeters: 1000, active: true, notes: 'موقع بيتش 5', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ];
    setItem(STORAGE_KEYS.locations, defaultLocations);
  }

  const settings = getItem<Partial<Settings>>(STORAGE_KEYS.settings, {});
  if (!settings.department_name) {
    const shaSettings = await sha256('settings123');
    const defaultSettings: Settings = {
      department_name: 'قسم المساحة', work_radius: '1000',
      work_location_lat: '', work_location_lng: '', default_work_cycle: '12',
      stage1_days: '12', stage1_vacation: '3', annual_leave_balance: '21',
      footer_text: 'نظام إجازات قسم المساحة', settings_password: 'sha256:' + shaSettings,
    };
    setItem(STORAGE_KEYS.settings, defaultSettings);
  }
}

export function getEmployees(): Employee[] { return getItem<Employee[]>(STORAGE_KEYS.employees, []); }
export function setEmployees(employees: Employee[]): void { setItem(STORAGE_KEYS.employees, employees); }
export function getEmployeeById(id: number): Employee | undefined { return getEmployees().find(e => e.id === id); }

export function addEmployee(employee: Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>): Employee {
  const employees = getEmployees();
  const newEmployee: Employee = {
    ...employee,
    id: Math.max(0, ...employees.map(e => e.id)) + 1,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  // Hash password if not already hashed
  if (newEmployee.password && !newEmployee.password.startsWith('sha256:')) {
    newEmployee.password = 'sha256:' + newEmployee.password; // Mark for hashing - will be hashed on login
  }
  setEmployees([...employees, newEmployee]);
  return newEmployee;
}

export async function addEmployeeAsync(employee: Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>): Promise<Employee> {
  const employees = getEmployees();
  let hashedPassword = employee.password;
  if (hashedPassword && !hashedPassword.startsWith('sha256:')) {
    hashedPassword = 'sha256:' + await sha256(hashedPassword);
  }
  const newEmployee: Employee = {
    ...employee, password: hashedPassword,
    id: Math.max(0, ...employees.map(e => e.id)) + 1,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  setEmployees([...employees, newEmployee]);
  return newEmployee;
}

export async function updateEmployee(id: number, updates: Partial<Employee>): Promise<Employee | null> {
  const employees = getEmployees();
  const index = employees.findIndex(e => e.id === id);
  if (index === -1) return null;
  if (updates.password && updates.password !== '' && !updates.password.startsWith('sha256:')) {
    updates.password = 'sha256:' + await sha256(updates.password);
  }
  if (updates.password === '') {
    // Empty password means don't change
    delete updates.password;
  }
  employees[index] = { ...employees[index], ...updates, updatedAt: new Date().toISOString() };
  setEmployees(employees);
  const cur = getCurrentUser();
  if (cur && cur.id === id) setCurrentUser(employees[index]);
  return employees[index];
}

export function deleteEmployee(id: number): boolean {
  const employees = getEmployees();
  const index = employees.findIndex(e => e.id === id);
  if (index === -1) return false;
  employees[index].active = false;
  setEmployees(employees);
  return true;
}

export function getLocations(): WorkLocation[] { return getItem<WorkLocation[]>(STORAGE_KEYS.locations, []); }
export function setLocations(locations: WorkLocation[]): void { setItem(STORAGE_KEYS.locations, locations); }

export function addLocation(location: Omit<WorkLocation, 'id' | 'createdAt' | 'updatedAt'>): WorkLocation {
  const locations = getLocations();
  const newLocation: WorkLocation = {
    ...location,
    id: Math.max(0, ...locations.map(l => l.id)) + 1,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  setLocations([...locations, newLocation]);
  return newLocation;
}

export function updateLocation(id: number, updates: Partial<WorkLocation>): WorkLocation | null {
  const locations = getLocations();
  const index = locations.findIndex(l => l.id === id);
  if (index === -1) return null;
  locations[index] = { ...locations[index], ...updates, updatedAt: new Date().toISOString() };
  setLocations(locations);
  return locations[index];
}

export function deleteLocation(id: number): boolean {
  const locs = getLocations();
  const filtered = locs.filter(l => l.id !== id);
  if (filtered.length === locs.length) return false;
  setLocations(filtered);
  return true;
}

export function getAttendance(): AttendanceRecord[] { return getItem<AttendanceRecord[]>(STORAGE_KEYS.attendance, []); }
export function setAttendance(attendance: AttendanceRecord[]): void { setItem(STORAGE_KEYS.attendance, attendance); }
export function getAttendanceByDateRange(startDate: string, endDate: string): AttendanceRecord[] {
  return getAttendance().filter(a => a.date >= startDate && a.date <= endDate);
}

export function upsertAttendance(record: any): AttendanceRecord {
  const attendance = getAttendance();
  const existingIndex = attendance.findIndex(a => a.employeeId === record.employeeId && a.date === record.date);
  if (existingIndex !== -1) {
    attendance[existingIndex] = { ...attendance[existingIndex], ...record, createdAt: attendance[existingIndex].createdAt || new Date().toISOString() };
    setAttendance(attendance);
    return attendance[existingIndex];
  }
  const newRecord: AttendanceRecord = {
    ...record,
    id: Math.max(0, ...attendance.map(a => a.id)) + 1,
    createdAt: new Date().toISOString(),
    notes: record.notes || null, checkInLat: record.checkInLat || null,
    checkInLng: record.checkInLng || null, workLocationId: record.workLocationId || null,
    workLocationName: record.workLocationName || null, distanceMeters: record.distanceMeters || null,
  } as AttendanceRecord;
  setAttendance([...attendance, newRecord]);
  return newRecord;
}

export function deleteAttendance(employeeId: number, date: string): boolean {
  const attendance = getAttendance();
  const filtered = attendance.filter(a => !(a.employeeId === employeeId && a.date === date));
  if (filtered.length === attendance.length) return false;
  setAttendance(filtered);
  return true;
}

export function getVacations(): Vacation[] { return getItem<Vacation[]>(STORAGE_KEYS.vacations, []); }
export function setVacations(vacations: Vacation[]): void { setItem(STORAGE_KEYS.vacations, vacations); }

export function addVacation(vacation: Omit<Vacation, 'id' | 'createdAt'>): Vacation {
  const vacations = getVacations();
  const newVacation: Vacation = {
    ...vacation,
    id: Math.max(0, ...vacations.map(v => v.id)) + 1,
    createdAt: new Date().toISOString(),
  };
  setVacations([...vacations, newVacation]);
  return newVacation;
}

export function updateVacation(id: number, updates: Partial<Vacation>): Vacation | null {
  const vacations = getVacations();
  const index = vacations.findIndex(v => v.id === id);
  if (index === -1) return null;
  vacations[index] = { ...vacations[index], ...updates };
  setVacations(vacations);
  return vacations[index];
}

export function deleteVacation(id: number): boolean {
  const vacations = getVacations();
  const filtered = vacations.filter(v => v.id !== id);
  if (filtered.length === vacations.length) return false;
  setVacations(filtered);
  return true;
}

export function getAuditLogs(): AuditLog[] { return getItem<AuditLog[]>(STORAGE_KEYS.auditLogs, []); }
export function getAuditLog(): AuditLog[] { return getAuditLogs(); }

function getDeviceName() {
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad/i.test(ua)) return 'iOS';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac/i.test(ua)) return 'Mac';
  return 'Browser';
}

export function addAuditLog(log: Omit<AuditLog, 'id' | 'createdAt'>): AuditLog {
  const logs = getAuditLogs();
  const newLog: AuditLog = {
    ...log,
    id: Math.max(0, ...logs.map(l => l.id)) + 1,
    device: log.device ?? getDeviceName(),
    userAgent: log.userAgent ?? navigator.userAgent ?? null,
    ip: log.ip ?? null,
    override: log.override ?? false,
    createdAt: new Date().toISOString()
  };
  setItem(STORAGE_KEYS.auditLogs, [...logs, newLog]);
  return newLog;
}

export function getSystemNotifications(): SystemNotification[] {
  return getItem<SystemNotification[]>(STORAGE_KEYS.notifications, []);
}

export function addSystemNotification(notification: Omit<SystemNotification, 'id' | 'createdAt' | 'readBy'> & { readBy?: number[] }): SystemNotification {
  const notifications = getSystemNotifications();
  const newNotification: SystemNotification = {
    ...notification,
    id: Math.max(0, ...notifications.map(n => n.id)) + 1,
    readBy: notification.readBy || [],
    createdAt: new Date().toISOString(),
  };
  setItem(STORAGE_KEYS.notifications, [...notifications, newNotification]);
  return newNotification;
}

export function markNotificationRead(id: number, userId: number) {
  const notifications = getSystemNotifications();
  const next = notifications.map(n => n.id === id ? { ...n, readBy: Array.from(new Set([...(n.readBy || []), userId])) } : n);
  setItem(STORAGE_KEYS.notifications, next);
}

export function getNotificationsForUser(userId: number): SystemNotification[] {
  return getSystemNotifications().filter(n => n.targetUserIds.includes(userId));
}

export function getMonthLocks(): any[] { return getItem<any[]>(STORAGE_KEYS.monthLocks, []); }
export function setMonthLocks(locks: any[]): void { setItem(STORAGE_KEYS.monthLocks, locks); }

export function lockMonth(yearMonth: string, userId: number, userName: string) {
  const locks = getMonthLocks();
  const existing = locks.find((l: any) => l.yearMonth === yearMonth);
  if (existing) { existing.lockedBy = userId; existing.lockedByName = userName; existing.lockedAt = new Date().toISOString(); setMonthLocks(locks); return existing; }
  const newLock = { id: Math.max(0, ...locks.map((l: any) => l.id)) + 1, yearMonth, lockedBy: userId, lockedByName: userName, lockedAt: new Date().toISOString(), notes: null };
  setMonthLocks([...locks, newLock]); return newLock;
}

export function unlockMonth(yearMonth: string): boolean {
  const locks = getMonthLocks();
  const filtered = locks.filter((l: any) => l.yearMonth !== yearMonth);
  if (filtered.length === locks.length) return false;
  setMonthLocks(filtered); return true;
}

export function isMonthLocked(yearMonth: string): boolean { return getMonthLocks().some((l: any) => l.yearMonth === yearMonth); }

export function getCheckInAttempts(): CheckInAttempt[] { return getItem<CheckInAttempt[]>(STORAGE_KEYS.checkInAttempts, []); }
export function addCheckInAttempt(attempt: Omit<CheckInAttempt, 'id' | 'createdAt'>): CheckInAttempt {
  const attempts = getCheckInAttempts();
  const newAttempt: CheckInAttempt = { ...attempt, id: Math.max(0, ...attempts.map(a => a.id)) + 1, createdAt: new Date().toISOString() } as CheckInAttempt;
  setItem(STORAGE_KEYS.checkInAttempts, [...attempts, newAttempt]);
  return newAttempt;
}

export function getSettings(): Settings {
  return getItem<Settings>(STORAGE_KEYS.settings, {
    department_name: 'قسم المساحة', work_radius: '1000', work_location_lat: '',
    work_location_lng: '', default_work_cycle: '12', stage1_days: '12',
    stage1_vacation: '3', annual_leave_balance: '21',
    footer_text: 'نظام إجازات قسم المساحة', settings_password: '',
  } as Settings);
}

export function updateSettings(updates: Partial<Settings>): Settings {
  const settings = getSettings();
  const updated = { ...settings, ...updates };
  setItem(STORAGE_KEYS.settings, updated);
  return updated;
}

export function getCurrentUser(): Employee | null { return getItem<Employee | null>(STORAGE_KEYS.currentUser, null); }
export function setCurrentUser(user: Employee | null): void {
  setItem(STORAGE_KEYS.currentUser, user);
  if (user) localStorage.setItem('hr_session', JSON.stringify(user));
}

export async function login(username: string, password: string): Promise<Employee | null> {
  const employees = getEmployees();
  const passwordHash = 'sha256:' + await sha256(password);
  const loginValue = username.trim();
  const normalizedPhone = loginValue.replace(/\s|-/g, '');
  const employee = employees.find(e => {
    const empPhone = (e.phone || '').replace(/\s|-/g, '');
    const matchesUsername = e.username === loginValue;
    const matchesPhone = empPhone !== '' && empPhone === normalizedPhone;
    return (matchesUsername || matchesPhone) && e.password === passwordHash && e.active;
  });
  if (employee) {
    setCurrentUser(employee);
    return employee;
  }
  return null;
}

export function logout(): void { setCurrentUser(null); localStorage.removeItem('hr_session'); }

export function refreshCurrentSession(): Employee | null {
  const current = getCurrentUser();
  if (!current) return null;
  const fresh = getEmployeeById(current.id);
  if (!fresh || !fresh.active) { setCurrentUser(null); return null; }
  setCurrentUser(fresh); return fresh;
}

function vacationTypeToAttendanceStatus(type: string | null): string {
  switch (type) {
    case 'عارضة': case 'عارضة إجازة': case 'إجازة عارضة': return 'عارضة إجازة';
    case 'رسمية': case 'إجازة رسمية': return 'إجازة رسمية';
    case 'سنوية': case 'إجازة سنوية': return 'إجازة سنوية';
    case 'مرضية': case 'إجازة مرضية': return 'إجازة مرضية';
    case 'بدون مرتب': return 'بدون مرتب';
    default: return 'إجازة اعتيادية';
  }
}

function listDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return [];
  for (let d = new Date(s); d <= e && dates.length < 120; d.setDate(d.getDate() + 1)) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    dates.push(iso);
  }
  return dates;
}

export function syncVacationToAttendance(vacation: Vacation): { synced: number; skipped: number } {
  const start = vacation.vacationStartDate || vacation.startDate;
  const end = vacation.vacationEndDate || vacation.endDate;
  if (!start || !end) return { synced: 0, skipped: 0 };
  const dates = listDates(start, end);
  const status = vacationTypeToAttendanceStatus(vacation.vacationType);
  const marker = `AUTO_VACATION:${vacation.id}`;
  let synced = 0; let skipped = 0;
  for (const date of dates) {
    const attendance = getAttendance();
    const existing = attendance.find(a => a.employeeId === vacation.employeeId && a.date === date);
    if (existing && !existing.notes?.startsWith('AUTO_VACATION:')) { skipped++; continue; }
    upsertAttendance({ employeeId: vacation.employeeId, date, status, notes: marker, checkInLat: null, checkInLng: null, workLocationId: null, workLocationName: null, distanceMeters: null });
    synced++;
  }
  return { synced, skipped };
}

export function clearVacationFromAttendance(vacationId: number): number {
  const attendance = getAttendance();
  const marker = `AUTO_VACATION:${vacationId}`;
  const filtered = attendance.filter(a => a.notes !== marker);
  const removed = attendance.length - filtered.length;
  if (removed > 0) setAttendance(filtered);
  return removed;
}

export function getStorageInfo(): { used: number; limit: number; percentage: number } {
  let used = 0;
  for (const key of Object.values(STORAGE_KEYS)) {
    const item = localStorage.getItem(key);
    if (item) used += item.length * 2;
  }
  const limit = 5 * 1024 * 1024;
  return { used, limit, percentage: Math.round((used / limit) * 100) };
}
