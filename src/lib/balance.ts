import type { AttendanceRecord, Vacation } from './types';
import { computeGraduatedVacation } from './vacation';

const APPROVED = new Set(['مقبولة', 'مجدولة', 'جارية', 'منتهية']);
const DEDUCT_VACATION_TYPES = new Set(['نظامية', 'اعتيادية', 'إجازة اعتيادية', 'عارضة', 'عارضة إجازة', 'إجازة عارضة']);
const DEDUCT_ATTENDANCE_STATUSES = new Set(['عارضة إجازة', 'إجازة عارضة', 'إجازة اعتيادية']);

function isAutoVacationAttendance(record: AttendanceRecord) {
  return Boolean(record.notes?.startsWith('AUTO_VACATION:') || record.vacationId);
}

export function getVacationDaysTaken(attendance: AttendanceRecord[], vacations: Vacation[]) {
  const manualSheetDeduct = attendance
    .filter(r => DEDUCT_ATTENDANCE_STATUSES.has(r.status) && !isAutoVacationAttendance(r))
    .length;
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

export function calculateEmployeeBalance(attendance: AttendanceRecord[], vacations: Vacation[]) {
  const totalPresent = attendance.filter(r => r.status === 'حاضر').length;
  const taken = getVacationDaysTaken(attendance, vacations);
  const result = computeGraduatedVacation(totalPresent, taken);
  return {
    totalPresent,
    taken,
    earned: result.earned,
    effectivePresent: result.effectivePresent,
    consumedWorkDays: result.consumedWorkDays,
    stageLabel: result.stageLabel,
    netBalance: result.earned - taken
  };
}
