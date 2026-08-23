import { api } from './api';
import { getCasualBalance, DEFAULT_CASUAL_QUOTA } from './balance';
import { refreshFromRemote } from './db';
import type { Employee } from './types';

export async function requestPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch (e) {
    console.error('Notification permission error', e);
    return false;
  }
}

export function isSupported(): boolean {
  return 'Notification' in window && 'ServiceWorker' in window;
}

// 🔔 نغمة تنبيه قصيرة (Web Audio — من غير أي ملفات خارجية)
let audioCtx: AudioContext | null = null;
export function playChime() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx || new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    // نغمتين لطيفتين
    [
      { freq: 830, at: 0 },
      { freq: 1108.7, at: 0.18 },
    ].forEach(({ freq, at }) => {
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(0.18, now + at + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.5);
      osc.connect(gain).connect(audioCtx!.destination);
      osc.start(now + at);
      osc.stop(now + at + 0.55);
    });
  } catch {
    // تجاهل — الصوت رفاهية
  }
}

// 🖥️ إشعار متصفح (لو المستخدم سامح بالأذونات)
export function showBrowserNotification(title: string, body: string) {
  try {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    new Notification(title, { body, icon: undefined, tag: 'vacation-system' });
  } catch {
    // تجاهل
  }
}

export interface ManagerPollResult {
  pending: number;
  casualOver: { emp: Employee; spent: number; quota: number; remaining: number }[];
}

/**
 * 🔄 دورة المدير: تحديث البيانات من السيرفر + حساب التنبيهات
 * (بتحدث نسخة المتصفح كمان عشان كل المستخدمين يفضلوا متزامنين)
 */
export async function pollManagerAlerts(user: Employee): Promise<ManagerPollResult | null> {
  const data = await refreshFromRemote();
  if (!data) return null;

  // الطلبات المعلقة في نطاق المسؤول
  const managedIds = new Set<number>([user.id]);
  if (user.role === 'admin') {
    for (const e of data.employees || []) managedIds.add(e.id);
  } else if ((user.locationIds || []).length > 0) {
    for (const e of data.employees || []) {
      if (e.active && (e.locationIds || []).some((id: number) => user.locationIds.includes(id))) {
        managedIds.add(e.id);
      }
    }
  }
  const pending = (data.vacations || []).filter(
    (v: any) => v.status === 'بانتظار الموافقة' && managedIds.has(v.employeeId),
  ).length;

  // ⚠️ اللي تجاوزوا رصيد العارضة
  const quota = Number(data.settings?.casual_annual_quota) || DEFAULT_CASUAL_QUOTA;
  const casualOver: ManagerPollResult['casualOver'] = [];
  for (const emp of data.employees || []) {
    if (!emp.active) continue;
    if (!managedIds.has(emp.id)) continue;
    if (emp.role === 'admin') continue;
    const empAtt = (data.attendance || []).filter((a: any) => a.employeeId === emp.id);
    const casual = getCasualBalance(empAtt, quota);
    if (casual.remaining < 0) {
      casualOver.push({ emp, spent: casual.spent, quota: casual.quota, remaining: casual.remaining });
    }
  }

  // إرسال إشعارات تجاوز العارضة (مرة واحدة لكل موظف — من غير تكرار)
  const existing = new Set<number>(
    (data.notifications || [])
      .filter((n: any) => n.type === 'casual_over_limit' && n.entityId != null)
      .map((n: any) => n.entityId as number),
  );
  const targets = (data.employees || [])
    .filter((e: Employee) => e.active && (e.role === 'admin' || e.role === 'manager'))
    .map((e: Employee) => e.id);
  for (const item of casualOver) {
    if (existing.has(item.emp.id)) continue;
    api
      .addNotification({
        type: 'casual_over_limit',
        title: '⚠️ تجاوز رصيد العارضة',
        body: `${item.emp.name} استخدم ${item.spent} من ${item.quota} عارضة — تجاوز الرصيد بمقدار ${Math.abs(item.remaining)} يوم`,
        employeeId: item.emp.id,
        targetUserIds: targets,
        readBy: [],
        entityType: 'employee',
        entityId: item.emp.id,
        severity: 'warn',
      } as any)
      .catch(() => {});
  }

  return { pending, casualOver };
}
