export const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

export const STATUS_MAP: Record<string, { emoji: string; color: string }> = {
  'حاضر': { emoji: '✅', color: 'green' },
  'غياب': { emoji: '❌', color: 'red' },
  'سهر': { emoji: '🌙', color: 'blue' },
  'بدل سهرة': { emoji: '🌙', color: 'cyan' },
  'إجازة مرضية': { emoji: '🤒', color: 'amber' },
  'إجازة رسمية': { emoji: '🏛️', color: 'indigo' },
  'بدون مرتب': { emoji: '💰', color: 'slate' },
  'عارضة حضور': { emoji: '⚡', color: 'emerald' },
  'إجازة عارضة': { emoji: '⚡', color: 'orange' },
  'إجازة اعتيادية': { emoji: '🏖️', color: 'sky' },
};

export const VACATION_TYPES = [
  { id: 'نظامية', label: 'إجازة نظامية', emoji: '📅' },
  { id: 'اعتيادية', label: 'إجازة اعتيادية', emoji: '🏖️' },
  { id: 'عارضة', label: 'إجازة عارضة', emoji: '⚡' },
  { id: 'مرضية', label: 'إجازة مرضية', emoji: '🤒' },
  { id: 'رسمية', label: 'إجازة رسمية', emoji: '🏛️' },
  { id: 'بدون مرتب', label: 'إجازة بدون مرتب', emoji: '💰' },
  { id: 'بدل سهرة', label: 'بدل سهرة', emoji: '🌙', color: 'cyan' },
];

export const VACATION_STATUSES = [
  { id: 'بانتظار الموافقة', label: 'بانتظار الموافقة', color: 'amber' },
  { id: 'مقبولة', label: 'مقبولة', color: 'green' },
  { id: 'مرفوضة', label: 'مرفوضة', color: 'red' },
  { id: 'جارية', label: 'جارية', color: 'blue' },
  { id: 'منتهية', label: 'منتهية', color: 'slate' },
  { id: 'مجدولة', label: 'مجدولة', color: 'indigo' },
];

export const ATTENDANCE_STATUSES = [
  { id: 'حاضر', label: 'حاضر', color: 'green' },
  { id: 'غياب', label: 'غياب', color: 'red' },
  { id: 'سهر', label: 'سهر', color: 'blue' },
  { id: 'بدل سهرة', label: 'بدل سهرة', color: 'cyan' },
  { id: 'إجازة مرضية', label: 'إجازة مرضية', color: 'amber' },
  { id: 'إجازة رسمية', label: 'إجازة رسمية', color: 'indigo' },
  { id: 'بدون مرتب', label: 'بدون مرتب', color: 'slate' },
  { id: 'عارضة حضور', label: 'عارضة حضور', color: 'emerald' },
  { id: 'إجازة عارضة', label: 'إجازة عارضة', color: 'orange' },
  { id: 'إجازة اعتيادية', label: 'إجازة اعتيادية', color: 'sky' },
];
