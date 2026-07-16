// ============================================================
// 🎯 معادلة حساب الإجازات المتدرجة
// ============================================================
// المرحلة 1: 1-12 يوم   → ÷ 4  (تقريب لأسفل)
// المرحلة 2: 13-18 يوم  → ÷ 4.5 (تقريب لأسفل، حد أدنى 3)
// المرحلة 3: 19+ يوم    → ÷ 5  (تقريب لأسفل، حد أدنى 4)
// ============================================================
// الخصم بالمراحل:
// - إجازات 1-3: كل واحدة = 4 أيام (مرحلة 1)
// - إجازة 4:    6 أيام إضافية (تكمل لـ 18)
// - إجازات 5+: كل واحدة = 5 أيام (مرحلة 3)
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

  // المرحلة الثانية: 13 إلى 18 يوم (بحد أدنى 3)
  if (days <= 18) {
    return Math.max(3, Math.floor(days / 4.5));
  }

  // المرحلة الثالثة: 19 يوم فأكثر (بحد أدنى 4)
  return Math.max(4, Math.floor(days / 5));
}

/**
 * 🆕 حساب الأيام المستهلكة بسبب الإجازات (بالمراحل)
 * 
 * إجازة 1، 2، 3 → 4 أيام لكل واحدة (مرحلة 1)
 * إجازة 4       → 6 أيام إضافية (المجموع 18 = مرحلة 2)
 * إجازات 5+     → 5 أيام لكل واحدة (مرحلة 3)
 */
function daysConsumedByVacations(vacationsTaken: number): number {
  if (vacationsTaken <= 0) return 0;
  
  // مرحلة 1: أول 3 إجازات، كل واحدة = 4 أيام
  if (vacationsTaken <= 3) {
    return vacationsTaken * 4;
  }
  
  // مرحلة 2: الإجازة الرابعة تكمل لـ 18 يوم
  if (vacationsTaken === 4) {
    return 18;
  }
  
  // مرحلة 3: بعد الرابعة، كل إجازة = 5 أيام
  return 18 + (vacationsTaken - 4) * 5;
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
 * مثال:
 * - حاضر 36 يوم + أخد 4 إجازة اعتيادية
 * - المستهلك = 18
 * - الأيام الفعلية = 36 - 18 = 18
 * - المرحلة الحالية = 2
 * - الرصيد = 4
 */
export function computeGraduatedVacation(
  totalPresent: number,
  vacationDaysTaken: number = 0,
): GraduatedResult {
  const workDays = Math.max(0, Math.floor(totalPresent));
  
  // 🆕 استخدام الحساب الجديد بالمراحل
  const consumedWorkDays = daysConsumedByVacations(vacationDaysTaken);
  
  // الأيام الفعلية بعد الخصم
  const effectivePresent = workDays - consumedWorkDays;
  
  // المرحلة الحالية (بناءً على الأيام الفعلية)
  const positiveEffective = Math.max(0, effectivePresent);
  const currentStage = getStage(positiveEffective);
  
  // الرصيد المتاح
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
    effectivePresent,     // يمكن أن يكون سالب في حالة العجز
    consumedWorkDays,
  };
}
