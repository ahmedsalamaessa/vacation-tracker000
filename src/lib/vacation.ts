export interface GraduatedResult {
  stage: number;
  stageLabel: string;
  earned: number;
  daysToNext: number;
  progressPct: number;
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

export function computeGraduatedVacation(totalPresent: number): GraduatedResult {
  const workDays = Math.max(0, Math.floor(totalPresent));
  const earned = earnedVacationDaysForWorkDays(workDays);
  const stage = getStage(workDays);
  const nextMilestone = findNextMilestone(workDays, earned);
  const currentMilestone = findCurrentMilestone(workDays, earned);
  const totalGap = Math.max(1, nextMilestone - currentMilestone);
  const doneInGap = Math.max(0, workDays - currentMilestone);

  return {
    stage: stage.stage,
    stageLabel: stage.label,
    earned,
    daysToNext: Math.max(0, nextMilestone - workDays),
    progressPct: Math.min(100, Math.round((doneInGap / totalGap) * 100)),
  };
}
