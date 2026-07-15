// ============================================================
// 🎯 معادلة حساب الإجازات المتدرجة
// ============================================================
// المرحلة 1: حضور 1-12 يوم  → ÷ 4  (تقريب لأسفل)
// المرحلة 2: حضور 13-18 يوم → ÷ 4.5 (تقريب لأسفل، حد أدنى 3)
// المرحلة 3: حضور 19+ يوم   → ÷ 5  (تقريب لأسفل، حد أدنى 4)
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

  // المرحلة الأولى: 1 إلى 12 يوم
  if (days <= 12) {
    return Math.floor(days / 4);
  }

  // المرحلة الثانية: 13 إلى 18 يوم
  // بحد أدنى 3 (لأنه اجتاز المرحلة الأولى)
  if (days <= 18) {
    return Math.max(3, Math.floor(days / 4.5));
  }

  // المرحلة الثالثة: 19 يوم فأكثر
  // بحد أدنى 4 (لأنه اجتاز المرحلة الثانية)
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
 * إيجاد المحطة التالية اللي هيزيد فيها الرصيد
 */
function findNextMilestone(workDays: number, earned: number): number {
  for (let day = workDays + 1; day <= workDays + 400; day += 1) {
    if (earnedVacationDaysForWorkDays(day) > earned) return day;
  }
  return workDays;
}

/**
 * إيجاد أول يوم وصل فيه الموظف لهذا الرصيد
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
 * الدالة الرئيسية لحساب الإجازات المتدرجة
 * 
 * @param totalPresent إجمالي أيام الحضور الفعلي
 * @param vacationDaysTaken عدد الإجازات المأخوذة (تُخصم من الرصيد فقط، ليس من الحضور)
 */
export function computeGraduatedVacation(
  totalPresent: number,
  vacationDaysTaken: number = 0,
): GraduatedResult {
  const workDays = Math.max(0, Math.floor(totalPresent));
  
  // الأيام الفعلية = إجمالي الحضور (بدون خصم)
  const effectivePresent = workDays;
  
  // حساب المرحلة الحالية
  const currentStage = getStage(effectivePresent);
  
  // حساب الرصيد الإجمالي المستحق
  const totalEarned = earnedVacationDaysForWorkDays(effectivePresent);
  
  // الرصيد المتاح = الإجمالي - المأخوذ
  const earned = Math.max(0, totalEarned - vacationDaysTaken);
  
  // حساب المحطة التالية والتقدم
  const nextMilestone = findNextMilestone(effectivePresent, totalEarned);
  const currentMilestone = findCurrentMilestone(effectivePresent, totalEarned);
  const totalGap = Math.max(1, nextMilestone - currentMilestone);
  const doneInGap = Math.max(0, effectivePresent - currentMilestone);

  return {
    stage: currentStage.stage,
    stageLabel: currentStage.label,
    earned,                       // الرصيد المتاح (بعد خصم المأخوذ)
    daysToNext: Math.max(0, nextMilestone - effectivePresent),
    progressPct: Math.min(100, Math.round((doneInGap / totalGap) * 100)),
    effectivePresent,             // الأيام الفعلية = الحضور الكلي
    consumedWorkDays: 0,          // مفيش خصم من أيام الحضور
  };
}
