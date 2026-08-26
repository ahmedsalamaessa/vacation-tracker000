import type { EquipmentKind } from '../lib/types';

// 🗂️ أنواع العدة المشتركة بين تبويب العدة وتبويب العهدة
export const KINDS: EquipmentKind[] = [
  'توتال استيشن', 'ميزان',
  'قامة 5م', 'قامة 7م', 'حامل ميزان ألومنيوم',
  'حامل توتال خشب', 'بريزم 2.6م', 'بريزم 4.6م', 'ميني بريزم',
  'أخرى',
];

export const KIND_GROUPS: { title: string; kinds: string[] }[] = [
  { title: 'الأجهزة الرئيسية', kinds: ['توتال استيشن', 'ميزان'] },
  { title: 'ملحقات الميزان', kinds: ['قامة 5م', 'قامة 7م', 'حامل ميزان ألومنيوم'] },
  { title: 'ملحقات التوتال (الحامل خشب)', kinds: ['حامل توتال خشب', 'بريزم 2.6م', 'بريزم 4.6م', 'ميني بريزم'] },
  { title: 'أخرى', kinds: ['أخرى'] },
];

export function kindEmoji(kind: string): string {
  switch (kind) {
    case 'توتال استيشن': case 'تواتال ستايشن': return '🔭';
    case 'ميزان': return '📏';
    case 'قامة 5م': case 'قامة 7م': return '📐';
    case 'حامل ميزان ألومنيوم': case 'حامل توتال ألومنيوم': case 'حامل توتال خشب': return '🛠️';
    case 'بريزم': case 'بريزم 2.6م': case 'بريزم 4.6م': return '💎';
    case 'ميني بريزم': return '🔹';
    default: return '📦';
  }
}
