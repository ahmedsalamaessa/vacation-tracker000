export interface StatusDef {
  value: string;
  label: string;
  emoji: string;
  className: string;
}

export const ARABIC_MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

export const ATTENDANCE_STATUSES: StatusDef[] = [
  { value: "حاضر", label: "حاضر", emoji: "✅", className: "bg-green-100 text-green-800 border-green-300" },
  { value: "سهر", label: "سهر", emoji: "🏗️", className: "bg-indigo-100 text-indigo-800 border-indigo-300" },
  { value: "عارضة حضور", label: "عارضة حضور", emoji: "🟡", className: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  { value: "عارضة إجازة", label: "عارضة إجازة", emoji: "⛱️", className: "bg-orange-100 text-orange-800 border-orange-300" },
  { value: "إجازة عارضة", label: "إجازة عارضة", emoji: "🌴", className: "bg-orange-100 text-orange-800 border-orange-300" },
  { value: "إجازة مرضية", label: "إجازة مرضية", emoji: "🤒", className: "bg-pink-100 text-pink-800 border-pink-300" },
  { value: "إجازة رسمية", label: "إجازة رسمية", emoji: "🏛️", className: "bg-slate-100 text-slate-800 border-slate-300" },
  { value: "إجازة سنوية", label: "إجازة سنوية", emoji: "🎉", className: "bg-purple-100 text-purple-800 border-purple-300" },
  { value: "إجازة اعتيادية", label: "إجازة اعتيادية", emoji: "🏠", className: "bg-teal-100 text-teal-800 border-teal-300" },
  { value: "بدل سهرة", label: "بدل سهرة", emoji: "🌙", className: "bg-cyan-100 text-cyan-800 border-cyan-300" },
  { value: "غياب", label: "غياب", emoji: "❌", className: "bg-red-100 text-red-800 border-red-300" },
  { value: "بدون مرتب", label: "بدون مرتب", emoji: "💰", className: "bg-amber-100 text-amber-800 border-amber-300" },
];

export const STATUS_MAP: Record<string, StatusDef> = Object.fromEntries(
  ATTENDANCE_STATUSES.map((s) => [s.value, s]),
);

export const WORK_DAY_PRESETS: {
  label: string;
  workDays: number;
  vacationDays: number;
}[] = [
  { label: "12 يوم عمل / 3 أيام إجازة", workDays: 12, vacationDays: 3 },
  { label: "18 يوم عمل / 4 أيام إجازة", workDays: 18, vacationDays: 4 },
  { label: "25 يوم عمل / 5 أيام إجازة", workDays: 25, vacationDays: 5 },
];

export const VACATION_TYPES = [
  "اعتيادية",
  "عارضة",
  "رسمية",
  "سنوية",
  "مرضية",
  "بدون مرتب",
];

export const VALID_STATUSES = new Set([
  "حاضر",
  "سهر",
  "عارضة حضور",
  "عارضة إجازة",
  "إجازة عارضة",
  "إجازة مرضية",
  "إجازة رسمية",
  "إجازة سنوية",
  "غياب",
  "بدون مرتب",
  "إجازة اعتيادية",
  "بدل سهرة",
  "",
]);
