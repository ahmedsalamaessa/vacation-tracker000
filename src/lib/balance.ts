import type { AttendanceRecord, Vacation } from './types';
import { computeGraduatedVacation } from './vacation';
import { getOvertimeRequests } from './db';

const APPROVED = new Set(['مقبولة', 'مجدولة', 'جارية', 'منتهية']);

// 🔧 الاعتيادية بس هي اللي تخصم من الرصيد
// العارضة والرسمية والمرضية والسنوية والبدون مرتب مبتخصمش
const DEDUCT_VACATION_TYPES = new Set([
  'نظامية', 
  'اعتيادية', 
  'إجازة اعتيادية'
]);

// حالات في شيت الحضور تخصم من الرصيد (اعتيادية فقط)
const DEDUCT_ATTENDANCE_STATUSES = new Set([
  'إجازة اعتيادية'
]);

function isAutoVacationAttendance(record: AttendanceRecord) {
  return Boolean(record.notes?.startsWith('AUTO_VACATION:') || record.vacationId);
}

/**
 * حساب عدد أيام الإجازات المأخوذة (المخصومة من الرصيد فقط)
 * فقط الاعتيادية اللي تخصم
 */
export function getVacationDaysTaken(attendance: AttendanceRecord[], vacations: Vacation[]) {
  const saharVacationDates = new Set(
    vacations
      .filter(v => APPROVED.has(v.status) && (v.vacationType || '').includes('سهرة'))
      .flatMap(v => {
        const start = new Date(v.startDate);
        const end = new Date(v.endDate);
        const dates: string[] = [];
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
 * 🆕 المستهلك من work_days المخزنة في الداتابيز (محسوبة لحظة الاعتماد) — مش إعادة حساب بالجملة
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
 * 🌙 رصيد بدل السهرة — رصيد منفصل تمامًا عن رصيد الإجازات
 *
 * القاعدة: كل ليلة "سهر" تكتسب يوم بدل، وكل يوم "بدل سهرة" يخصم من هذا الرصيد فقط
 * (لا يُضاف إلى رصيد الإجازات ولا يخصم منه)
 */
export function getSaharBalance(attendance: AttendanceRecord[], vacations: Vacation[], employeeId?: number): number {
  const saharDates = new Set<string>();

  // 1) أيام السهر المسجلة في شيت الحضور
  for (const r of attendance) {
    if (r.status === 'سهر' && r.date) {
      saharDates.add(String(r.date).slice(0, 10));
    }
  }

  // 2) طلبات السهر المعتمدة في النظام
  try {
    const ots = getOvertimeRequests();
    const targetEmpId = employeeId || (attendance[0] ? attendance[0].employeeId : undefined);
    for (const ot of ots) {
      if (ot.status === 'approved' && ot.date) {
        if (!targetEmpId || ot.employeeId === targetEmpId) {
          saharDates.add(String(ot.date).slice(0, 10));
        }
      }
    }
  } catch {}

  const earned = saharDates.size;

  // أيام بدل سهرة يدوية من الشيت (غير المرتبطة بإجازة معتمدة)
  const manualSpent = attendance.filter(r =>
    (r.status === 'بدل سهرة' || r.status === 'بدل سهر') && !isAutoVacationAttendance(r)
  ).length;

  // أيام بدل سهرة من الإجازات المعتمدة (تُحسب مرة واحدة فقط)
  const vacationSpent = sumApprovedByTypes(vacations, ['سهرة', 'بدل سهرة', 'بدل سهر']);

  return Math.max(0, earned - manualSpent - vacationSpent);
}

/**
 * 🎯 حساب رصيد الموظف بالنسخة الأصلية المعتمدة
 */
export function calculateEmployeeBalance(attendance: AttendanceRecord[], vacations: Vacation[]) {
  // 1️⃣ إجمالي أيام الحضور العادية (حاضر + عارضة حضور) — السهر يذهب حصراً وبشكل مستقل إلى رصيد بدل السهر
  const totalPresent = attendance.filter(r => 
    ['حاضر', 'عارضة حضور'].includes(r.status)
  ).length;
  
  // 2️⃣ إجمالي أيام العمل المستهلكة من work_days المخزنة
  const totalWorkDaysConsumed = getTotalWorkDaysConsumed(vacations);
  
  // 3️⃣ الأيام الفعلية = الحضور - المستهلك
  const effectivePresent = totalPresent - totalWorkDaysConsumed;
  
  // 4️⃣ إجمالي الإجازات المأخوذة
  const taken = getVacationDaysTaken(attendance, vacations);
  
  // 5️⃣ حساب المرحلة والرصيد من الأيام الفعلية المتبقية
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
    effectivePresent,
    consumedWorkDays: totalWorkDaysConsumed,
    stageLabel: result.stageLabel,
    netBalance,
    deficitDays,
    hasDeficit: deficitDays > 0,
  };
}

// ============================================================
// ⚡ رصيد العارضة — رصيد سنوي مستقل (زي بدل السهرة)
// القاعدة: 6 أيام في السنة، والسنة من 21 ديسمبر إلى 20 ديسمبر
// ============================================================

export const DEFAULT_CASUAL_QUOTA = 6;

export function getCasualWindow(ref: Date = new Date()): { start: string; end: string } {
  const y = ref.getFullYear();
  // بعد 20 ديسمبر → نافذة سنة جديدة (تبدأ 21-12 من السنة الحالية)
  const startYear = ref.getMonth() === 11 && ref.getDate() >= 21 ? y : y - 1;
  return {
    start: `${startYear}-12-21`,
    end: `${startYear + 1}-12-20`,
  };
}

export interface CasualBalance {
  quota: number;
  spent: number;
  remaining: number;
  windowStart: string;
  windowEnd: string;
}

export function getCasualBalance(
  attendance: AttendanceRecord[],
  quota: number = DEFAULT_CASUAL_QUOTA,
  ref: Date = new Date(),
): CasualBalance {
  const { start, end } = getCasualWindow(ref);
  const spent = attendance.filter(
    r =>
      (r.status === 'عارضة إجازة' || r.status === 'إجازة عارضة') &&
      r.date >= start &&
      r.date <= end,
  ).length;
  return { quota, spent, remaining: quota - spent, windowStart: start, windowEnd: end };
}
