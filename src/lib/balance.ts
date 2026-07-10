import type { AttendanceRecord, Vacation } from './types';

const APPROVED = new Set(['مقبولة', 'مجدولة', 'جارية', 'منتهية']);
const DEDUCT_VACATION_TYPES = new Set(['نظامية', 'اعتيادية', 'إجازة اعتيادية', 'عارضة', 'عارضة إجازة', 'إجازة عارضة']);
const DEDUCT_ATTENDANCE_STATUSES = new Set(['عارضة إجازة', 'إجازة عارضة', 'إجازة اعتيادية']);

function isAutoVacationAttendance(record: AttendanceRecord) {
  return Boolean(record.notes?.startsWith('AUTO_VACATION:') || record.vacationId);
}

export function getVacationDaysTaken(attendance: AttendanceRecord[], vacations: Vacation[]) {
  // 1) أيام الشيت اليدوية فقط (مش اللي نازلة من اعتماد إجازة) — عشان متعملش دبل
  const manualSheetDeduct = attendance
    .filter(r => DEDUCT_ATTENDANCE_STATUSES.has(r.status) && !isAutoVacationAttendance(r))
    .length;

  // 2) طلبات الإجازة المعتمدة (المصدر الأساسي بعد الاعتماد)
  const approvedRequestDeduct = vacations
    .filter(v => APPROVED.has(v.status) && DEDUCT_VACATION_TYPES.has(v.vacationType || 'اعتيادية'))
    .reduce((sum, v) => sum + (v.vacationDays || 0), 0);

  return manualSheetDeduct + approvedRequestDeduct;
}

export function sumApprovedByTypes(vacations: Vacation[], types: string[]) {
  return vacations
    .filter(v => APPROVED.has(v.status) && types.includes(v.vacationType || 'اعتيادية'))
    .reduce((sum, v) => sum + (v.vacationDays || 0), 0);
}
