// 🔧 إصلاح رقم 2: تم حذف الـ circular import (كان بيستورد من نفسه)

export interface Permissions {
  canViewDashboard?: boolean;
  canCheckIn?: boolean;
  canViewMyAccount?: boolean;
  canRequestVacations?: boolean;
  canViewNotifications?: boolean;
  canViewDailyReview?: boolean;
  canViewAttendance: boolean;
  canEditAttendance: boolean;
  canApproveVacations: boolean;
  canViewReports: boolean;
  canManageEmployees: boolean;
  canManageSettings: boolean;
  canManageLocations: boolean;
  canLockMonths: boolean;
  canViewAuditLog: boolean;
}

export interface Employee extends Permissions {
  id: number;
  name: string;
  username: string;
  jobTitle: string | null;
  phone: string | null;
  workCycle: number;
  cycleType: 'fixed' | 'variable' | 'graduated';
  role: 'admin' | 'manager' | 'employee';
  password: string;
  hasPassword?: boolean;
  managerId?: number | null;
  workLocationLat: number | null;
  workLocationLng: number | null;
  active: boolean;
  locationIds: number[];
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkLocation {
  id: number;
  name: string;
  lat: number | null;
  lng: number | null;
  radiusMeters: number;
  active: boolean;
  notes: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AttendanceRecord {
  id: number;
  employeeId: number;
  date: string;
  status: string;
  notes: string | null;
  checkInLat: number | null;
  checkInLng: number | null;
  workLocationId: number | null;
  workLocationName: string | null;
  distanceMeters: number | null;
  vacationId?: number | null;
  createdAt: string;
}

export interface Vacation {
  id: number;
  employeeId: number;
  workDays: number;
  vacationDays: number;
  vacationType: string;
  startDate: string | null;
  endDate: string | null;
  vacationStartDate: string | null;
  vacationEndDate: string | null;
  status: string;
  notes: string | null;
  requestedBy: number | null;
  approvedBy: number | null;
  createdAt: string;
}

export interface AuditLog {
  id: number;
  actorId: number | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: number | null;
  employeeId: number | null;
  employeeName: string | null;
  date: string | null;
  oldValue: string | null;
  newValue: string | null;
  notes: string | null;
  device?: string | null;
  userAgent?: string | null;
  ip?: string | null;
  override?: boolean;
  createdAt: string;
}

export interface SystemNotification {
  id: number;
  type: 'vacation_request' | 'vacation_decision' | 'checkin_failed' | 'negative_balance' | 'casual_over_limit' | 'attendance_override' | 'info';
  title: string;
  body: string;
  employeeId: number | null;
  targetUserIds: number[];
  readBy: number[];
  entityType: string | null;
  entityId: number | null;
  severity: 'info' | 'warn' | 'danger' | 'success';
  createdAt: string;
}

export interface MonthLock {
  id: number;
  yearMonth: string;
  lockedBy: number | null;
  lockedByName: string | null;
  lockedAt: string;
  notes: string | null;
}

export interface CheckInAttempt {
  id: number;
  employeeId: number;
  employeeName: string | null;
  date: string;
  status: string | null;
  success: boolean;
  reason: string | null;
  lat: number | null;
  lng: number | null;
  nearestLocationId?: number | null;
  nearestLocationName: string | null;
  acceptedLocationId?: number | null;
  acceptedLocationName: string | null;
  distanceMeters: number | null;
  createdAt: string;
}

export interface Settings {
  department_name: string;
  work_radius: string;
  work_location_lat: string;
  work_location_lng: string;
  default_work_cycle: string;
  stage1_days: string;
  stage1_vacation: string;
  annual_leave_balance: string;
  footer_text: string;
  settings_password: string;
  [key: string]: string | undefined;
}

export interface TrackerRow {
  employeeId: number;
  name: string;
  jobTitle: string | null;
  phone: string | null;
  workCycle: number;
  cycleType: string;
  currentStage: number;
  currentStageLabel: string;
  totalPresent: number;
  cycles: number;
  earnedVacationDays: number;
  vacationDaysTaken: number;
  vacationBalance: number;
  deficitDays: number;
  daysToNextVacation: number;
  progressPct: number;
  casualPresentDays: number;
  casualVacationDays: number;
  sickLeave: number;
  absent: number;
  unpaidLeave: number;
  saharDays: number;
  saharBalance: number;
  officialLeave: number;
  annualLeave: number;
}

// ============ 🧰 استلام وتسليم العدة ============
export type EquipmentKind =
  // الأجهزة الرئيسية
  | 'تواتال ستايشن'
  | 'ميزان'
  // ملحقات الميزان
  | 'قامة 5م'
  | 'قامة 7م'
  | 'حامل ميزان ألومنيوم'
  // ملحقات التوتال
  | 'حامل توتال ألومنيوم'
  | 'حامل توتال خشب'
  | 'بريزم'
  | 'ميني بريزم'
  // أخرى
  | 'أخرى';
export type EquipmentStatus = 'متاحة' | 'خارجة' | 'صيانة';

export interface Equipment {
  id: number;
  name: string;
  kind: EquipmentKind;
  serialNumber: string;
  status: EquipmentStatus;
  notes?: string | null;
  active: boolean;
  custodyEmployeeId?: number | null;
  custodySince?: string | null;
  custodyNotes?: string | null;
  createdAt: string;
}

export interface EquipmentCheckout {
  id: number;
  equipmentId: number;
  surveyorId: number;
  assistantId: number | null;
  assistantName?: string | null;
  checkoutDate: string;
  returnDate: string | null;
  conditionReturn?: string | null;
  notes?: string | null;
  destination?: string | null;
  createdBy: number | null;
  createdAt: string;
}
