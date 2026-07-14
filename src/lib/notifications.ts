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

export async function checkPendingVacations(managedIds: Set<number>) {
  // This is usually handled by the server, but we can implement a client-side check
  // if needed. For now, we'll just log it or let the bootstrap handle the count.
  console.log('Checking pending vacations for employees:', Array.from(managedIds));
}
