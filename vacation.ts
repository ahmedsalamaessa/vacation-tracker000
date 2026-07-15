export interface GraduatedResult {
  stage: number;
  stageLabel: string;
  earned: number;
  daysToNext: number;
  progressPct: number;
  effectivePresent: number;
  consumedWorkDays: number;
}

export function earnedVacationDaysForWorkDays(workDays: number): number {
  const days = Math.max(0, Math.floor(workDays));
  if (days <= 0) return 0;
  
  if (days <= 12) {
    return Math.floor(days / 4);
  }
  
  if (days <= 18) {
    // الموظف اجتاز المرحلة الأولى، لذا لا يمكن أن يقل رصيده عن 3 أيام
    return Math.max(3, Math.floor(days / 4.5));
  }
  
  // الموظف اجتاز المرحلة الثانية، لذا لا يمكن أن يقل رصيده عن 4 أيام
  return Math.max(4, Math.floor(days / 5));
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

function calculateConsumedWorkDaysSimple(vacationDaysTaken: number, currentStage: number): number {
  if (vacationDaysTaken <= 0) return 0;
  let multiplier = 4;
  if (currentStage === 2) multiplier = 4.5;
  else if (currentStage === 3) multiplier = 5;
  return Math.round(vacationDaysTaken * multiplier);
}

export function computeGraduatedVacation(
  totalPresent: number,
  vacationDaysTaken: number = 0
): GraduatedResult {
  const workDays = Math.max(0, Math.floor(totalPresent));
  const originalStage = getStage(workDays);
  const consumedWorkDays = calculateConsumedWorkDaysSimple(
    vacationDaysTaken,
    originalStage.stage
  );
  const effectivePresent = Math.max(0, workDays - consumedWorkDays);
  const currentStage = getStage(effectivePresent);
  const earned = earnedVacationDaysForWorkDays(effectivePresent);
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
    effectivePresent,
    consumedWorkDays,
  };
}
