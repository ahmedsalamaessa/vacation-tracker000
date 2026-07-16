import type { AttendanceRecord, Vacation } from './types';
import { computeGraduatedVacation } from './vacation';

const APPROVED = new Set(['مقبولة', 'مجدولة', 'جارية', 'منتهية']);
const DEDUCT_VACATION_TYPES = new Set(['نظامية', 'اعتيادية', 'إجازة اعتيادية', 'عارضة', 'عارضة إجازة', 'إجازة عارضة']);
const DEDUCT_ATTENDANCE_STATUSES = new Set(['عارضة إجازة', 'إجازة عارضة', 'إجازة اعتيادية']);

function isAutoVacationAttendance(record: AttendanceRecord) {
  return Boolean(record.notes?.startsWith('AUTO_VACATION:') || record.vacationId);
}

export function getVacationDaysTaken(attendance: AttendanceRecord[], vacations: Vacation[]) {
  // 1. تحديد الأيام التي تم أخذها كـ "بدل سهرة" من الطلبات المعتمدة
  const saharVacationDates = new Set(
    vacations
      .filter(v => APPROVED.has(v.status) && (v.vacationType || '').includes('سهرة'))
      .flatMap(v => {
        const start = new Date(v.startDate);
        const end = new Date(v.endDate);
        const dates = [];
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          dates.push(d.toISOString().split('T')[0]);
        }
        return dates;
      })
  );

  // 2. خصم الإجازات من شيت الحضور
  const manualSheetDeduct = attendance
    .filter(r => {
      const isDeductType = DEDUCT_ATTENDANCE_STATUSES.has(r.status);
      const isNotAuto = !isAutoVacationAttendance(r);
      const isNotSaharVacation = !saharVacationDates.has(r.date);
      return isDeductType && isNotAuto && isNotSaharVacation;
    })
    .length;

  // 3. خصم الإجازات من الطلبات المعتمدة
  const approvedRequestDeduct = vacations
    .filter(v => APPROVED.has(v.status) && DEDUCT_VACATION_TYPES.has(v.vacationType || 'اعتيادية'))
    .reduce((sum, v) => sum + (v.vacationDays || 0), 0);

  return manualSheetDeduct + approvedRequestDeduct;
}

export function sumApprovedByTypes(vacations: Vacation[], types: string[]) {
  return vacations
    .filter(v => {
      const statusOk = APPROVED.has(v.status);
      const typeOk = types.some(t => (v.vacationType || '').includes(t));
      return statusOk && typeOk;
    })
    .reduce((sum, v) => sum + (v.vacationDays || 0), 0);
}

export function calculateEmployeeBalance(attendance: AttendanceRecord[], vacations: Vacation[]) {
  const totalPresent = attendance.filter(r => ['حاضر', 'سهر', 'عارضة حضور'].includes(r.status)).length;
  const taken = getVacationDaysTaken(attendance, vacations);
  const result = computeGraduatedVacation(totalPresent, taken);

  // 🆕 حساب العجز
  let deficitDays = 0;
  let netBalance = result.earned;
  
  if (result.effectivePresent < 0) {
    // في عجز: الأيام الفعلية سالبة
    const absoluteDeficit = Math.abs(result.effectivePresent);
    
    // تحديد المضاعف للعجز
    let multiplier = 5;
    if (absoluteDeficit <= 12) multiplier = 4;
    else if (absoluteDeficit <= 18) multiplier = 4.5;
    
    deficitDays = Math.ceil(absoluteDeficit / multiplier);
    netBalance = -deficitDays;
  }
  
  return {
    totalPresent,
    taken,
    earned: result.earned,
    effectivePresent: result.effectivePresent,
    consumedWorkDays: result.consumedWorkDays,
    stageLabel: result.stageLabel,
    netBalance,             // الرصيد النهائي (يمكن أن يكون سالب)
    deficitDays,            // 🆕 عدد أيام الإجازات الزيادة
    hasDeficit: deficitDays > 0,  // 🆕 هل يوجد عجز؟
  };
}
