// 🆕 Types خاصة بالسيرفر (نسخة مطابقة لـ src/lib/types.ts)
// Vercel Edge Runtime لا يقدر يوصل لمجلد src/ من مجلد api/
// عشان كده لازم نسخة محلية هنا

export interface Employee {
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
