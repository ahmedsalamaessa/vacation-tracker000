// ============================================================
// 🎯 حساب رصيد الموظف (النسخة النهائية)
// ============================================================
// - المستحقة = من الحضور بالمعادلة المتدرجة
// - المأخوذة = فقط الإجازات اللي تخصم من الرصيد
// - المتاح = المستحقة - المأخوذة
// ============================================================

import type { AttendanceRecord, Vacation } from './types';
import { computeGraduatedVacation } from './vacation';

// حالات الإجازات المعتمدة
const APPROVED = new Set(['مقبولة', 'مجدولة', 'جارية', 'منتهية']);

// 🎯 أنواع الإجازات اللي تخصم من الرصيد المستحق (من طلبات الإجازات)
const DEDUCT_VACATION_TYPES = new Set([
  'اعتيادية',
  'إجازة اعتيادية',
  'عارضة',
  'عارضة إجازة',
  'إجازة عارضة',
]);

// 🎯 حالات الإجازة في شيت الحضور اللي تخصم من الرصيد
const DEDUCT_ATTENDANCE_STATUSES = new Set([
  'عارضة إجازة',
  'إجازة عارضة',
  'إجازة اعتيادية',
]);

/**
 * التحقق من كون سجل الحضور تم إنشاؤه تلقائياً من إجازة معتمدة
 */
function isAutoVacationAttendance(record: AttendanceRecord) {
  return Boolean(record.notes?.startsWith('AUTO_VACATION:') || record.vacationId);
}

/**
 * حساب عدد أيام الإجازات المأخوذة (اللي تخصم من الرصيد فقط)
 */
export function getVacationDaysTaken(
  attendance: AttendanceRecord[],
  vacations: Vacation[]
): number {
  // 1️⃣ عدد الأيام في شيت الحضور اللي حالتها إجازة مخصومة
  //    (لكن ليس اللي أضيفت تلقائياً من طلب معتمد - عشان مانحسبش مرتين)
  const manualSheetDeduct = attendance.filter(r => {
    const isDeductType = DEDUCT_ATTENDANCE_STATUSES.has(r.status);
    const isNotAuto = !isAutoVacationAttendance(r);
    return isDeductType && isNotAuto;
  }).length;

  // 2️⃣ عدد الأيام من طلبات الإجازات المعتمدة (اللي تخصم)
  const approvedRequestDeduct = vacations
    .filter(v => 
      APPROVED.has(v.status) && 
      DEDUCT_VACATION_TYPES.has(v.vacationType || 'اعتيادية')
    )
    .reduce((sum, v) => sum + (v.vacationDays || 0), 0);

  return manualSheetDeduct + approvedRequestDeduct;
}

/**
 * حساب مجموع أيام الإجازات المعتمدة من نوع معين
 */
export function sumApprovedByTypes(vacations: Vacation[], types: string[]): number {
  return vacations
    .filter(v => {
      const statusOk = APPROVED.has(v.status);
      const typeOk = types.some(t => (v.vacationType || '').includes(t));
      return statusOk && typeOk;
    })
    .reduce((sum, v) => sum + (v.vacationDays || 0), 0);
}

/**
 * 🎯 الدالة الرئيسية لحساب رصيد الموظف
 */
export function calculateEmployeeBalance(
  attendance: AttendanceRecord[],
  vacations: Vacation[]
) {
  // 1️⃣ إجمالي أيام الحضور الفعلي
  const totalPresent = attendance.filter(r => 
    ['حاضر', 'سهر', 'عارضة حضور'].includes(r.status)
  ).length;
  
  // 2️⃣ حساب المستحقة من المعادلة المتدرجة (بدون خصم)
  const result = computeGraduatedVacation(totalPresent);
  const earned = result.earned;
  
  // 3️⃣ حساب المأخوذة (اللي تخصم من الرصيد فقط)
  const taken = getVacationDaysTaken(attendance, vacations);
  
  // 4️⃣ الرصيد المتاح = المستحقة - المأخوذة
  const netBalance = earned - taken;
  
  return {
    totalPresent,
    effectivePresent: totalPresent,
    earned,
    taken,
    netBalance,
    consumedWorkDays: 0,
    stageLabel: result.stageLabel,
  };
}
