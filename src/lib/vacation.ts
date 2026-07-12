export interface GraduatedResult {
  stage: number;
  stageLabel: string;
  earned: number;
  daysToNext: number;
  progressPct: number;
  effectivePresent: number;      // 🆕 الحضور المتبقي بعد الإجازات
  consumedWorkDays: number;       // 🆕 أيام العمل المستهلكة على الإجازات
}

export function earnedVacationDaysForWorkDays(workDays: number): number {
  const days = Math.max(0, Math.floor(workDays));
  if (days <= 0) return 0;
  if (days <= 12) return Math.floor(days / 4);
  if (days <= 18) return Math.floor(days / 4.5);
  return Math.floor(days / 5);
}

function getStage(workDays: number): { stage: number; label: string; divisor: number } {
  if (workDays <= 0) return { stage: 0, label: "بداية الحساب", divisor: 4 };
  if (workDays <= 12) return { stage: 1, label: "1️⃣ حتى 12: ÷ 4", divisor: 4 };
  if (workDays <= 18) return { stage: 2, label: "2️⃣ حتى 18: ÷ 4.5", divisor: 4.5 };
  return { stage: 3, label: "3️⃣ 19 فأكثر: ÷ 5", divisor: 5 };
}

function findNextMilestone(workDays: number, earned: number): number {
  for (let day = workDays + 1; day <= workDays + 400; day += 1) {
    if (earnedVacationDaysForWorkDays(day) > earned) return day;
  }
  return workDays;
}

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

// 🆕 دالة تحسب أيام العمل المستهلكة على الإجازات (بناءً على مراحل الاستهلاك)
function calculateConsumedWorkDays(vacationDaysTaken: number, totalPresent: number): number {
  if (vacationDaysTaken <= 0) return 0;
  
  // نحسب: كم يوم عمل استهلكت هذه الإجازات؟
  // نبدأ من إجمالي الحضور ونرجع للخلف حتى نصل للحضور اللي أنتج هذه الإجازات
  let consumed = 0;
  let remainingVacations = vacationDaysTaken;
  let currentDay = totalPresent;
  
  while (remainingVacations > 0 && currentDay > 0) {
    const earnedAtThisDay = earnedVacationDaysForWorkDays(currentDay);
    const earnedAtPrevDay = earnedVacationDaysForWorkDays(currentDay - 1);
    
    if (earnedAtThisDay > earnedAtPrevDay) {
      // هذا اليوم أنتج إجازة جديدة
      const daysConsumedHere = currentDay - findCurrentMilestone(currentDay - 1, earnedAtPrevDay);
      consumed += Math.min(daysConsumedHere, 5); // أقصى 5 أيام لكل إجازة (المرحلة 3)
      remainingVacations--;
    }
    currentDay--;
  }
  
  return consumed;
}

// 🆕 نسخة بسيطة أدق (استخدام مباشر لمعامل المرحلة)
function calculateConsumedWorkDaysSimple(vacationDaysTaken: number, currentStage: number): number {
  if (vacationDaysTaken <= 0) return 0;
  let multiplier = 4;
  if (currentStage === 2) multiplier = 4.5;
  else if (currentStage === 3) multiplier = 5;
  return Math.round(vacationDaysTaken * multiplier);
}

/**
 * 🆕 الدالة الجديدة: تحسب الرصيد حسب الحضور المتبقي (بعد خصم الإجازات)
 * 
 * @param totalPresent - إجمالي الحضور الفعلي
 * @param vacationDaysTaken - عدد الإجازات المأخوذة (اختياري)
 */
export function computeGraduatedVacation(
  totalPresent: number,
  vacationDaysTaken: number = 0
): GraduatedResult {
  const workDays = Math.max(0, Math.floor(totalPresent));
  
  // 🆕 حساب المرحلة الأصلية من إجمالي الحضور (عشان نعرف بأي معامل نستهلك)
  const originalStage = getStage(workDays);
  
  // 🆕 حساب أيام العمل المستهلكة على الإجازات المأخوذة
  const consumedWorkDays = calculateConsumedWorkDaysSimple(
    vacationDaysTaken,
    originalStage.stage
  );
  
  // 🆕 الحضور المتبقي (بعد خصم الاستهلاك)
  const effectivePresent = Math.max(0, workDays - consumedWorkDays);
  
  // 🆕 المرحلة الحالية بناءً على الحضور المتبقي
  const currentStage = getStage(effectivePresent);
  
  // 🆕 الرصيد المستحق من الحضور المتبقي
  const earned = earnedVacationDaysForWorkDays(effectivePresent);
  
  // 🆕 حساب المسار للإجازة القادمة (من الحضور المتبقي)
  const nextMilestone = findNextMilestone(effectivePresent, earned);
  const currentMilestone = findCurrentMilestone(effectivePresent, earned);
  const totalGap = Math.max(1, nextMilestone - currentMilestone);
  const doneInGap = Math.max(0, effectivePresent - currentMilestone);

  return {
    stage: currentStage.stage,
    stageLabel: currentStage.label,
    earned,
    daysToNext: Math.max(0, nextMilestone - effectivePresent),
    progressPct: Math.min(100, Math.round((doneInGap / totalGap) * 100)),
    effectivePresent,       // 🆕
    consumedWorkDays,       // 🆕
  };
}
