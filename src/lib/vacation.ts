// ============================================================
// 🎯 معادلة حساب الإجازات المتدرجة مع الخصم بالمضاعف
// ============================================================
// المرحلة 1: حضور 1-12 يوم  → ÷ 4  (1 إجازة = 4 أيام عمل)
// المرحلة 2: حضور 13-18 يوم → ÷ 4.5 (1 إجازة = 4.5 أيام عمل، حد أدنى 3)
// المرحلة 3: حضور 19+ يوم   → ÷ 5  (1 إجازة = 5 أيام عمل، حد أدنى 4)
//
// عند أخذ إجازة → الأيام الفعلية = الحضور - (الإجازات × المضاعف)
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
 * تحديد المرحلة الحالية بناءً على أيام العمل
 */
function getStage(workDays: number): { stage: number; label: string; divisor: number } {
  if (workDays <= 0) return { stage: 0, label: 'بداية الحساب', divisor: 4 };
  if (workDays <= 12) return { stage: 1, label: '1️⃣ حتى 12: ÷ 4', divisor: 4 };
  if (workDays <= 18) return { stage: 2, label: '2️⃣ حتى 18: ÷ 4.5', divisor: 4.5 };
  return { stage: 3, label: '3️⃣ 19 فأكثر: ÷ 5', divisor: 5 };
}

/**
 * حساب أيام العمل المستهلكة بسبب الإجازات (بالمضاعف)
 * كل يوم إجازة يخصم عدد من أيام الحضور حسب المرحلة الأصلية
 */
function calculateConsumedWorkDays(vacationDaysTaken: number, originalStage: number): number {
  if (vacationDaysTaken <= 0) return 0;
  let multiplier = 4;
  if (originalStage === 2) multiplier = 4.5;
  else if (originalStage === 3) multiplier = 5;
  return Math.round(vacationDaysTaken * multiplier);
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
 * 🎯 الدالة الرئيسية لحساب الإجازات المتدرجة
 * 
 * مثال:
 * - حاضر 36 يوم، أخد 4 إجازة اعتيادية
 * - مرحلة أصلية: 3 (مضاعف ×5)
 * - مستهلك: 4 × 5 = 20
 * - الأيام الفعلية: 36 - 20 = 16
 * - المرحلة الحالية: 2
 * - المستحقة (المتاح): 3
 */
export function computeGraduatedVacation(
  totalPresent: number,
  vacationDaysTaken: number = 0,
): GraduatedResult {
  const workDays = Math.max(0, Math.floor(totalPresent));
  
  // حدد المرحلة الأصلية بناءً على إجمالي الحضور (للمضاعف)
  const originalStage = getStage(workDays);
  
  // احسب أيام العمل المستهلكة بسبب الإجازات
  const consumedWorkDays = calculateConsumedWorkDays(vacationDaysTaken, originalStage.stage);
  
  // الأيام الفعلية = إجمالي الحضور - المستهلك
  const effectivePresent = Math.max(0, workDays - consumedWorkDays);
  
  // حدد المرحلة الحالية بناءً على الأيام الفعلية
  const currentStage = getStage(effectivePresent);
  
  // الرصيد المتاح (بعد الخصم) - محسوب من الأيام الفعلية
  const earned = earnedVacationDaysForWorkDays(effectivePresent);
  
  // حساب المحطة التالية والتقدم
  const nextMilestone = findNextMilestone(effectivePresent, earned);
  const currentMilestone = findCurrentMilestone(effectivePresent, earned);
  const totalGap = Math.max(1, nextMilestone - currentMilestone);
  const doneInGap = Math.max(0, effectivePresent - currentMilestone);

  return {
    stage: currentStage.stage,
    stageLabel: currentStage.label,
    earned,                       // 🎯 الرصيد المتاح
    daysToNext: Math.max(0, nextMilestone - effectivePresent),
    progressPct: Math.min(100, Math.round((doneInGap / totalGap) * 100)),
    effectivePresent,             // 🎯 الأيام الفعلية بعد الخصم
    consumedWorkDays,             // الأيام المستهلكة
  };
}
