import type { AttendanceRecord, Vacation } from './types';
import { computeGraduatedVacation } from './vacation';

const APPROVED = new Set(['مقبولة', 'مجدولة', 'جارية', 'منتهية']);
const DEDUCT_VACATION_TYPES = new Set(['نظامية', 'اعتيادية', 'إجازة اعتيادية', 'عارضة', 'عارضة إجازة', 'إجازة عارضة']);
const DEDUCT_ATTENDANCE_STATUSES = new Set(['عارضة إجازة', 'إجازة عارضة', 'إجازة اعتيادية']);

function isAutoVacationAttendance(record: AttendanceRecord) {
  return Boolean(record.notes?.startsWith('AUTO_VACATION:') || record.vacationId);
}

/**
 * حساب عدد أيام الإجازات المأخوذة (المخصومة من الرصيد)
 */
export function getVacationDaysTaken(attendance: AttendanceRecord[], vacations: Vacation[]) {
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

  const manualSheetDeduct = attendance
    .filter(r => {
      const isDeductType = DEDUCT_ATTENDANCE_STATUSES.has(r.status);
      const isNotAuto = !isAutoVacationAttendance(r);
      const isNotSaharVacation = !saharVacationDates.has(r.date);
      return isDeductType && isNotAuto && isNotSaharVacation;
    })
    .length;

  const approvedRequestDeduct = vacations
    .filter(v => APPROVED.has(v.status) && DEDUCT_VACATION_TYPES.has(v.vacationType || 'اعتيادية'))
    .reduce((sum, v) => sum + (v.vacationDays || 0), 0);

  return manualSheetDeduct + approvedRequestDeduct;
}

/**
 * 🆕 حساب إجمالي أيام العمل المستهلكة من work_days المخزنة في الداتابيز
 * (بدل ما نحسب بالمضاعف)
 */
export function getTotalWorkDaysConsumed(vacations: Vacation[]): number {
  return vacations
    .filter(v => APPROVED.has(v.status) && DEDUCT_VACATION_TYPES.has(v.vacationType || 'اعتيادية'))
    .reduce((sum, v) => sum + (v.workDays || 0), 0);
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

/**
 * 🎯 حساب رصيد الموظف - النسخة النهائية
 * 
 * الفكرة الجديدة:
 * - نستخدم work_days المخزنة في كل إجازة (مش نحسب بالمضاعف)
 * - الأيام الفعلية = الحضور - إجمالي work_days للإجازات المعتمدة
 * - المستحقة = محسوبة من الأيام الفعلية
 * 
 * مثال محمود سيف:
 * - حضور: 19، أخد 3 إجازة (work_days = 12)
 * - الأيام الفعلية = 19 - 12 = 7 ✅
 * - المستحقة = 7 ÷ 4 = 1 ✅
 */
export function calculateEmployeeBalance(attendance: AttendanceRecord[], vacations: Vacation[]) {
  // 1️⃣ إجمالي أيام الحضور
  const totalPresent = attendance.filter(r => 
    ['حاضر', 'سهر', 'عارضة حضور'].includes(r.status)
  ).length;
  
  // 2️⃣ إجمالي أيام العمل المستهلكة (من work_days المخزنة)
  const totalWorkDaysConsumed = getTotalWorkDaysConsumed(vacations);
  
  // 3️⃣ الأيام الفعلية = الحضور - المستهلك
  const effectivePresent = totalPresent - totalWorkDaysConsumed;
  
  // 4️⃣ إجمالي الإجازات المأخوذة (للعرض)
  const taken = getVacationDaysTaken(attendance, vacations);
  
  // 5️⃣ حساب المرحلة والرصيد من الأيام الفعلية
  const result = computeGraduatedVacation(Math.max(0, effectivePresent), 0);
  
  // 6️⃣ حساب العجز
  let deficitDays = 0;
  let netBalance = result.earned;
  
  if (effectivePresent < 0) {
    const absoluteDeficit = Math.abs(effectivePresent);
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
    effectivePresent,             // الأيام الفعلية بعد خصم work_days
    consumedWorkDays: totalWorkDaysConsumed,  // 🆕 إجمالي work_days المستهلكة
    stageLabel: result.stageLabel,
    netBalance,
    deficitDays,
    hasDeficit: deficitDays > 0,
  };
}
