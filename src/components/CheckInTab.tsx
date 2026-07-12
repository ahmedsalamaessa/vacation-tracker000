import { useEffect, useState } from 'react';
import { ATTENDANCE_STATUSES } from '../lib/constants';
import { getAttendance, upsertAttendance, getLocations, addCheckInAttempt, addSystemNotification, getEmployees } from '../lib/db';
import { getDistanceInMeters } from '../lib/location';
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
  const date = todayIso();

  useEffect(() => {
    loadData();
  }, []);

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
   * 🎯 دالة GPS محسّنة مع 2 محاولات:
   * - محاولة أولى سريعة (10 ثواني، بدون دقة عالية)
   * - لو فشلت، محاولة تانية بدقة عالية (20 ثانية)
   * - رسائل خطأ واضحة تشرح للموظف يعمل إيه
   */
  function getLocation(): Promise<{ lat: number; lng: number; accuracy: number; speed: number | null }> {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        reject(new Error('❌ متصفحك لا يدعم تحديد الموقع.\n\n💡 جرب من متصفح آخر (Chrome أو Safari)'));
        return;
      }

      // محاولة أولى سريعة
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

          // محاولة تانية بدقة عالية
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
                  '💡 جرب الآتي:\n' +
                  '1. تأكد أن GPS مفتوح على الموبايل\n' +
                  '2. اخرج للمكان المفتوح (بعيداً عن الأسقف)\n' +
                  '3. تأكد من اتصال الإنترنت (WiFi + Data)\n' +
                  '4. أعد المحاولة بعد 30 ثانية'
                ));
              } else {
                reject(new Error(
                  '❌ فشل تحديد الموقع.\n\n' +
                  '💡 تأكد من تفعيل GPS وحاول مجدداً'
                ));
              }
            },
            { 
              enableHighAccuracy: true,
              timeout: 25000,  // 25 ثانية للمحاولة التانية
              maximumAge: 0
            }
          );
        },
        { 
          enableHighAccuracy: false,  // ⚡ سريع الأول
          timeout: 10000,  // 10 ثواني
          maximumAge: 60000  // ✅ يقبل قراءة عمرها دقيقة
        }
      );
    });
  }

  async function checkIn() {
    if (!selectedLocationId) {
      setOk(false);
      setMsg('❌ لم يتم تحديد موقع عمل لك. تواصل مع المسؤول.');
      return;
    }
    setBusy(true);
    setMsg('📡 جاري تحديد موقعك...');
    setOk(null);
    
    try {
      const location = await getLocation();
      
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
          severity: 'warning',
        });
        setOk(false);
        setMsg('🚗 يبدو أنك تتحرك بسرعة. توقف وأعد المحاولة.');
        setBusy(false);
        return;
      }

      setMsg('🎯 جاري التحقق من الموقع...');

      if (selectedLocation.lat == null || selectedLocation.lng == null) {
        upsertAttendance({
          employeeId: user.id,
          date,
          status,
          notes: null,
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
          reason: 'موقع بدون إحداثيات',
          lat: location.lat,
          lng: location.lng,
          nearestLocationId: null,
          nearestLocationName: null,
          acceptedLocationId: selectedLocation.id,
          acceptedLocationName: selectedLocation.name,
          distanceMeters: null,
        });
        setOk(true);
        setMsg(`✅ تم تسجيل بصمتك في ${selectedLocation.name}`);
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
        setMsg(`❌ أنت بعيد جداً (${Math.round(distance/1000)} كم).`);
        setBusy(false);
        return;
      }

      const isWithinRange = effectiveDistance <= selectedLocation.radiusMeters 
                         || distance <= selectedLocation.radiusMeters;

      if (isWithinRange) {
        const isSuspicious = location.accuracy > 200;
        const noteForAdmin = isSuspicious ? `⚠️ GPS ضعيف (${Math.round(location.accuracy)}م)` : null;

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
          reason: isSuspicious 
            ? `تم القبول رغم ضعف GPS (${Math.round(location.accuracy)}م)`
            : `دقة GPS: ${Math.round(location.accuracy)}م`,
          lat: location.lat,
          lng: location.lng,
          nearestLocationId: null,
          nearestLocationName: null,
          acceptedLocationId: selectedLocation.id,
          acceptedLocationName: selectedLocation.name,
          distanceMeters: Math.round(distance),
        });

        if (isSuspicious) {
          addSystemNotification({
            type: 'checkin_failed',
            title: '⚠️ بصمة بدقة GPS ضعيفة',
            body: `${user.name} بصم في ${selectedLocation.name} - المسافة ${Math.round(distance)}م، دقة GPS ${Math.round(location.accuracy)}م`,
            employeeId: user.id,
            targetUserIds: getEmployees().filter(e => e.role === 'admin').map(e => e.id),
            entityType: 'checkin_attempt',
            entityId: null,
            severity: 'warning',
          });
        }

        setOk(true);
        setMsg(`✅ تم تسجيل بصمتك في ${selectedLocation.name}`);
        loadData();
        onDataChange();
      } else {
        addCheckInAttempt({
          employeeId: user.id,
          employeeName: user.name,
          date,
          status,
          success: false,
          reason: `خارج النطاق - ${Math.round(distance)}م`,
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
    <div className="max-w-md mx-auto space-y-6 pt-4">
      <div className="bg-white rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.05)] border border-slate-100 p-8 text-center relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-50 rounded-full blur-3xl opacity-50"></div>
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-indigo-50 rounded-full blur-3xl opacity-50"></div>

        <div className="relative">
          <div className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] mb-2">Smart Check-in System</div>
          <div className="text-3xl font-black text-slate-900 mb-1">{new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</div>
          <div className="text-xs font-bold text-slate-400 mb-6">{dateLabel}</div>

          {todayStatus ? (
            <div className="bg-gradient-to-br from-green-500 to-emerald-600 text-white rounded-[2rem] p-6 mb-6 shadow-lg shadow-green-100 transform hover:scale-[1.02] transition-transform">
              <div className="text-2xl mb-1">✨</div>
              <div className="text-lg font-black italic">تم تسجيل حضورك اليوم</div>
              <div className="text-sm font-bold opacity-90 mt-2">الحالة: {todayStatus}</div>
              {todayLocation && (
                <div className="text-xs font-bold opacity-80 mt-1">📍 {todayLocation}</div>
              )}
              {todayTime && (
                <div className="text-xs font-bold opacity-80 mt-1">🕒 {todayTime}</div>
              )}
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-100 text-slate-500 rounded-2xl py-4 px-6 mb-6 text-sm font-bold animate-pulse">
              👋 بانتظار تسجيل بصمتك لليوم...
            </div>
          )}

          <div className="mb-4 text-right bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-[1.5rem] border border-blue-100">
            <label className="block text-[10px] font-black text-blue-600 mb-3 px-1 uppercase tracking-widest">
              📍 موقع البصمة المخصص لك
            </label>
            
            {availableLocations.length === 0 ? (
              <div className="bg-red-50 border-2 border-red-200 rounded-xl px-4 py-4 text-center">
                <div className="text-2xl mb-2">🚫</div>
                <p className="text-sm font-black text-red-700 mb-1">لم يتم تحديد موقع عمل لك</p>
                <p className="text-xs font-bold text-red-600">تواصل مع المسؤول</p>
              </div>
            ) : hasMultipleLocations ? (
              <div className="relative">
                <select
                  value={selectedLocationId}
                  onChange={(e) => setSelectedLocationId(e.target.value)}
                  disabled={Boolean(todayStatus)}
                  className="w-full bg-white border-2 border-blue-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 appearance-none shadow-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {availableLocations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
                <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-blue-400">▼</div>
              </div>
            ) : (
              <div className="bg-white border-2 border-blue-300 rounded-xl px-4 py-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="text-right">
                    <div className="text-lg font-black text-slate-900">{currentLocation?.name || '—'}</div>
                    <div className="text-xs font-bold text-slate-500 mt-1">📡 نطاق: {currentLocation?.radiusMeters}م</div>
                  </div>
                  <div className="text-3xl">📍</div>
                </div>
              </div>
            )}
          </div>

          <div className="mb-8 text-right bg-slate-50/50 p-4 rounded-[1.5rem] border border-slate-100">
            <label className="block text-[10px] font-black text-slate-400 mb-3 px-1 uppercase tracking-widest">
              نوع الحضور
            </label>
            <div className="relative">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={Boolean(todayStatus)}
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 appearance-none shadow-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {SELF_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.emoji} {s.label}
                  </option>
                ))}
              </select>
              <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">▼</div>
            </div>
          </div>

          <div className="relative group flex justify-center">
            {!todayStatus && !busy && availableLocations.length > 0 && (
              <div className="absolute inset-0 w-44 h-44 mx-auto rounded-full bg-blue-400 opacity-20 animate-ping"></div>
            )}
            <button
              onClick={checkIn}
              disabled={busy || Boolean(todayStatus) || !selectedLocationId || availableLocations.length === 0}
              className={`relative w-44 h-44 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all duration-500 active:scale-90 disabled:opacity-70 disabled:cursor-not-allowed
                ${todayStatus 
                  ? 'bg-white border-4 border-green-500 text-green-600 shadow-green-100' 
                  : availableLocations.length === 0
                    ? 'bg-gradient-to-br from-slate-400 to-slate-500 text-white'
                    : 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white hover:shadow-blue-200'
                }`}
            >
              {busy ? (
                <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <span className="text-5xl filter drop-shadow-md">
                    {todayStatus ? '✅' : availableLocations.length === 0 ? '🚫' : '👆'}
                  </span>
                  <span className="mt-3 text-xs font-black uppercase tracking-[0.1em]">
                    {todayStatus ? 'تم' : availableLocations.length === 0 ? 'غير متاح' : 'بصمة'}
                  </span>
                </>
              )}
            </button>
          </div>

          {msg && (
            <div className={`mt-8 text-[12px] font-black p-4 rounded-xl transition-all duration-300 whitespace-pre-line text-right ${
              ok === true ? 'bg-green-50 text-green-700 border border-green-200' : 
              ok === false ? 'bg-red-50 text-red-700 border border-red-200' : 
              'bg-blue-50 text-blue-700 border border-blue-200'
            }`}>
              {msg}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white/50 backdrop-blur-sm border border-slate-200/50 rounded-[2rem] p-6 text-[11px] text-slate-500 font-medium leading-relaxed shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 text-sm">📍</div>
          <span className="font-black text-slate-700 uppercase tracking-tighter">نصائح للبصمة الناجحة</span>
        </div>
        <ol className="space-y-2 list-decimal list-inside text-slate-600">
          <li><b>فعّل GPS</b> على موبايلك من الإعدادات</li>
          <li><b>اسمح للمتصفح</b> بمعرفة موقعك عند سؤالك</li>
          <li><b>كن في مكان مفتوح</b> لأفضل دقة</li>
          <li><b>تأكد من الإنترنت</b> (WiFi + Data معاً)</li>
          <li>إذا فشلت المحاولة، <b>انتظر 30 ثانية</b> ثم أعد المحاولة</li>
        </ol>
      </div>
    </div>
  );
}
