// ============================================================
// 🎯 معادلة حساب الإجازات المتدرجة (بالمضاعف الواحد)
// ============================================================
// المرحلة 1: 1-12 يوم   → ÷ 4  (مضاعف = 4)
// المرحلة 2: 13-18 يوم  → ÷ 4.5 (مضاعف = 4.5)
// المرحلة 3: 19+ يوم    → ÷ 5  (مضاعف = 5)
//
// الخصم = عدد الإجازات × مضاعف المرحلة الأصلية
// ============================================================

export interface GraduatedResult {
  stage: number;
  stageLabel: string;
  earned: number;
  daysToNext: number;
  progressPct: number;
  effectivePresent: number;
  consumedWorkDays: number;
}

/**
 * حساب الإجازات المستحقة بناءً على عدد أيام العمل
 */
export function earnedVacationDaysForWorkDays(workDays: number): number {
  const days = Math.max(0, Math.floor(workDays));
  if (days <= 0) return 0;

  if (days <= 12) {
    return Math.floor(days / 4);
  }

  if (days <= 18) {
    return Math.max(3, Math.floor(days / 4.5));
  }

  return Math.max(4, Math.floor(days / 5));
}

/**
 * تحديد المرحلة الحالية بناءً على أيام العمل
 */
function getStage(workDays: number): { stage: number; label: string; divisor: number } {
  if (workDays <= 0) return { stage: 0, label: 'بداية الحساب', divisor: 4 };
  if (workDays <= 12) return { stage: 1, label: '1️⃣ حتى 12: ÷ 4', divisor: 4 };
  if (workDays <= 18) return { stage: 2, label: '2️⃣ حتى 18: ÷ 4.5', divisor: 4.5 };
  return { stage: 3, label: '3️⃣ 19 فأكثر: ÷ 5', divisor: 5 };
}

/**
 * 🎯 حساب الأيام المستهلكة بسبب الإجازات (بالمضاعف الواحد)
 * 
 * كل الإجازات تُخصم بمضاعف المرحلة الأصلية للحضور
 * 
 * مثال:
 * - حاضر 32 يوم (مرحلة 3 → مضاعف 5)
 * - أخد 6 إجازات
 * - المستهلك = 6 × 5 = 30
 */
function calculateConsumedWorkDays(vacationDaysTaken: number, originalStage: number): number {
  if (vacationDaysTaken <= 0) return 0;
  let multiplier = 4;
  if (originalStage === 2) multiplier = 4.5;
  else if (originalStage === 3) multiplier = 5;
  return Math.round(vacationDaysTaken * multiplier);
}

/**
 * إيجاد المحطة التالية
 */
function findNextMilestone(workDays: number, earned: number): number {
  for (let day = workDays + 1; day <= workDays + 400; day += 1) {
    if (earnedVacationDaysForWorkDays(day) > earned) return day;
  }
  return workDays;
}

/**
 * إيجاد أول يوم وصل فيه لهذا الرصيد
 */
function findCurrentMilestone(workDays: number, earned: number): number {
  if (earned <= 0) return 0;
  for (let day = workDays; day >= 1; day -= 1) {
    if (
      earnedVacationDaysForWorkDays(day) === earned &&
      earnedVacationDaysForWorkDays(day - 1) < earned
    ) {
      return day;
    }
  }
  return 0;
}

/**
 * 🎯 الدالة الرئيسية لحساب الإجازات المتدرجة
 * 
 * مثال محمد حسن:
 * - حاضر 32 يوم
 * - أخد 6 اعتيادية
 * - مرحلة أصلية: 3 (مضاعف 5)
 * - المستهلك: 6 × 5 = 30
 * - الأيام الفعلية: 32 - 30 = 2 ✅
 * - المرحلة الحالية: 1 (2 يوم في مرحلة 1)
 * - المستحقة: 0 (2÷4 = 0)
 */
export function computeGraduatedVacation(
  totalPresent: number,
  vacationDaysTaken: number = 0,
): GraduatedResult {
  const workDays = Math.max(0, Math.floor(totalPresent));
  
  // المرحلة الأصلية (للمضاعف)
  const originalStage = getStage(workDays);
  
  // الأيام المستهلكة بالمضاعف الواحد
  const consumedWorkDays = calculateConsumedWorkDays(vacationDaysTaken, originalStage.stage);
  
  // الأيام الفعلية
  const effectivePresent = workDays - consumedWorkDays;
  
  // المرحلة الحالية (بناءً على الأيام الفعلية)
  const positiveEffective = Math.max(0, effectivePresent);
  const currentStage = getStage(positiveEffective);
  
  // الرصيد المتاح (من الأيام الفعلية)
  const earned = earnedVacationDaysForWorkDays(positiveEffective);
  
  // حساب التقدم
  const nextMilestone = findNextMilestone(positiveEffective, earned);
  const currentMilestone = findCurrentMilestone(positiveEffective, earned);
  const totalGap = Math.max(1, nextMilestone - currentMilestone);
  const doneInGap = Math.max(0, positiveEffective - currentMilestone);

  return {
    stage: currentStage.stage,
    stageLabel: currentStage.label,
    earned,
    daysToNext: Math.max(0, nextMilestone - positiveEffective),
    progressPct: Math.min(100, Math.round((doneInGap / totalGap) * 100)),
    effectivePresent,     // يمكن أن يكون سالب في العجز
    consumedWorkDays,
  };
}
