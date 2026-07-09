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
    if (employeeLocations.length === 0) {
      setAvailableLocations(allLocations.filter(loc => loc.active));
    } else {
      setAvailableLocations(employeeLocations);
    }
    if (employeeLocations.length > 0 && !selectedLocationId) {
      setSelectedLocationId(String(employeeLocations[0].id));
    } else if (allLocations.length > 0 && !selectedLocationId) {
      setSelectedLocationId(String(allLocations[0].id));
    }
  }

  function getLocation(): Promise<{ lat: number; lng: number }> {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        reject(new Error('المتصفح لا يدعم تحديد الموقع'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => {
          if (err.code === err.PERMISSION_DENIED)
            reject(new Error('تم رفض إذن الموقع. فعّل الموقع وحاول مجدداً'));
          else reject(new Error('تعذّر تحديد الموقع. تأكد من تفعيل GPS'));
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }

  async function checkIn() {
    if (!selectedLocationId) {
      setOk(false);
      setMsg('اختر موقع العمل أولاً');
      return;
    }
    setBusy(true);
    setMsg('جاري تحديد موقعك...');
    setOk(null);
    try {
      const location = await getLocation();
      setMsg('جاري التحقق من الموقع...');
      const selectedLocation = availableLocations.find(loc => loc.id === Number(selectedLocationId));
      if (!selectedLocation) {
        setOk(false);
        setMsg('الموقع المختار غير موجود');
        setBusy(false);
        return;
      }
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
          reason: 'موقع بدون إحداثيات - تم القبول',
          lat: location.lat,
          lng: location.lng,
          nearestLocationId: null,
          nearestLocationName: null,
          acceptedLocationId: selectedLocation.id,
          acceptedLocationName: selectedLocation.name,
          distanceMeters: null,
        });
        setOk(true);
        setMsg(`✅ تم تسجيل بصمتك بنجاح في ${selectedLocation.name}`);
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
      if (distance <= selectedLocation.radiusMeters) {
        setMsg('جاري تسجيل البصمة...');
        upsertAttendance({
          employeeId: user.id,
          date,
          status,
          notes: null,
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
          reason: null,
          lat: location.lat,
          lng: location.lng,
          nearestLocationId: null,
          nearestLocationName: null,
          acceptedLocationId: selectedLocation.id,
          acceptedLocationName: selectedLocation.name,
          distanceMeters: Math.round(distance),
        });
        setOk(true);
        setMsg(`✅ تم تسجيل بصمتك بنجاح من ${selectedLocation.name} (${Math.round(distance)}م)`);
        loadData();
        onDataChange();
      } else {
        addCheckInAttempt({
          employeeId: user.id,
          employeeName: user.name,
          date,
          status,
          success: false,
          reason: `خارج نطاق ${selectedLocation.name}`,
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
        setMsg(`❌ أنت خارج نطاق ${selectedLocation.name}. المسافة: ${Math.round(distance)}م، النطاق المسموح: ${selectedLocation.radiusMeters}م`);
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
      addSystemNotification({
        type: 'checkin_failed',
        title: 'فشل بصمة',
        body: `${user.name}: ${e instanceof Error ? e.message : 'خطأ غير معروف'}`,
        employeeId: user.id,
        targetUserIds: getEmployees().filter(emp => emp.role === 'admin' || (emp.role === 'manager' && user.locationIds.some(id => emp.locationIds.includes(id)))).map(emp => emp.id),
        entityType: 'checkin_attempt',
        entityId: null,
        severity: 'danger',
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
              📍 موقع البصمة
            </label>
            <div className="relative">
              <select
                value={selectedLocationId}
                onChange={(e) => setSelectedLocationId(e.target.value)}
                disabled={Boolean(todayStatus)}
                className="w-full bg-white border-2 border-blue-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 appearance-none shadow-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="">اختر موقع العمل...</option>
                {availableLocations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} {loc.lat ? `(${loc.radiusMeters}م)` : '(بدون GPS)'}
                  </option>
                ))}
              </select>
              <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-blue-400">
                ▼
              </div>
            </div>
            {availableLocations.length === 0 && (
              <p className="mt-2 text-xs font-bold text-amber-600">
                ⚠️ لا توجد مواقع مفعلة. تواصل مع المسؤول.
              </p>
            )}
          </div>

          <div className="mb-8 text-right bg-slate-50/50 p-4 rounded-[1.5rem] border border-slate-100">
            <label className="block text-[10px] font-black text-slate-400 mb-3 px-1 uppercase tracking-widest">
              نوع الحضور / الحالة
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
              <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                ▼
              </div>
            </div>
          </div>

          <div className="relative group flex justify-center">
            {!todayStatus && !busy && (
              <div className="absolute inset-0 w-44 h-44 mx-auto rounded-full bg-blue-400 opacity-20 animate-ping"></div>
            )}
            <button
              onClick={checkIn}
              disabled={busy || Boolean(todayStatus) || !selectedLocationId}
              className={`relative w-44 h-44 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all duration-500 active:scale-90 disabled:opacity-70 disabled:cursor-not-allowed
                ${todayStatus 
                  ? 'bg-white border-4 border-green-500 text-green-600 shadow-green-100' 
                  : 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white hover:shadow-blue-200'
                }`}
            >
              {busy ? (
                <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <span className="text-5xl filter drop-shadow-md">{todayStatus ? '✅' : '👆'}</span>
                  <span className="mt-3 text-xs font-black uppercase tracking-[0.1em]">
                    {todayStatus ? 'تم التسجيل' : 'اضغط للبصمة'}
                  </span>
                </>
              )}
            </button>
          </div>

          {msg && (
            <div className={`mt-8 text-[12px] font-black p-4 rounded-xl transition-all duration-300 ${
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
          <span className="font-black text-slate-700 uppercase tracking-tighter">كيفية تسجيل البصمة</span>
        </div>
        <ol className="space-y-2 list-decimal list-inside text-slate-600">
          <li><b>اختر موقع العمل</b> الذي ستبصم منه (مثل Naya Bay أو Beach 5)</li>
          <li><b>اختر نوع الحضور</b> (حاضر، سهر، عارضة...)</li>
          <li><b>اضغط زر البصمة</b> وسيتم التحقق من موقعك الجغرافي</li>
          <li>إذا كنت داخل النطاق المسموح، سيتم <b>تسجيل بصمتك بنجاح</b></li>
        </ol>
      </div>
    </div>
  );
}
