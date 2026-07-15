// ============================================================
// 🎯 حساب رصيد الموظف (النسخة النهائية بالمضاعف)
// ============================================================
// - الحضور بالكامل → يمر على المعادلة المتدرجة
// - الإجازات المأخوذة → تُخصم بالمضاعف من الأيام
// - الأيام الفعلية = الحضور - (الإجازات × مضاعف المرحلة)
// - الرصيد المتاح = محسوب من الأيام الفعلية
// ============================================================

import type { AttendanceRecord, Vacation } from './types';
import { computeGraduatedVacation } from './vacation';

// حالات الإجازات المعتمدة
const APPROVED = new Set(['مقبولة', 'مجدولة', 'جارية', 'منتهية']);

// 🎯 أنواع الإجازات اللي تخصم من الرصيد (من طلبات الإجازات)
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

// حالات لا تخصم من الرصيد:
// - إجازة رسمية ❌
// - إجازة مرضية ❌
// - إجازة سنوية (رصيد منفصل) ❌
// - بدون مرتب ❌
// - بدل سهرة (يخصم من رصيد السهر) ❌

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
 * 
 * مثال:
 * - حضور: 36 يوم
 * - مأخوذة: 4 (اعتيادية)
 * - مستهلك بالمضاعف: 4 × 5 = 20
 * - الأيام الفعلية: 36 - 20 = 16
 * - المرحلة الحالية: الثانية
 * - المستحقة (المتاح): 3
 */
export function calculateEmployeeBalance(
  attendance: AttendanceRecord[],
  vacations: Vacation[]
) {
  // 1️⃣ إجمالي أيام الحضور الفعلي
  const totalPresent = attendance.filter(r => 
    ['حاضر', 'سهر', 'عارضة حضور'].includes(r.status)
  ).length;
  
  // 2️⃣ حساب الإجازات المأخوذة (اللي تخصم)
  const taken = getVacationDaysTaken(attendance, vacations);
  
  // 3️⃣ تطبيق المعادلة مع الخصم بالمضاعف
  const result = computeGraduatedVacation(totalPresent, taken);
  
  return {
    totalPresent,                             // إجمالي الحضور الأصلي
    effectivePresent: result.effectivePresent, // الأيام الفعلية بعد الخصم
    earned: result.earned,                    // الرصيد المتاح
    taken,                                    // الإجازات المأخوذة
    netBalance: result.earned,                // الرصيد الصافي = المتاح
    consumedWorkDays: result.consumedWorkDays, // الأيام المستهلكة بالمضاعف
    stageLabel: result.stageLabel,
  };
}
