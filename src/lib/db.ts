import type {
  Employee,
  WorkLocation,
  AttendanceRecord,
  Vacation,
  Settings,
  AuditLog,
  CheckInAttempt,
  SystemNotification,
  Equipment,
  EquipmentCheckout,
} from './types';
import { sha256 } from './crypto';
import { api, probeRemote, remoteAvailable } from './api';

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
  equipment: PREFIX + 'equipment',
  equipmentCheckouts: PREFIX + 'equipment_checkouts',
};

function getItem<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setItem<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export async function hashOnce(text: string): Promise<string> {
  return sha256(text);
}

export async function clearAllData() {
  Object.values(STORAGE_KEYS).forEach(k => {
    try {
      localStorage.removeItem(k);
    } catch {}
  });
  localStorage.removeItem('hr_session');
  localStorage.removeItem('vacation_system_initialized_v4');
  localStorage.removeItem('vsys_session_id');
}

export async function refreshFromRemote(): Promise<any> {
  try {
    const remote = remoteAvailable() || (await probeRemote());
    if (!remote) return false;
    const data = await api.bootstrap();
    if (data.employees) setItem(STORAGE_KEYS.employees, data.employees);
    if (data.locations) setItem(STORAGE_KEYS.locations, data.locations);
    if (data.attendance) setItem(STORAGE_KEYS.attendance, data.attendance);
    if (data.vacations) setItem(STORAGE_KEYS.vacations, data.vacations);
    if (data.auditLogs) setItem(STORAGE_KEYS.auditLogs, data.auditLogs);
    if (data.monthLocks) setItem(STORAGE_KEYS.monthLocks, data.monthLocks);
    if (data.checkInAttempts) setItem(STORAGE_KEYS.checkInAttempts, data.checkInAttempts);
    if (data.notifications) setItem(STORAGE_KEYS.notifications, data.notifications);
    if (data.settings) setItem(STORAGE_KEYS.settings, data.settings);
    const d = data as any; // (الجديد فقط — القديم سيبانه زي ما هو)
    if (d.equipment) setItem(STORAGE_KEYS.equipment, d.equipment);
    if (d.equipmentCheckouts) setItem(STORAGE_KEYS.equipmentCheckouts, d.equipmentCheckouts);
    return data;
  } catch (e) {
    console.warn('refreshFromRemote failed', e);
    return false;
  }
}

// 💾 استيراد نسخة احتياطية محلية — بنفس مفاتيح التخزين الصحيحة
// (إصلاح: كانت الاستعادة بتكتب في مفاتيح vacation_system_* القديمة
//  بينما النظام بيقرأ من vsys_* فكانت الاستعادة بتفشل بصمت)
export function importLocalData(data: any) {
  if (data.employees) setItem(STORAGE_KEYS.employees, data.employees);
  if (data.locations) setItem(STORAGE_KEYS.locations, data.locations);
  if (data.attendance) setItem(STORAGE_KEYS.attendance, data.attendance);
  if (data.vacations) setItem(STORAGE_KEYS.vacations, data.vacations);
  if (data.auditLogs) setItem(STORAGE_KEYS.auditLogs, data.auditLogs);
  if (data.monthLocks) setItem(STORAGE_KEYS.monthLocks, data.monthLocks);
  if (data.checkInAttempts) setItem(STORAGE_KEYS.checkInAttempts, data.checkInAttempts);
  if (data.notifications) setItem(STORAGE_KEYS.notifications, data.notifications);
  if (data.settings) setItem(STORAGE_KEYS.settings, data.settings);
  if (data.equipment) setItem(STORAGE_KEYS.equipment, data.equipment);
  if (data.equipmentCheckouts) setItem(STORAGE_KEYS.equipmentCheckouts, data.equipmentCheckouts);
}

