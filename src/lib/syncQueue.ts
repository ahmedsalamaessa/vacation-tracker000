/**
 * Offline Sync Queue & Network Status Manager (طابور المزامنة الذكي للأوفلاين)
 * يضمن حفظ بصمات المساحين وساعات المعدات وطلبات الإجازات حتى في حالة انقطاع النت في المواقع الصحراوية،
 * ثم رفعها تلقائياً فور عودة الشبكة مع إشعار واهتزاز للهاتف.
 */

import { api } from './api';

export interface OfflineQueueItem {
  id: string;
  type: 
    | 'upsert_attendance' 
    | 'save_machinery_hours' 
    | 'add_vacation' 
    | 'checkout_equipment' 
    | 'return_equipment' 
    | 'check_in_attempt' 
    | 'overtime_request';
  payload: any;
  createdAt: string;
  description: string;
  retryCount: number;
}

const STORAGE_KEY = 'vsys_offline_sync_queue';
const listeners = new Set<(queue: OfflineQueueItem[], isOnline: boolean) => void>();

let isSyncing = false;

export function getOfflineQueue(): OfflineQueueItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveOfflineQueue(queue: OfflineQueueItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {}
  notifyListeners();
}

export function addToOfflineQueue(type: OfflineQueueItem['type'], payload: any, description: string): OfflineQueueItem {
  const item: OfflineQueueItem = {
    id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    payload,
    createdAt: new Date().toISOString(),
    description,
    retryCount: 0,
  };

  const queue = getOfflineQueue();
  queue.push(item);
  saveOfflineQueue(queue);
  return item;
}

export function removeFromOfflineQueue(id: string) {
  const queue = getOfflineQueue().filter(q => q.id !== id);
  saveOfflineQueue(queue);
}

export function clearOfflineQueue() {
  saveOfflineQueue([]);
}

export function subscribeToSyncQueue(cb: (queue: OfflineQueueItem[], isOnline: boolean) => void) {
  listeners.add(cb);
  cb(getOfflineQueue(), typeof navigator !== 'undefined' ? navigator.onLine : true);
  return () => {
    listeners.delete(cb);
  };
}

function notifyListeners() {
  const q = getOfflineQueue();
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  listeners.forEach(cb => {
    try {
      cb(q, online);
    } catch {}
  });
}

/**
 * تنفيذ مزامنة كافة العمليات المعلقة في الطابور مع السيرفر
 */
export async function flushOfflineQueue(): Promise<{ syncedCount: number; failedCount: number; remaining: number }> {
  if (isSyncing) return { syncedCount: 0, failedCount: 0, remaining: getOfflineQueue().length };
  
  const queue = getOfflineQueue();
  if (queue.length === 0) return { syncedCount: 0, failedCount: 0, remaining: 0 };

  isSyncing = true;
  let syncedCount = 0;
  let failedCount = 0;
  const remainingItems: OfflineQueueItem[] = [];

  for (const item of queue) {
    try {
      switch (item.type) {
        case 'upsert_attendance':
          await api.upsertAttendance(item.payload);
          break;
        case 'save_machinery_hours':
          await api.saveMachineryHours(item.payload);
          break;
        case 'add_vacation':
          await api.addVacation(item.payload);
          break;
        case 'checkout_equipment':
          await api.checkoutEquipment(item.payload);
          break;
        case 'return_equipment':
          await api.returnEquipmentCheckout(item.payload);
          break;
        case 'check_in_attempt':
          await api.addAttempt(item.payload);
          break;
        case 'overtime_request':
          await api.submitOvertimeRequest(item.payload);
          break;
      }
      syncedCount++;
    } catch (err) {
      console.warn('Sync item failed:', item, err);
      failedCount++;
      item.retryCount = (item.retryCount || 0) + 1;
      // نتركها في الطابور إذا لم تتجاوز 10 محاولات
      if (item.retryCount < 10) {
        remainingItems.push(item);
      }
    }
  }

  saveOfflineQueue(remainingItems);
  isSyncing = false;

  if (syncedCount > 0 && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate([100, 50, 100]);
    } catch {}
  }

  return { syncedCount, failedCount, remaining: remainingItems.length };
}

// 🌐 الاستماع التلقائي لعودة الإنترنت
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    notifyListeners();
    // مهلة ثانية واحدة لتأكيد استقرار الاتصال ثم رفع البيانات
    setTimeout(() => {
      flushOfflineQueue();
    }, 1200);
  });

  window.addEventListener('offline', () => {
    notifyListeners();
  });
}
