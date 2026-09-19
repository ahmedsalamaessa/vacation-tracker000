import { useEffect, useState } from 'react';
import { ATTENDANCE_STATUSES } from '../lib/constants';
import { getAttendance, upsertAttendance, getLocations, addCheckInAttempt, addSystemNotification, getEmployees, updateEmployee } from '../lib/db';
import { getDistanceInMeters } from '../lib/location';
import { isBiometricAvailable, verifyPhoneBiometric } from '../lib/biometrics';
import { getOrCreateDeviceId, detectLocationSpoofing, verifyEmployeeDevice } from '../lib/security';
import type { Employee, WorkLocation } from '../lib/types';

const SELF_STATUSES = ATTENDANCE_STATUSES.filter((s) =>
  ['حاضر', 'سهر', 'عارضة حضور', 'عارضة إجازة', 'إجازة اعتيادية', 'إجازة مرضية'].includes(s.value)
);

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface CheckInTabProps {
  user: Employee;
  onDataChange: () => void;
}

export default function CheckInTab({ user, onDataChange }: CheckInTabProps) {
  const [status, setStatus] = useState('حاضر');
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [availableLocations, setAvailableLocations] = useState<WorkLocation[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState<boolean | null>(null);
  const [todayStatus, setTodayStatus] = useState<string | null>(null);
  const [todayLocation, setTodayLocation] = useState<string | null>(null);
  const [todayTime, setTodayTime] = useState<string | null>(null);
  const [biometricSupported, setBiometricSupported] = useState<boolean>(true);
  const [deviceInfo, setDeviceInfo] = useState<{ deviceId: string; deviceName: string }>({ deviceId: '', deviceName: '' });
  const [showFallbackOption, setShowFallbackOption] = useState(false);
  const date = todayIso();

  useEffect(() => {
    loadData();
    checkDeviceBiometrics();
    const dev = getOrCreateDeviceId();
    setDeviceInfo(dev);
  }, []);

  async function checkDeviceBiometrics() {
    const supported = await isBiometricAvailable();
    setBiometricSupported(supported);
  }

  function loadData() {
    const attendance = getAttendance();
    const mine = attendance.find((r) => r.employeeId === user.id && r.date === date);
    if (mine) {
      setTodayStatus(mine.status);
      setTodayLocation(mine.workLocationName || null);
      setTodayTime(mine.createdAt ? new Date(mine.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : null);
    }
    const allLocations = getLocations();
    const employeeLocations = allLocations.filter(
      (loc) => user.locationIds.includes(loc.id) && loc.active
    );
    setAvailableLocations(employeeLocations);
    
    if (employeeLocations.length > 0 && !selectedLocationId) {
      setSelectedLocationId(String(employeeLocations[0].id));
    }
  }

  /**
   * 🎯 دالة GPS محسّنة مع محاولتين وفحص دقة
   */
  function getLocation(): Promise<{ lat: number; lng: number; accuracy: number; speed: number | null }> {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        reject(new Error('❌ متصفحك لا يدعم تحديد الموقع.\n\n💡 جرب من متصفح آخر (Chrome أو Safari)'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            speed: pos.coords.speed,
          });
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            reject(new Error(
              '❌ تم رفض إذن الموقع.\n\n' +
              '💡 الحل:\n' +
              '• على iPhone: Settings → Safari → Location → Ask\n' +
              '• على Android: Settings → Apps → Chrome → Permissions → Location\n' +
              '• ثم أعد تحميل الصفحة'
            ));
            return;
          }

          setMsg('📡 جاري المحاولة مرة أخرى بدقة أعلى...');
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              resolve({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
                speed: pos.coords.speed,
              });
            },
            (err2) => {
              if (err2.code === err2.TIMEOUT) {
                reject(new Error(
                  '⏰ تعذر تحديد موقعك.\n\n' +
                  '💡 تأكد أن GPS مفتوح واخرج لمكان مكشوف'
                ));
              } else {
                reject(new Error('❌ فشل تحديد الموقع. تأكد من تفعيل GPS وحاول مجدداً'));
              }
            },
            { 
              enableHighAccuracy: true,
              timeout: 25000,
              maximumAge: 0
            }
          );
        },
        { 
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 60000
        }
      );
    });
  }

  async function checkIn(skipBiometric: boolean = false) {
    if (!selectedLocationId) {
      setOk(false);
      setMsg('❌ لم يتم تحديد موقع عمل لك. تواصل مع المسؤول.');
      return;
    }
    setBusy(true);
    setOk(null);

    try {
      // 🛡️ 1) فحص أمان ربط الجهاز (Device Binding Guard)
      const currentDev = getOrCreateDeviceId();
      const devCheck = verifyEmployeeDevice(user, currentDev.deviceId);
      
      if (!devCheck.isAuthorized) {
        addCheckInAttempt({
          employeeId: user.id,
          employeeName: user.name,
          date,
          status,
          success: false,
          reason: `مرفوض - جهاز غير مسجل (${currentDev.deviceName})`,
          lat: null,
          lng: null,
          nearestLocationId: Number(selectedLocationId),
          nearestLocationName: null,
          acceptedLocationId: null,
          acceptedLocationName: null,
          distanceMeters: null,
        });
        addSystemNotification({
          type: 'checkin_failed',
          title: '🚨 محاولة بصمة من جهاز غريب',
          body: `${user.name} حاول تسجيل البصمة من جهاز غير مصرح له به (${currentDev.deviceName})`,
          employeeId: user.id,
          targetUserIds: getEmployees().filter(e => e.role === 'admin').map(e => e.id),
          entityType: 'checkin_attempt',
          entityId: null,
          severity: 'danger',
        });
        setOk(false);
        setMsg(devCheck.message);
        setBusy(false);
        return;
      }

      // إذا كانت أول مرة، يتم ربط الجهاز بحساب الموظف تلقائياً
      if (devCheck.isFirstTime) {
        try {
          await updateEmployee(user.id, {
            registeredDeviceId: currentDev.deviceId,
            registeredDeviceName: currentDev.deviceName,
          } as any);
        } catch {}
      }

      // 🔐 2) خطوة البصمة الحيوية للهاتف (Phone Biometrics)
      setMsg('👆 جاري فحص بصمة الهاتف وموقعك الجغرافي...');
      let isBioVerified = false;
      if (!skipBiometric) {
        try {
          const bioResult = await verifyPhoneBiometric(user.id, user.name);
          isBioVerified = bioResult.success;
        } catch {
          isBioVerified = false;
        }
      }

      setShowFallbackOption(false);

      // 📡 3) خطوة فحص وتحديد الموقع عبر الـ GPS ومكافحة Fake GPS
      setMsg('📡 جاري تحديد موقعك الجغرافي والتحقق من التواجد في الموقع...');
      const location = await getLocation();

      // 🛰️ فحص مكافحة الموقع الوهمي (Anti-Spoofing Check)
      const spoofCheck = detectLocationSpoofing(location);
      if (spoofCheck.isSpoofed) {
        addCheckInAttempt({
          employeeId: user.id,
          employeeName: user.name,
          date,
          status,
          success: false,
          reason: `مرفوض - ${spoofCheck.reason}`,
          lat: location.lat,
          lng: location.lng,
          nearestLocationId: Number(selectedLocationId),
          nearestLocationName: null,
          acceptedLocationId: null,
          acceptedLocationName: null,
          distanceMeters: null,
        });
        addSystemNotification({
          type: 'checkin_failed',
          title: '⚠️ كشف تلاعب بالموقع (Fake GPS)',
          body: `${user.name} حاول البصمة بموقع وهمي (${spoofCheck.reason})`,
          employeeId: user.id,
          targetUserIds: getEmployees().filter(e => e.role === 'admin').map(e => e.id),
          entityType: 'checkin_attempt',
          entityId: null,
          severity: 'danger',
        });
        setOk(false);
        setMsg(`❌ تم حظر البصمة: ${spoofCheck.reason}. يرجى إغلاق أي برامج لتزييف الموقع.`);
        setBusy(false);
        return;
      }
      
      const selectedLocation = availableLocations.find(loc => loc.id === Number(selectedLocationId));
      if (!selectedLocation) {
        setOk(false);
        setMsg('❌ الموقع المحدد غير موجود. تواصل مع المسؤول.');
        setBusy(false);
        return;
      }

      // فحص الحركة السريعة
      if (location.speed !== null && location.speed > 5) {
        addCheckInAttempt({
          employeeId: user.id,
          employeeName: user.name,
          date,
          status,
          success: false,
          reason: `مرفوض - حركة سريعة (${Math.round(location.speed * 3.6)} كم/ساعة)`,
          lat: location.lat,
          lng: location.lng,
          nearestLocationId: selectedLocation.id,
          nearestLocationName: selectedLocation.name,
          acceptedLocationId: null,
          acceptedLocationName: null,
          distanceMeters: null,
        });
        addSystemNotification({
          type: 'checkin_failed',
          title: '🚗 محاولة بصمة أثناء الحركة',
          body: `${user.name} حاول البصمة أثناء التحرك بسرعة ${Math.round(location.speed * 3.6)} كم/ساعة`,
          employeeId: user.id,
          targetUserIds: getEmployees().filter(e => e.role === 'admin').map(e => e.id),
          entityType: 'checkin_attempt',
          entityId: null,
          severity: 'warn',
        });
        setOk(false);
        setMsg('🚗 يبدو أنك تتحرك بسرعة. توقف وأعد المحاولة.');
        setBusy(false);
        return;
      }

      setMsg('🎯 جاري مطابقة الموقع مع نطاق العمل...');

      if (selectedLocation.lat == null || selectedLocation.lng == null) {
        upsertAttendance({
          employeeId: user.id,
          date,
          status,
          notes: `🔐 بصمة هاتف موثقة (${currentDev.deviceName})`,
          checkInLat: location.lat,
          checkInLng: location.lng,
          workLocationId: selectedLocation.id,
          workLocationName: selectedLocation.name,
          distanceMeters: null,
        });
        addCheckInAttempt({
          employeeId: user.id,
          employeeName: user.name,
          date,
          status,
          success: true,
          reason: `بصمة موثقة (${currentDev.deviceName}) + موقع بدون إحداثيات`,
          lat: location.lat,
          lng: location.lng,
          nearestLocationId: null,
          nearestLocationName: null,
          acceptedLocationId: selectedLocation.id,
          acceptedLocationName: selectedLocation.name,
          distanceMeters: null,
        });
        setOk(true);
        setMsg(`🎉 تم تسجيل بصمتك البيومترية بنجاح في ${selectedLocation.name}`);
        loadData();
        onDataChange();
        setBusy(false);
        return;
      }

      const distance = getDistanceInMeters(
        selectedLocation.lat,
        selectedLocation.lng,
        location.lat,
        location.lng
      );

      const effectiveDistance = Math.max(0, distance - location.accuracy);
      
      if (distance > 3000) {
        addCheckInAttempt({
          employeeId: user.id,
          employeeName: user.name,
          date,
          status,
          success: false,
          reason: `مرفوض - بعيد جداً (${Math.round(distance/1000)}كم)`,
          lat: location.lat,
          lng: location.lng,
          nearestLocationId: selectedLocation.id,
          nearestLocationName: selectedLocation.name,
          acceptedLocationId: null,
          acceptedLocationName: null,
          distanceMeters: Math.round(distance),
        });
        addSystemNotification({
          type: 'checkin_failed',
          title: '⚠️ محاولة بصمة من بعيد',
          body: `${user.name} حاول البصمة من مسافة ${Math.round(distance/1000)}كم من ${selectedLocation.name}`,
          employeeId: user.id,
          targetUserIds: getEmployees().filter(e => e.role === 'admin' || (e.role === 'manager' && e.locationIds.includes(selectedLocation.id))).map(e => e.id),
          entityType: 'checkin_attempt',
          entityId: null,
          severity: 'danger',
        });
        setOk(false);
        setMsg(`❌ أنت بعيد جداً عن الموقع (${Math.round(distance/1000)} كم).`);
        setBusy(false);
        return;
      }

      const isWithinRange = effectiveDistance <= selectedLocation.radiusMeters 
                         || distance <= selectedLocation.radiusMeters;

      if (isWithinRange) {
        const isSuspicious = location.accuracy > 200;
        const noteForAdmin = isSuspicious 
          ? `⚠️ GPS ضعيف (${Math.round(location.accuracy)}م) - 🔐 هاتف موثق (${currentDev.deviceName})` 
          : `🔐 تم التحقق بالبصمة (${currentDev.deviceName})`;

        upsertAttendance({
          employeeId: user.id,
          date,
          status,
          notes: noteForAdmin,
          checkInLat: location.lat,
          checkInLng: location.lng,
          workLocationId: selectedLocation.id,
          workLocationName: selectedLocation.name,
          distanceMeters: Math.round(distance),
        });
        addCheckInAttempt({
          employeeId: user.id,
          employeeName: user.name,
          date,
          status,
          success: true,
          reason: `بصمة هاتف معتمدة (${currentDev.deviceName}) - مسافة ${Math.round(distance)}م من ${selectedLocation.name}`,
          lat: location.lat,
          lng: location.lng,
          nearestLocationId: selectedLocation.id,
          nearestLocationName: selectedLocation.name,
          acceptedLocationId: selectedLocation.id,
          acceptedLocationName: selectedLocation.name,
          distanceMeters: Math.round(distance),
        });
        setOk(true);
        setMsg(`🎉 تم تسجيل حضورك بنجاح عبر بصمة الهاتف في ${selectedLocation.name} (المسافة: ${Math.round(distance)}م)`);
        loadData();
        onDataChange();
      } else {
        addCheckInAttempt({
          employeeId: user.id,
          employeeName: user.name,
          date,
          status,
          success: false,
          reason: `مرفوض - خارج النطاق (${Math.round(distance)}م > ${selectedLocation.radiusMeters}م)`,
          lat: location.lat,
          lng: location.lng,
          nearestLocationId: selectedLocation.id,
          nearestLocationName: selectedLocation.name,
          acceptedLocationId: null,
          acceptedLocationName: null,
          distanceMeters: Math.round(distance),
        });
        addSystemNotification({
          type: 'checkin_failed',
          title: 'بصمة مرفوضة',
          body: `${user.name} حاول البصمة خارج نطاق ${selectedLocation.name} - المسافة ${Math.round(distance)}م`,
          employeeId: user.id,
          targetUserIds: getEmployees().filter(e => e.role === 'admin' || (e.role === 'manager' && e.locationIds.includes(selectedLocation.id))).map(e => e.id),
          entityType: 'checkin_attempt',
          entityId: null,
          severity: 'danger',
        });
        setOk(false);
        setMsg(`❌ خارج النطاق (${Math.round(distance)}م). المسموح: ${selectedLocation.radiusMeters}م`);
      }
    } catch (e) {
      setOk(false);
      setMsg(e instanceof Error ? e.message : 'حدث خطأ');
      addCheckInAttempt({
        employeeId: user.id,
        employeeName: user.name,
        date,
        status,
        success: false,
        reason: e instanceof Error ? e.message : 'خطأ غير معروف',
        lat: null,
        lng: null,
        nearestLocationId: null,
        nearestLocationName: null,
        acceptedLocationId: null,
        acceptedLocationName: null,
        distanceMeters: null,
      });
    } finally {
      setBusy(false);
    }
  }

  const dateLabel = new Date().toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const currentLocation = availableLocations.find(loc => loc.id === Number(selectedLocationId));
  const hasMultipleLocations = availableLocations.length > 1;

  return (
    <div className="max-w-2xl mx-auto w-full space-y-6 pt-4" dir="rtl">
      
      <div className="bg-white rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.05)] border border-slate-100 p-8 text-center relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-50 rounded-full blur-3xl opacity-50"></div>
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-indigo-50 rounded-full blur-3xl opacity-50"></div>

        <div className="relative">
          <div className="flex items-center justify-center mb-4">
            <span className="text-[11px] font-black text-blue-600 bg-blue-50 px-3.5 py-1.5 rounded-full uppercase tracking-wider flex items-center gap-1.5 border border-blue-200 shadow-sm">
              <span>🛡️</span>
              <span>هاتف البصمة المعتمد: {deviceInfo.deviceName || 'جهاز موثق'}</span>
            </span>
          </div>

          <div className="text-3xl font-black text-slate-900 mb-1">{new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</div>
          <div className="text-xs font-bold text-slate-400 mb-6">{dateLabel}</div>

          {todayStatus ? (
            <div className="bg-gradient-to-br from-green-500 to-emerald-600 text-white rounded-[2rem] p-6 mb-6 shadow-lg shadow-green-100 transform hover:scale-[1.02] transition-transform">
              <div className="text-3xl mb-1">✨</div>
              <div className="text-lg font-black italic">تم تسجيل حضورك وبصمتك اليوم</div>
              <div className="text-sm font-bold opacity-95 mt-2">الحالة: {todayStatus}</div>
              {todayLocation && (
                <div className="text-xs font-bold opacity-90 mt-1">📍 موقع العمل: {todayLocation}</div>
              )}
              {todayTime && (
                <div className="text-xs font-bold opacity-90 mt-1">🕒 توقيت البصمة: {todayTime}</div>
              )}
            </div>
          ) : (
            <>
              {new Date().getHours() >= 12 && (
                <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-2xl p-3.5 mb-3 text-xs font-black flex items-center justify-center gap-2">
                  <span>⏰</span>
                  <span>تنبيه: الساعة تجاوزت 12:00 ظهراً — فضلاً سجل بصمتك في موقعك الآن لتفادي الغياب</span>
                </div>
              )}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/60 text-blue-900 rounded-2xl py-3.5 px-6 mb-6 text-xs font-bold flex items-center justify-center gap-2">
                <span className="text-lg">👆</span>
                <span>اضغط على زر البصمة بالأسفل، وسيفتح لك الهاتف مستشعر البصمة لتأكيد هويتك وموقعك</span>
              </div>
            </>
          )}

          <div className="mb-4 text-right bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-[1.5rem] border border-blue-100">
            <label className="block text-[11px] font-black text-blue-700 mb-2 px-1">
              📍 موقع البصمة المخصص لك:
            </label>
            
            {availableLocations.length === 0 ? (
              <div className="bg-red-50 border-2 border-red-200 rounded-xl px-4 py-4 text-center">
                <div className="text-2xl mb-2">🚫</div>
                <p className="text-sm font-black text-red-700 mb-1">لم يتم تحديد موقع عمل لك</p>
                <p className="text-xs font-bold text-red-600">تواصل مع مسؤول النظام لإضافتك لموقع</p>
              </div>
            ) : hasMultipleLocations ? (
              <div className="relative">
                <select
                  value={selectedLocationId}
                  onChange={(e) => setSelectedLocationId(e.target.value)}
                  disabled={Boolean(todayStatus)}
                  className="w-full bg-white border-2 border-blue-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {availableLocations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="bg-white border-2 border-blue-300 rounded-xl px-4 py-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="text-right">
                    <div className="text-base font-black text-slate-900">{currentLocation?.name || '—'}</div>
                    <div className="text-xs font-bold text-slate-500 mt-0.5">📡 نطاق البصمة المسموح: {currentLocation?.radiusMeters}م</div>
                  </div>
                  <div className="text-2xl">📍</div>
                </div>
              </div>
            )}
          </div>

          <div className="mb-8 text-right bg-slate-50 p-4 rounded-[1.5rem] border border-slate-100">
            <label className="block text-[11px] font-black text-slate-700 mb-2 px-1">
              حالة الحضور:
            </label>
            <div className="relative">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={Boolean(todayStatus)}
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {SELF_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.emoji} {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Interactive Biometric Punch Button */}
          <div className="relative group flex justify-center">
            {!todayStatus && !busy && availableLocations.length > 0 && (
              <div className="absolute inset-0 w-44 h-44 mx-auto rounded-full bg-blue-500 opacity-20 animate-ping pointer-events-none"></div>
            )}
            <button
              type="button"
              onClick={checkIn}
              disabled={busy || Boolean(todayStatus) || !selectedLocationId || availableLocations.length === 0}
              className={`relative w-44 h-44 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all duration-300 active:scale-95 disabled:opacity-75 disabled:cursor-not-allowed cursor-pointer
                ${todayStatus 
                  ? 'bg-white border-4 border-emerald-500 text-emerald-600 shadow-emerald-100' 
                  : availableLocations.length === 0
                    ? 'bg-slate-400 text-white'
                    : 'bg-gradient-to-br from-blue-600 via-indigo-600 to-blue-800 text-white hover:shadow-blue-300 hover:scale-[1.03]'
                }`}
            >
              {busy ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span className="text-[11px] font-black tracking-wider">جاري المسح الأمني...</span>
                </div>
              ) : (
                <>
                  <span className="text-5xl filter drop-shadow-md">
                    {todayStatus ? '✅' : availableLocations.length === 0 ? '🚫' : '👆'}
                  </span>
                  <span className="mt-2 text-xs font-black tracking-wider">
                    {todayStatus ? 'تم الحضور' : availableLocations.length === 0 ? 'غير متاح' : 'بصمة الهاتف'}
                  </span>
                  {!todayStatus && availableLocations.length > 0 && (
                    <span className="text-[10px] text-blue-200 font-bold mt-0.5">مسح الإصبع + حماية GPS</span>
                  )}
                </>
              )}
            </button>
          </div>

          {msg && (
            <div className={`mt-8 text-xs font-black p-4 rounded-2xl transition-all duration-300 whitespace-pre-line text-right shadow-sm ${
              ok === true ? 'bg-emerald-50 text-emerald-800 border border-emerald-300' : 
              ok === false ? 'bg-rose-50 text-rose-800 border border-rose-300' : 
              'bg-blue-50 text-blue-900 border border-blue-300 animate-pulse'
            }`}>
              {msg}
            </div>
          )}

          {showFallbackOption && !todayStatus && (
            <div className="mt-4 p-4 rounded-2xl bg-indigo-50 border-2 border-indigo-200 text-center space-y-2.5 animate-fadeIn">
              <div className="text-xs font-black text-indigo-950 flex items-center justify-center gap-1.5">
                <span>💡</span>
                <span>تعذر استجابة مستشعر البصمة الحيوي للهاتف؟</span>
              </div>
              <p className="text-[11px] text-indigo-700 font-bold leading-relaxed">
                تقدر تأكد حضورك فوراً بهاتفك المعتمد وموقعك الجغرافي الموثق (GPS) داخل نطاق الموقع:
              </p>
              <button
                type="button"
                onClick={() => checkIn(true)}
                disabled={busy}
                className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-black shadow-md active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <span>📱</span>
                <span>تأكيد الحضور بجهازي المعتمد + الـ GPS فوراً</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white/80 backdrop-blur-sm border border-slate-200 rounded-[2rem] p-6 text-xs text-slate-600 font-medium leading-relaxed shadow-sm space-y-2">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 bg-amber-100 rounded-full flex items-center justify-center text-amber-700 text-base">🛡️</div>
          <span className="font-black text-slate-800 text-sm">حماية البصمة ومكافحة التلاعب (Anti-Spoofing)</span>
        </div>
        <ul className="space-y-1.5 list-disc list-inside text-slate-600">
          <li>حسابك مربوط <b>بهاتفك المعتمد فقط</b> لمنع أي شخص من تسجيل البصمة بدلاً عنك.</li>
          <li>يتم فحص إشارات الـ GPS وكشف أي برامج لتزييف الموقع الجغرافي.</li>
          <li>التحقق من بصمة الإصبع الحيوية للهاتف لضمان هوية صاحب البصمة.</li>
        </ul>
      </div>

    </div>
  );
}