export async function initializeData() {
  // 🔁 ترحيل محلي: توحيد الحالة القديمة "إجازة عارضة" → "عارضة إجازة"
  // (بيانات السيرفر بتتوحد تلقائيًا في mapAttendance عند القراءة)
  try {
    const attLegacy = getItem<any[]>(STORAGE_KEYS.attendance, []);
    let legacyChanged = false;
    for (const a of attLegacy) {
      if (a && a.status === 'إجازة عارضة') {
        a.status = 'عارضة إجازة';
        legacyChanged = true;
      }
    }
    if (legacyChanged) setItem(STORAGE_KEYS.attendance, attLegacy);
  } catch {}

  const remote = await probeRemote();
  if (remote) {
    try {
      await refreshFromRemote();
      return;
    } catch (e) {
      console.warn('Remote bootstrap failed, falling back to local', e);
    }
  }

  const shaAdmin = await sha256('admin123');
  let employees = getItem<Employee[]>(STORAGE_KEYS.employees, []);
  const adminExists = employees.some(e => e.username === 'admin');
  
  if (!adminExists) {
    await clearAllData();
    employees = [];
    const defaultAdmin: Employee = {
      id: 1,
      name: 'Eng Ahmed Salama',
      username: 'admin',
      jobTitle: 'مدير النظام',
      phone: '01000000000',
      workCycle: 12,
      cycleType: 'graduated',
      role: 'admin',
      password: 'sha256:' + shaAdmin,
      workLocationLat: null,
      workLocationLng: null,
      active: true,
      locationIds: [1, 2],
      canViewAttendance: true,
      canEditAttendance: true,
      canApproveVacations: true,
      canViewReports: true,
      canManageEmployees: true,
      canManageSettings: true,
      canManageLocations: true,
      canLockMonths: true,
      canViewAuditLog: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setItem(STORAGE_KEYS.employees, [defaultAdmin]);
  } else {
    let migrated = false;
    for (const emp of employees) {
      if (emp.password && !emp.password.startsWith('sha256:') && emp.password.length < 100) {
        emp.password = 'sha256:' + (await sha256(emp.password));
        migrated = true;
      }
    }
    if (migrated) {
      setItem(STORAGE_KEYS.employees, employees);
    }
    const adminEmp = employees.find(e => e.username === 'admin');
    if (adminEmp && !adminEmp.password.startsWith('sha256:')) {
      await clearAllData();
      const freshAdmin: Employee = {
        id: 1,
        name: 'Eng Ahmed Salama',
        username: 'admin',
        jobTitle: 'مدير النظام',
        phone: '01000000000',
        workCycle: 12,
        cycleType: 'graduated',
        role: 'admin',
        password: 'sha256:' + (await sha256('admin123')),
        workLocationLat: null,
        workLocationLng: null,
        active: true,
        locationIds: [1, 2],
        canViewAttendance: true,
        canEditAttendance: true,
        canApproveVacations: true,
        canViewReports: true,
        canManageEmployees: true,
        canManageSettings: true,
        canManageLocations: true,
        canLockMonths: true,
        canViewAuditLog: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setItem(STORAGE_KEYS.employees, [freshAdmin]);
    }
  }

  const locations = getItem<WorkLocation[]>(STORAGE_KEYS.locations, []);
  if (locations.length === 0) {
    const defaultLocations: WorkLocation[] = [
      {
        id: 1,
        name: 'NAIA BAY',  // 🔧 تم تغيير الاسم من "Naya Bay"
        lat: 27.0574,
        lng: 33.8129,
        radiusMeters: 1000,
        active: true,
        notes: 'موقع NAIA BAY',  // 🔧 تحديث الملاحظة
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 2,
        name: 'Beach 5',
        lat: 27.0612,
        lng: 33.8215,
        radiusMeters: 1000,
        active: true,
        notes: 'موقع بيتش 5',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    setItem(STORAGE_KEYS.locations, defaultLocations);
  }

  const settings = getItem<Partial<Settings>>(STORAGE_KEYS.settings, {});
  if (!settings.department_name) {
    const shaSettings = await sha256('settings123');
    const defaultSettings: Settings = {
      department_name: 'قسم المساحة',
      work_radius: '1000',
      work_location_lat: '',
      work_location_lng: '',
      default_work_cycle: '12',
      stage1_days: '12',
      stage1_vacation: '3',
      annual_leave_balance: '21',
      footer_text: 'نظام إجازات قسم المساحة',
      settings_password: 'sha256:' + shaSettings,
    };
    setItem(STORAGE_KEYS.settings, defaultSettings);
  }
}

export function getEmployees(): Employee[] {
  return getItem<Employee[]>(STORAGE_KEYS.employees, []);
}

export function setEmployees(employees: Employee[]): void {
  setItem(STORAGE_KEYS.employees, employees);
}

export function getEmployeeById(id: number): Employee | undefined {
  return getEmployees().find(e => e.id === id);
}

export function addEmployee(employee: Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>): Employee {
  const employees = getEmployees();
  const newEmployee: Employee = {
    ...employee,
    id: Math.max(0, ...employees.map(e => e.id)) + 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (newEmployee.password && !newEmployee.password.startsWith('sha256:')) {
    newEmployee.password = 'sha256:' + newEmployee.password;
  }
  setEmployees([...employees, newEmployee]);
  return newEmployee;
}

export async function addEmployeeAsync(
  employee: Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<Employee> {
  if (remoteAvailable()) {
    try {
      const created = await api.addEmployee(employee);
      const employees = getEmployees();
      setEmployees([...employees.filter(e => e.id !== created.id), created]);
      return created;
    } catch (e) {
      console.warn('remote addEmployee failed', e);
    }
  }
  const employees = getEmployees();
  let hashedPassword = employee.password;
  if (hashedPassword && !hashedPassword.startsWith('sha256:')) {
    hashedPassword = 'sha256:' + (await sha256(hashedPassword));
  }
  const newEmployee: Employee = {
    ...employee,
    password: hashedPassword,
    id: Math.max(0, ...employees.map(e => e.id)) + 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  setEmployees([...employees, newEmployee]);
  return newEmployee;
}

export async function updateEmployee(id: number, updates: Partial<Employee>): Promise<Employee | null> {
  if (remoteAvailable()) {
    try {
      const updated = await api.updateEmployee(id, updates);
      const employees = getEmployees();
      const index = employees.findIndex(e => e.id === id);
      if (index !== -1) {
        employees[index] = { ...employees[index], ...updated };
        setEmployees(employees);
        const cur = getCurrentUser();
        if (cur && cur.id === id) setCurrentUser(employees[index]);
      }
      return updated;
    } catch (e) {
      console.warn('remote updateEmployee failed', e);
    }
  }
  const employees = getEmployees();
  const index = employees.findIndex(e => e.id === id);
  if (index === -1) return null;
  if (updates.password && updates.password !== '' && !updates.password.startsWith('sha256:')) {
    updates.password = 'sha256:' + (await sha256(updates.password));
  }
  if (updates.password === '') {
    delete updates.password;
  }
  employees[index] = { ...employees[index], ...updates, updatedAt: new Date().toISOString() };
  setEmployees(employees);
  const cur = getCurrentUser();
  if (cur && cur.id === id) setCurrentUser(employees[index]);
  return employees[index];
}

export function deleteEmployee(id: number): boolean {
  if (remoteAvailable()) {
    api.deleteEmployee(id).catch(e => console.warn('remote deleteEmployee', e));
  }
  const employees = getEmployees();
  const index = employees.findIndex(e => e.id === id);
  if (index === -1) return false;
  employees[index].active = false;
  setEmployees(employees);
  return true;
}

export function getLocations(): WorkLocation[] {
  return getItem<WorkLocation[]>(STORAGE_KEYS.locations, []);
}

export function setLocations(locations: WorkLocation[]): void {
  setItem(STORAGE_KEYS.locations, locations);
}

export function addLocation(location: Omit<WorkLocation, 'id' | 'createdAt' | 'updatedAt'>): WorkLocation {
  const locations = getLocations();
  const newLocation: WorkLocation = {
    ...location,
    id: Math.max(0, ...locations.map(l => l.id)) + 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  setLocations([...locations, newLocation]);
  if (remoteAvailable()) {
    api.addLocation(location).then(created => {
      const locs = getLocations().map(l => (l.id === newLocation.id ? { ...created } : l));
      if (!locs.find(l => l.id === created.id)) setLocations([...getLocations().filter(l => l.id !== newLocation.id), created]);
      else setLocations(getLocations().map(l => (l.name === created.name ? created : l)));
    }).catch(e => console.warn('remote addLocation', e));
  }
  return newLocation;
}

export function updateLocation(id: number, updates: Partial<WorkLocation>): WorkLocation | null {
  const locations = getLocations();
  const index = locations.findIndex(l => l.id === id);
  if (index === -1) return null;
  locations[index] = { ...locations[index], ...updates, updatedAt: new Date().toISOString() };
  setLocations(locations);
  if (remoteAvailable()) {
    api.updateLocation(id, updates).catch(e => console.warn('remote updateLocation', e));
  }
  return locations[index];
}

export function deleteLocation(id: number): boolean {
  if (remoteAvailable()) {
    api.deleteLocation(id).catch(e => console.warn('remote deleteLocation', e));
  }
  const locs = getLocations();
  const filtered = locs.filter(l => l.id !== id);
  if (filtered.length === locs.length) return false;
  setLocations(filtered);
  return true;
}

export function getAttendance(): AttendanceRecord[] {
  const rows = getItem<AttendanceRecord[]>(STORAGE_KEYS.attendance, []);
  return rows.map(r => ({
    ...r,
    date: r.date ? String(r.date).slice(0, 10) : r.date,
  }));
}

export function setAttendance(attendance: AttendanceRecord[]): void {
  setItem(STORAGE_KEYS.attendance, attendance);
}

export function getAttendanceByDateRange(startDate: string, endDate: string): AttendanceRecord[] {
  return getAttendance().filter(a => a.date >= startDate && a.date <= endDate);
}

export function upsertAttendance(record: any): AttendanceRecord {
  if (record.date) record.date = String(record.date).slice(0, 10);
  const attendance = getAttendance();
  const existingIndex = attendance.findIndex(
    a => a.employeeId === record.employeeId && String(a.date).slice(0, 10) === record.date,
  );
  let result: AttendanceRecord;
  if (existingIndex !== -1) {
    attendance[existingIndex] = {
      ...attendance[existingIndex],
      ...record,
      createdAt: attendance[existingIndex].createdAt || new Date().toISOString(),
    };
    setAttendance(attendance);
    result = attendance[existingIndex];
  } else {
    const newRecord: AttendanceRecord = {
      ...record,
      id: Math.max(0, ...attendance.map(a => a.id)) + 1,
      createdAt: new Date().toISOString(),
      notes: record.notes || null,
      checkInLat: record.checkInLat || null,
      checkInLng: record.checkInLng || null,
      workLocationId: record.workLocationId || null,
      workLocationName: record.workLocationName || null,
      distanceMeters: record.distanceMeters || null,
    } as AttendanceRecord;
    setAttendance([...attendance, newRecord]);
    result = newRecord;
  }
  if (remoteAvailable()) {
    api
      .upsertAttendance(record)
      .then(async saved => {
        const att = getAttendance();
        const idx = att.findIndex(
          a => a.employeeId === saved.employeeId && String(saved.date).slice(0, 10) === String(a.date).slice(0, 10),
        );
        if (idx !== -1) {
          att[idx] = { ...att[idx], ...saved, date: String(saved.date).slice(0, 10) };
          setAttendance(att);
        }
      })
      .catch(e => console.warn('remote upsertAttendance', e));
  }
  return result;
}

export function deleteAttendance(employeeId: number, date: string): boolean {
  if (remoteAvailable()) {
    api.deleteAttendance(employeeId, date).catch(e => console.warn('remote deleteAttendance', e));
  }
  const attendance = getAttendance();
  const filtered = attendance.filter(a => !(a.employeeId === employeeId && a.date === date));
  if (filtered.length === attendance.length) return false;
  setAttendance(filtered);
  return true;
}

export function getVacations(): Vacation[] {
  return getItem<Vacation[]>(STORAGE_KEYS.vacations, []);
}

export function setVacations(vacations: Vacation[]): void {
  setItem(STORAGE_KEYS.vacations, vacations);
}

export function addVacation(vacation: Omit<Vacation, 'id' | 'createdAt'>): Vacation {
  const vacations = getVacations();
  const newVacation: Vacation = {
    ...vacation,
    id: Math.max(0, ...vacations.map(v => v.id)) + 1,
    createdAt: new Date().toISOString(),
  };
  setVacations([...vacations, newVacation]);
  if (remoteAvailable()) {
    api.addVacation(vacation).then(created => {
      const list = getVacations().map(v =>
        v.id === newVacation.id && v.createdAt === newVacation.createdAt ? created : v,
      );
      if (!list.find(v => v.id === created.id)) {
        setVacations([...getVacations().filter(v => v !== newVacation), created]);
      } else {
        setVacations(getVacations().map(v => (v.id === created.id ? created : v)));
      }
    }).catch(e => console.warn('remote addVacation', e));
  }
  return newVacation;
}

export function updateVacation(id: number, updates: Partial<Vacation>): Vacation | null {
  const vacations = getVacations();
  const index = vacations.findIndex(v => v.id === id);
  if (index === -1) return null;
  vacations[index] = { ...vacations[index], ...updates };
  setVacations(vacations);
  if (remoteAvailable()) {
    api.updateVacation(id, updates).catch(e => console.warn('remote updateVacation', e));
  }
  return vacations[index];
}

export async function updateVacationAsync(
  id: number,
  updates: Partial<Vacation>,
): Promise<Vacation | null> {
  if (remoteAvailable()) {
    try {
      const updated = await api.updateVacation(id, updates);
      const list = getVacations();
      const i = list.findIndex(v => v.id === id);
      if (i !== -1) {
        list[i] = { ...list[i], ...updated };
        setVacations(list);
      }
      return list[i] || updated;
    } catch (e) {
      console.warn('remote updateVacationAsync failed', e);
    }
  }
  const vacations = getVacations();
  const index = vacations.findIndex(v => v.id === id);
  if (index === -1) return null;
  vacations[index] = { ...vacations[index], ...updates };
  setVacations(vacations);
  return vacations[index];
}

export function deleteVacation(id: number): boolean {
  if (remoteAvailable()) {
    api.deleteVacation(id).catch(e => console.warn('remote deleteVacation', e));
  }
  const vacations = getVacations();
  const filtered = vacations.filter(v => v.id !== id);
  if (filtered.length === vacations.length) return false;
  setVacations(filtered);
  return true;
}

export function getAuditLogs(): AuditLog[] {
  return getItem<AuditLog[]>(STORAGE_KEYS.auditLogs, []);
}

export function getAuditLog(): AuditLog[] {
  return getAuditLogs();
}

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
    createdAt: new Date().toISOString(),
  };
  setItem(STORAGE_KEYS.auditLogs, [...logs, newLog]);
  if (remoteAvailable()) {
    api.addAuditLog(newLog).catch(e => console.warn('remote addAuditLog', e));
  }
  return newLog;
}

export function getSystemNotifications(): SystemNotification[] {
  return getItem<SystemNotification[]>(STORAGE_KEYS.notifications, []);
}

export function addSystemNotification(
  notification: Omit<SystemNotification, 'id' | 'createdAt' | 'readBy'> & { readBy?: number[] },
): SystemNotification {
  const notifications = getSystemNotifications();
  const newNotification: SystemNotification = {
    ...notification,
    id: Math.max(0, ...notifications.map(n => n.id)) + 1,
    readBy: notification.readBy || [],
    createdAt: new Date().toISOString(),
  };
  setItem(STORAGE_KEYS.notifications, [...notifications, newNotification]);
  if (remoteAvailable()) {
    api.addNotification(notification).catch(e => console.warn('remote addNotification', e));
  }
  return newNotification;
}

export function markNotificationRead(id: number, userId: number) {
  const notifications = getSystemNotifications();
  const next = notifications.map(n =>
    n.id === id ? { ...n, readBy: Array.from(new Set([...(n.readBy || []), userId])) } : n,
  );
  setItem(STORAGE_KEYS.notifications, next);
}

export function getNotificationsForUser(userId: number): SystemNotification[] {
  return getSystemNotifications().filter(n => n.targetUserIds.includes(userId));
}

export function getMonthLocks(): any[] {
  return getItem<any[]>(STORAGE_KEYS.monthLocks, []);
}

export function setMonthLocks(locks: any[]): void {
  setItem(STORAGE_KEYS.monthLocks, locks);
}

export function lockMonth(yearMonth: string, userId: number, userName: string) {
  const locks = getMonthLocks();
  const existing = locks.find((l: any) => l.yearMonth === yearMonth);
  if (existing) {
    existing.lockedBy = userId;
    existing.lockedByName = userName;
    existing.lockedAt = new Date().toISOString();
    setMonthLocks(locks);
    if (remoteAvailable()) {
      api.lockMonth({ yearMonth, lockedBy: userId, lockedByName: userName }).catch(() => {});
    }
    return existing;
  }
  const newLock = {
    id: Math.max(0, ...locks.map((l: any) => l.id)) + 1,
    yearMonth,
    lockedBy: userId,
    lockedByName: userName,
    lockedAt: new Date().toISOString(),
    notes: null,
  };
  setMonthLocks([...locks, newLock]);
  if (remoteAvailable()) {
    api.lockMonth({ yearMonth, lockedBy: userId, lockedByName: userName }).catch(() => {});
  }
  return newLock;
}

export function unlockMonth(yearMonth: string): boolean {
  if (remoteAvailable()) {
    api.unlockMonth(yearMonth).catch(e => console.warn('remote unlockMonth', e));
  }
  const locks = getMonthLocks();
  const filtered = locks.filter(l => l.yearMonth !== yearMonth);
  if (filtered.length === locks.length) return false;
  setMonthLocks(filtered);
  return true;
}

export function isMonthLocked(yearMonth: string): boolean {
  return getMonthLocks().some(l => l.yearMonth === yearMonth);
}

export function getCheckInAttempts(): CheckInAttempt[] {
  return getItem<CheckInAttempt[]>(STORAGE_KEYS.checkInAttempts, []);
}

export function addCheckInAttempt(attempt: Omit<CheckInAttempt, 'id' | 'createdAt'>): CheckInAttempt {
  const attempts = getCheckInAttempts();
  const newAttempt: CheckInAttempt = {
    ...attempt,
    id: Math.max(0, ...attempts.map(a => a.id)) + 1,
    createdAt: new Date().toISOString(),
  } as CheckInAttempt;
  setItem(STORAGE_KEYS.checkInAttempts, [...attempts, newAttempt]);
  if (remoteAvailable()) {
    api.addAttempt(attempt).catch(e => console.warn('remote addAttempt', e));
  }
  return newAttempt;
}

// 🧹 حذف البصمات القديمة — محليًا وعلى السيرفر
// (إصلاح: زرار التشخيصات كان بيكتب في مفتاح vacation_system_* الميت
//  فمكانشي بيحذف حاجة، وحتى لو حذف كان السيرفر بيرجّعها مع أول bootstrap)
export function cleanOldCheckInAttempts(days: number, failedOnly = false): number {
  const attempts = getCheckInAttempts();
  const cutoff = Date.now() - days * 86400000;
  const kept = attempts.filter(a =>
    (failedOnly ? a.success : false) || new Date(a.createdAt).getTime() > cutoff
  );
  const removed = attempts.length - kept.length;
  if (removed > 0) {
    setItem(STORAGE_KEYS.checkInAttempts, kept);
    if (remoteAvailable()) {
      api.deleteAttemptsOlderThan(days, failedOnly).catch(e => console.warn('remote deleteAttempts', e));
    }
  }
  return removed;
}

// 🧹 إزالة تكرار سجلات الحضور المحلية
// (السيرفر بيعمل upsert على employee_id+date فمستحيل يتكرر هناك — التكرار محلي بس)
export function dedupeAttendance(): number {
  const attendance = getItem<any[]>(STORAGE_KEYS.attendance, []);
  const seen = new Set<string>();
  const unique: any[] = [];
  for (const a of attendance) {
    const key = `${a.employeeId}-${a.date}`;
    if (!seen.has(key)) { seen.add(key); unique.push(a); }
  }
  const removed = attendance.length - unique.length;
  if (removed > 0) setItem(STORAGE_KEYS.attendance, unique);
  return removed;
}

export function getSettings(): Settings {
  return getItem<Settings>(STORAGE_KEYS.settings, {
    department_name: 'قسم المساحة',
    work_radius: '1000',
    work_location_lat: '',
    work_location_lng: '',
    default_work_cycle: '12',
    stage1_days: '12',
    stage1_vacation: '3',
    annual_leave_balance: '21',
    footer_text: 'نظام إجازات قسم المساحة',
    settings_password: '',
  } as Settings);
}

export function updateSettings(updates: Partial<Settings>): Settings {
  const settings = getSettings();
  const updated = { ...settings, ...updates };
  setItem(STORAGE_KEYS.settings, updated);
  if (remoteAvailable()) {
    const payload: Record<string, string> = {};
    for (const [k, v] of Object.entries(updates)) {
      if (v !== undefined) payload[k] = String(v);
    }
    api.updateSettings(payload).catch(e => console.warn('remote updateSettings', e));
  }
  return updated;
}

export function getCurrentUser(): Employee | null {
  return getItem<Employee | null>(STORAGE_KEYS.currentUser, null);
}

export function setCurrentUser(user: Employee | null): void {
  setItem(STORAGE_KEYS.currentUser, user);
  if (user) localStorage.setItem('hr_session', JSON.stringify(user));
}

export async function login(username: string, password: string): Promise<Employee | null> {
  if (remoteAvailable() || (await probeRemote())) {
    try {
      const { user, sessionId } = await api.login(username, password);
      if (user) {
        localStorage.setItem('vsys_session_id', sessionId);
        setCurrentUser(user);
        try {
          const data = await api.bootstrap();
          if (data.employees) setItem(STORAGE_KEYS.employees, data.employees);
          if (data.locations) setItem(STORAGE_KEYS.locations, data.locations);
          if (data.attendance) setItem(STORAGE_KEYS.attendance, data.attendance);
          if (data.vacations) setItem(STORAGE_KEYS.vacations, data.vacations);
        } catch {}
        return user;
      }
    } catch (e) {
      console.warn('remote login failed, trying local', e);
    }
  }
  const employees = getEmployees();
  const passwordHash = 'sha256:' + (await sha256(password));
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

export function logout(): void {
  setCurrentUser(null);
  localStorage.removeItem('hr_session');
  localStorage.removeItem('vsys_session_id');
}

export function refreshCurrentSession(): Employee | null {
  const current = getCurrentUser();
  if (!current) return null;
  const fresh = getEmployeeById(current.id);
  if (!fresh || !fresh.active) {
    setCurrentUser(null);
    return null;
  }
  setCurrentUser(fresh);
  return fresh;
}

function vacationTypeToAttendanceStatus(type: string | null): string {
  switch (type) {
    case 'عارضة':
    case 'عارضة إجازة':
    case 'إجازة عارضة':
      return 'عارضة إجازة';
    case 'رسمية':
    case 'إجازة رسمية':
      return 'إجازة رسمية';
    case 'سنوية':
    case 'إجازة سنوية':
      return 'إجازة سنوية';
    case 'مرضية':
    case 'إجازة مرضية':
      return 'إجازة مرضية';
    case 'بدون مرتب':
      return 'بدون مرتب';
    case 'بدل سهرة':
      return 'بدل سهرة';
    default:
      return 'إجازة اعتيادية';
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

export function syncVacationToAttendance(
  vacation: Vacation,
  opts?: { force?: boolean },
): { synced: number; skipped: number } {
  if (remoteAvailable()) {
    api
      .syncVacationAttendance(vacation.id)
      .then(async () => {
        try {
          const att = await api.getAttendance();
          setItem(STORAGE_KEYS.attendance, att);
        } catch {}
      })
      .catch(e => console.warn('remote sync vacation', e));
  }
  return applyVacationToLocalAttendance(vacation, opts);
}

export async function syncVacationToAttendanceAsync(
  vacation: Vacation,
  opts?: { force?: boolean },
): Promise<{ synced: number; skipped: number }> {
  if (remoteAvailable()) {
    try {
      const result = await api.syncVacationAttendance(vacation.id);
      await refreshFromRemote();
      return result;
    } catch (e) {
      console.warn('remote syncVacationAttendance failed, applying local', e);
    }
  }
  return applyVacationToLocalAttendance(vacation, opts);
}

const PRESENCE_STATUSES = new Set(['حاضر', 'سهر', 'عارضة حضور']);

function applyVacationToLocalAttendance(
  vacation: Vacation,
  opts?: { force?: boolean },
): { synced: number; skipped: number } {
  const start = vacation.vacationStartDate || vacation.startDate;
  const end = vacation.vacationEndDate || vacation.endDate;
  if (!start || !end) return { synced: 0, skipped: 0 };
  const dates = listDates(String(start).slice(0, 10), String(end).slice(0, 10));
  const status = vacationTypeToAttendanceStatus(vacation.vacationType);
  const marker = `AUTO_VACATION:${vacation.id}`;
  let synced = 0;
  let skipped = 0;
  const att = getAttendance();
  for (const date of dates) {
    const idx = att.findIndex(
      a => a.employeeId === vacation.employeeId && String(a.date).slice(0, 10) === date,
    );
    const existing = idx !== -1 ? att[idx] : null;
    if (
      existing &&
      PRESENCE_STATUSES.has(existing.status) &&
      !existing.notes?.startsWith('AUTO_VACATION:') &&
      !opts?.force
    ) {
      skipped++;
      continue;
    }
    if (idx !== -1) {
      att[idx] = {
        ...att[idx],
        status,
        notes: marker,
        vacationId: vacation.id,
      };
    } else {
      att.push({
        id: Math.max(0, ...att.map(a => a.id)) + 1,
        employeeId: vacation.employeeId,
        date,
        status,
        notes: marker,
        checkInLat: null,
        checkInLng: null,
        workLocationId: null,
        workLocationName: null,
        distanceMeters: null,
        vacationId: vacation.id,
        createdAt: new Date().toISOString(),
      });
    }
    synced++;
  }
  setAttendance(att);
  return { synced, skipped };
}

export function clearVacationFromAttendance(vacationId: number): number {
  if (remoteAvailable()) {
    api.clearVacationAttendance(vacationId).catch(e => console.warn('remote clearVacation', e));
  }
  const attendance = getAttendance();
  const marker = `AUTO_VACATION:${vacationId}`;
  const filtered = attendance.filter(a => a.notes !== marker && a.vacationId !== vacationId);
  const removed = attendance.length - filtered.length;
  if (removed > 0) setAttendance(filtered);
  return removed;
}

export async function clearVacationFromAttendanceAsync(vacationId: number): Promise<number> {
  if (remoteAvailable()) {
    try {
      await api.clearVacationAttendance(vacationId);
      await refreshFromRemote();
    } catch (e) {
      console.warn('remote clearVacation failed', e);
    }
  }
  return clearVacationFromAttendance(vacationId);
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

// ============ 🧰 استلام وتسليم العدة ============
export function getEquipment(): Equipment[] {
  return getItem<Equipment[]>(STORAGE_KEYS.equipment, []);
}
function setEquipmentList(list: Equipment[]) {
  setItem(STORAGE_KEYS.equipment, list);
}

export function getEquipmentCheckouts(): EquipmentCheckout[] {
  return getItem<EquipmentCheckout[]>(STORAGE_KEYS.equipmentCheckouts, []);
}

async function syncEquipmentFromRemote() {
  try {
    const [eqs, cos] = await Promise.all([
      api.getEquipment() as Promise<Equipment[]>,
      api.getEquipmentCheckouts() as Promise<EquipmentCheckout[]>,
    ]);
    if (Array.isArray(eqs)) setEquipmentList(eqs);
    if (Array.isArray(cos)) setItem(STORAGE_KEYS.equipmentCheckouts, cos);
  } catch (e) {
    console.warn('syncEquipmentFromRemote failed', e);
  }
}

/** يسحب أحدث بيانات العدة من السيرفر (يتم استدعاؤها عند فتح التبويب) */
export function refreshEquipment(): void {
  if (remoteAvailable()) syncEquipmentFromRemote();
}

export function addEquipment(eq: Omit<Equipment, 'id' | 'createdAt'>): Equipment {
  const list = getEquipment();
  if (list.some(e => e.serialNumber.trim() === eq.serialNumber.trim())) {
    throw new Error('السيريال نمبر ده مسجل قبل كده لجهاز تاني');
  }
  const item: Equipment = {
    ...eq,
    serialNumber: eq.serialNumber.trim(),
    id: Math.max(0, ...list.map(e => e.id)) + 1,
    createdAt: new Date().toISOString(),
  };
  setEquipmentList([...list, item]);
  if (remoteAvailable()) {
    api.addEquipment({ ...item, id: undefined }).then(() => syncEquipmentFromRemote()).catch(e => console.warn('remote addEquipment', e));
  }
  return item;
}

export function updateEquipment(id: number, updates: Partial<Equipment>): Equipment | null {
  const list = getEquipment();
  const i = list.findIndex(e => e.id === id);
  if (i === -1) return null;
  list[i] = { ...list[i], ...updates };
  setEquipmentList(list);
  if (remoteAvailable()) {
    api.updateEquipment(id, updates).catch(e => console.warn('remote updateEquipment', e));
  }
  return list[i];
}

export function deleteEquipment(id: number): boolean {
  const list = getEquipment();
  const eq = list.find(e => e.id === id);
  if (!eq) return false;
  if (eq.status !== 'متاحة') throw new Error('مينفعش حذف جهاز خارج أو في صيانة — رجّعه الأول');
  setEquipmentList(list.filter(e => e.id !== id));
  if (remoteAvailable()) {
    api.deleteEquipment(id).catch(e => console.warn('remote deleteEquipment', e));
  }
  return true;
}

/** خروج عدة: جهاز/أجهزة مع مساح + مساعد — بتنشئ سجل لكل جهاز */
export function checkoutEquipment(opts: {
  equipmentIds: number[];
  surveyorId: number;
  assistantId: number | null;
  assistantName?: string | null;
  checkoutDate: string;
  destination?: string | null;
  notes?: string;
  createdBy?: number | null;
}): { created: number; blocked: string[] } {
  const eqs = getEquipment();
  const blocked: string[] = [];
  const valid = opts.equipmentIds.filter(id => {
    const eq = eqs.find(e => e.id === id);
    if (!eq || !eq.active || eq.status !== 'متاحة') {
      blocked.push(eq ? `${eq.name} (${eq.serialNumber})` : `#${id}`);
      return false;
    }
    return true;
  });
  if (valid.length === 0) {
    throw new Error(blocked.length ? `الأجهزة دي مش متاحة: ${blocked.join('، ')}` : 'اختار جهاز واحد على الأقل');
  }
  const cos = getEquipmentCheckouts();
  let nextId = Math.max(0, ...cos.map(c => c.id)) + 1;
  const newCos: EquipmentCheckout[] = valid.map(equipmentId => ({
    id: nextId++,
    equipmentId,
    surveyorId: opts.surveyorId,
    assistantId: opts.assistantId ?? null,
    assistantName: opts.assistantName ?? null,
    checkoutDate: opts.checkoutDate,
    returnDate: null,
    conditionReturn: null,
    notes: opts.notes ?? null,
    destination: opts.destination ?? null,
    createdBy: opts.createdBy ?? null,
    createdAt: new Date().toISOString(),
  }));
  setItem(STORAGE_KEYS.equipmentCheckouts, [...newCos, ...cos]);
  setEquipmentList(eqs.map(e => (valid.includes(e.id) ? { ...e, status: 'خارجة' as const } : e)));
  if (remoteAvailable()) {
    api.checkoutEquipment(opts).then(() => syncEquipmentFromRemote()).catch(e => console.warn('remote checkoutEquipment', e));
  }
  return { created: valid.length, blocked };
}

/** رجوع عدة: قفل السجل + حالة الجهاز عند الرجوع */
export function returnEquipmentCheckout(id: number, conditionReturn: string, notes?: string): boolean {
  const cos = getEquipmentCheckouts();
  const i = cos.findIndex(c => c.id === id);
  if (i === -1) return false;
  const co = cos[i];
  if (co.returnDate) throw new Error('العدة دي مسجّل رجوعها خلاص');
  const today = new Date().toISOString().slice(0, 10);
  cos[i] = { ...co, returnDate: today, conditionReturn: conditionReturn ?? null, notes: notes ?? co.notes ?? null };
  setItem(STORAGE_KEYS.equipmentCheckouts, cos);
  const eqs = getEquipment();
  const newStatus: Equipment['status'] = conditionReturn === 'يحتاج صيانة' ? 'صيانة' : 'متاحة';
  setEquipmentList(eqs.map(e => (e.id === co.equipmentId ? { ...e, status: newStatus } : e)));
  if (remoteAvailable()) {
    api.returnEquipmentCheckout({ id, conditionReturn, notes }).then(() => syncEquipmentFromRemote()).catch(e => console.warn('remote returnEquipmentCheckout', e));
  }
  return true;
}
