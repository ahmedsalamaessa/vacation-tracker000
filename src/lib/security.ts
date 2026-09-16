/**
 * 🛡️ Security, Anti-Spoofing & Device Binding Library
 * حماية البصمة ومكافحة برامج الـ GPS الوهمي، ربط حساب المساح بموبايله الخاص،
 * وتوثيق محاولات الدخول وحماية الجلسات.
 */

import type { Employee } from './types';

const DEVICE_KEY = 'vsys_device_fingerprint';

/**
 * توليد أو استرجاع البصمة الرقمية الثابتة للهاتف
 */
export function getOrCreateDeviceId(): { deviceId: string; deviceName: string } {
  let deviceId = '';
  try {
    deviceId = localStorage.getItem(DEVICE_KEY) || '';
  } catch {}

  if (!deviceId) {
    const entropy = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      screen.colorDepth,
      new Date().getTimezoneOffset(),
      Math.random().toString(36).slice(2),
      Date.now().toString(36),
    ].join('###');

    // Simple hash
    let hash = 0;
    for (let i = 0; i < entropy.length; i++) {
      hash = (hash << 5) - hash + entropy.charCodeAt(i);
      hash |= 0;
    }
    deviceId = `DEV-${Math.abs(hash).toString(16).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    try {
      localStorage.setItem(DEVICE_KEY, deviceId);
    } catch {}
  }

  const deviceName = detectDeviceName();
  return { deviceId, deviceName };
}

/**
 * تحديد نوع وموديل الجهاز للمعاينة
 */
export function detectDeviceName(): string {
  if (typeof navigator === 'undefined') return 'جهاز غير معروف';
  const ua = navigator.userAgent || '';
  
  if (/iPhone/i.test(ua)) return 'iPhone 📱';
  if (/iPad/i.test(ua)) return 'iPad 📱';
  if (/Samsung/i.test(ua)) return 'Samsung Galaxy 📱';
  if (/Xiaomi|Redmi|POCO/i.test(ua)) return 'Xiaomi / Redmi 📱';
  if (/OPPO|Realme/i.test(ua)) return 'OPPO / Realme 📱';
  if (/Huawei|Honor/i.test(ua)) return 'Huawei / Honor 📱';
  if (/Android/i.test(ua)) return 'هاتف Android 📱';
  if (/Windows/i.test(ua)) return 'كمبيوتر Windows 💻';
  if (/Macintosh/i.test(ua)) return 'جهاز Mac 💻';
  return 'متصفح هاتف 📱';
}

/**
 * 🛰️ فحص ومكافحة برامج الـ GPS الوهمي (Anti-Mock Location)
 */
export function detectLocationSpoofing(location: {
  lat: number;
  lng: number;
  accuracy: number;
  speed: number | null;
}): { isSpoofed: boolean; reason?: string } {
  // 1. فحص الدقة الصفرية غير المنطقية (تطبيقات Mock GPS غالباً تعطي دقة 0.0 أو سالبة)
  if (location.accuracy <= 0.05) {
    return { isSpoofed: true, reason: 'تزييف موقع محتمل (دقة قمر صناعي غير طبيعية 0.0م)' };
  }

  // 2. فحص الإحداثيات المقطوعة أو المصطنعة بدقة مفرطة غير حقيقية
  if (location.lat === 0 && location.lng === 0) {
    return { isSpoofed: true, reason: 'إحداثيات نقطة الصفر (0, 0)' };
  }

  // 3. فحص السرعة الخارقة للعادة
  if (location.speed !== null && location.speed > 55) { // > 200 km/h
    return { isSpoofed: true, reason: `سرعة غير طبيعية للبصمة (${Math.round(location.speed * 3.6)} كم/س)` };
  }

  return { isSpoofed: false };
}

/**
 * 🔒 فحص ربط الجهاز بحساب الموظف (Device Binding Verification)
 */
export function verifyEmployeeDevice(
  employee: Employee,
  currentDeviceId: string
): { isAuthorized: boolean; isFirstTime: boolean; message: string } {
  // إذا لم يكن الموظف مرتبطاً بأي جهاز بعد (أول بصمة له)
  const registered = (employee as any).registeredDeviceId;
  
  if (!registered) {
    return {
      isAuthorized: true,
      isFirstTime: true,
      message: 'تم تسجيل وربط هذا الهاتف بحسابك كجهازك المعتمد لأول مرة بنجاح ✅',
    };
  }

  // إذا كان نفس الجهاز المسجل
  if (registered === currentDeviceId) {
    return {
      isAuthorized: true,
      isFirstTime: false,
      message: 'جهاز معتمد وموثق 🔐',
    };
  }

  // إذا حاول البصمة من جهاز آخر مختلف
  return {
    isAuthorized: false,
    isFirstTime: false,
    message: `❌ محاولة بصمة من هاتف غير مسجل! هذا الحساب مربوط بموبايلك الأساسي (${(employee as any).registeredDeviceName || 'جهاز آخر'}). تواصل مع المهندس أحمد سلامة لاعتماد جهاز جديد.`,
  };
}
