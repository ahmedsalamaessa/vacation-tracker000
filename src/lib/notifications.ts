/**
 * Browser Notification Service
 * Shows desktop notifications for important events
 */

export type NotificationType = 'vacation_request' | 'vacation_approved' | 'vacation_rejected' | 'check_in_reminder' | 'month_locked';

interface NotificationOptions {
  type: NotificationType;
  title: string;
  body: string;
  tag?: string;
  icon?: string;
  badge?: string;
}

let _permissionState: NotificationPermission = 'default';

/**
 * Check if notifications are supported
 */
export function isSupported(): boolean {
  return 'Notification' in window;
}

/**
 * Get current permission state
 */
export function getPermissionState(): NotificationPermission {
  if (!isSupported()) return 'denied';
  _permissionState = Notification.permission;
  return _permissionState;
}

/**
 * Request permission from the user
 */
export async function requestPermission(): Promise<boolean> {
  if (!isSupported()) return false;
  if (Notification.permission === 'granted') return true;
  try {
    const result = await Notification.requestPermission();
    _permissionState = result;
    return result === 'granted';
  } catch {
    return false;
  }
}

/**
 * Show a browser notification
 */
export function showNotification(options: NotificationOptions): boolean {
  if (!isSupported() || Notification.permission !== 'granted') return false;

  try {
    new Notification(options.title, {
      body: options.body,
      tag: options.tag || options.type,
      icon: options.icon || '/favicon.ico',
      badge: options.badge,
      dir: 'rtl',
      lang: 'ar',
      requireInteraction: true,
      silent: false,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Show vacation request notification (for managers)
 */
export function notifyVacationRequest(employeeName: string, type: string, days: number) {
  showNotification({
    type: 'vacation_request',
    title: '🏖️ طلب إجازة جديد',
    body: `${employeeName} طلب إجازة ${type} لمدة ${days} يوم — لازم تراجعها`,
    tag: `vac-request-${Date.now()}`,
  });
}

/**
 * Show vacation decision notification (for employee)
 */
export function notifyVacationDecision(approved: boolean, type: string, days: number) {
  if (approved) {
    showNotification({
      type: 'vacation_approved',
      title: '✅ تم اعتماد إجازتك',
      body: `إجازة ${type} لمدة ${days} يوم تم اعتمادها بنجاح`,
    });
  } else {
    showNotification({
      type: 'vacation_rejected',
      title: '❌ تم رفض إجازتك',
      body: `إجازة ${type} لمدة ${days} يوم تم رفضها`,
    });
  }
}

/**
 * Show check-in reminder
 */
export function notifyCheckInReminder() {
  showNotification({
    type: 'check_in_reminder',
    title: '👆 متنساش تبصم!',
    body: 'لسه مبصمتش النهاردة — دوس "بصمة حضور"',
  });
}

/**
 * Show month locked notification
 */
export function notifyMonthLocked(yearMonth: string) {
  showNotification({
    type: 'month_locked',
    title: '🔒 الشهر اتقفل',
    body: `شهر ${yearMonth} اتقفل — مش تقدر تعدل فيه`,
  });
}

/**
 * Check for pending vacations and show notifications for managers
 * Call this periodically
 */
let _lastNotifiedVacations = new Set<number>();

export function checkPendingVacations(managedEmployeeIds: Set<number>): boolean {
  try {
    const vacsRaw = localStorage.getItem('vsys_vacations');
    if (!vacsRaw) return false;
    const vacs = JSON.parse(vacsRaw);
    let notified = false;
    for (const v of vacs) {
      if (v.status === 'بانتظار الموافقة' && managedEmployeeIds.has(v.employeeId) && !_lastNotifiedVacations.has(v.id)) {
        const empName = v.employeeName || 'موظف';
        notifyVacationRequest(empName, v.vacationType || 'اعتيادية', v.vacationDays || 1);
        _lastNotifiedVacations.add(v.id);
        notified = true;
      }
    }
    return notified;
  } catch {
    return false;
  }
}
