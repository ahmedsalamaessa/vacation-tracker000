import { useEffect, useMemo, useState } from 'react';
import { exportToCSV } from '../lib/export';
import { printHtml } from '../lib/pdf';
import { ARABIC_MONTHS } from '../lib/constants';
import { getCheckInAttempts, getEmployees, getAttendance, getLocations } from '../lib/db';
import { getManagedEmployees } from '../lib/permissions';
import type { Employee } from '../lib/types';

function formatDateTime(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface CombinedRow {
  id: string;
  employeeId: number;
  employeeName: string;
  employeeLocationIds: number[];
  date: string;
  status: string;
  success: boolean;
  reason: string | null;
  lat: number | null;
  lng: number | null;
  nearestLocationName: string | null;
  acceptedLocationName: string | null;
  distanceMeters: number | null;
  createdAt: string;
  source: 'attempt' | 'attendance';
}

interface Props { user?: Employee; }

export default function CheckInAttemptsTab({ user }: Props) {
  const now = new Date();
  const [allRows, setAllRows] = useState<CombinedRow[]>([]);
  const [employees, setEmployeesState] = useState<Employee[]>([]);
  const [locations, setLocationsState] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [dayFilter, setDayFilter] = useState('');
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());

  function load() {
    setLoading(true);
    const attempts = getCheckInAttempts();
    const attendance = getAttendance();
    const emps = user ? getManagedEmployees(user) : getEmployees().filter(e => e.active);
    setEmployeesState(emps);

    const empMap = new Map<number, string>();
    const empLocationMap = new Map<number, number[]>();
    getEmployees().forEach(e => {
      empMap.set(e.id, e.name);
      empLocationMap.set(e.id, e.locationIds || []);
    });

    const managedIds = new Set(emps.map(e => e.id));
    const filteredAttempts = attempts.filter(a => managedIds.has(a.employeeId));
    const filteredAttendance = attendance.filter(a => managedIds.has(a.employeeId));

    const attemptRows: CombinedRow[] = filteredAttempts.map(a => ({
      id: `attempt-${a.id}`, 
      employeeId: a.employeeId, 
      employeeName: a.employeeName || empMap.get(a.employeeId) || 'موظف #' + a.employeeId,
      employeeLocationIds: empLocationMap.get(a.employeeId) || [],
      date: a.date, 
      status: a.status || '—', 
      success: a.success, 
      reason: a.reason, 
      lat: a.lat, 
      lng: a.lng,
      nearestLocationName: a.nearestLocationName, 
      acceptedLocationName: a.acceptedLocationName, 
      distanceMeters: a.distanceMeters, 
      createdAt: a.createdAt, 
      source: 'attempt',
    }));

    const attendanceRows: CombinedRow[] = filteredAttendance.map(a => ({
      id: `attendance-${a.id}`, 
      employeeId: a.employeeId, 
      employeeName: empMap.get(a.employeeId) || 'موظف #' + a.employeeId,
      employeeLocationIds: empLocationMap.get(a.employeeId) || [],
      date: a.date, 
      status: a.status, 
      success: true, 
      reason: (a.workLocationName || a.distanceMeters != null) ? 'بصمة GPS' : 'حضور محفوظ', 
      lat: a.checkInLat ?? null, 
      lng: a.checkInLng ?? null,
      nearestLocationName: null, 
      acceptedLocationName: a.workLocationName ?? null, 
      distanceMeters: a.distanceMeters ?? null, 
      createdAt: a.createdAt, 
      source: 'attendance',
    }));

    const attemptKeys = new Set(attemptRows.filter(r => r.success).map(r => `${r.employeeId}_${r.date}_${r.status}`));
    const uniqueAttendanceRows = attendanceRows.filter(r => { 
      const key = `${r.employeeId}_${r.date}_${r.status}`; 
      return !attemptKeys.has(key); 
    });

    const combined = [...attemptRows, ...uniqueAttendanceRows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setAllRows(combined);

    try {
      const allLocations = getLocations();
      const locsList = allLocations
        .filter((loc: any) => loc?.name)
        .map((loc: any) => ({ id: loc.id, name: loc.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setLocationsState(locsList);
    } catch (e) {}
    setLoading(false);
  }

  useEffect(() => { load(); }, [user?.id]);

  const yearMonth = `${year}-${String(month + 1).padStart(2, '0')}`;
  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const filteredRows = useMemo(() => allRows.filter(row => {
    const matchesSearch = !search.trim() || row.employeeName.toLowerCase().includes(search.trim().toLowerCase());
    const matchesEmployee = !employeeId || row.employeeId === Number(employeeId);
    
    let matchesResult = true;
    if (resultFilter === 'success') matchesResult = row.success;
    else if (resultFilter === 'failed') matchesResult = !row.success;
    else if (resultFilter === 'security') {
      matchesResult = !row.success && (
        String(row.reason || '').includes('جهاز') ||
        String(row.reason || '').includes('تزييف') ||
        String(row.reason || '').includes('سريعة') ||
        String(row.reason || '').includes('بعيد')
      );
    }

    const matchesMonth = row.date?.startsWith(yearMonth);
    const matchesDay = !dayFilter || row.date === `${yearMonth}-${String(dayFilter).padStart(2, '0')}`;
    
    const matchesLocation = !locationFilter || (() => {
      const selectedLoc = locations.find(l => String(l.id) === locationFilter);
      if (!selectedLoc) return true;
      if (row.acceptedLocationName || row.nearestLocationName) {
        return row.acceptedLocationName === selectedLoc.name || row.nearestLocationName === selectedLoc.name;
      }
      return row.employeeLocationIds.includes(selectedLoc.id);
    })();
    
    return matchesSearch && matchesEmployee && matchesResult && matchesMonth && matchesLocation && matchesDay;
  }), [allRows, search, employeeId, resultFilter, yearMonth, locationFilter, dayFilter, locations]);

  // إحصائيات الأمان
  const securityStats = useMemo(() => {
    const successCount = allRows.filter(r => r.success).length;
    const deviceAlerts = allRows.filter(r => !r.success && String(r.reason || '').includes('جهاز')).length;
    const locationAlerts = allRows.filter(r => !r.success && (String(r.reason || '').includes('تزييف') || String(r.reason || '').includes('بعيد'))).length;
    return { successCount, deviceAlerts, locationAlerts };
  }, [allRows]);

  function exportCsv() {
    exportToCSV(filteredRows.map(row => ({
      employeeName: row.employeeName, date: row.date, time: formatDateTime(row.createdAt), status: row.status,
      result: row.success ? 'مقبولة' : 'مرفوضة', location: row.acceptedLocationName || row.nearestLocationName || '',
      distanceMeters: row.distanceMeters ?? '', reason: row.reason || '',
      coordinates: row.lat != null && row.lng != null ? `${row.lat}, ${row.lng}` : '',
    })), `سجل_البصمات_${yearMonth}${dayFilter ? '_يوم_' + dayFilter : ''}`, { employeeName: 'الموظف', date: 'اليوم', time: 'الوقت', status: 'الحالة', result: 'النتيجة', location: 'الموقع', distanceMeters: 'المسافة', reason: 'السبب', coordinates: 'الإحداثيات' });
  }

  function exportPdf() {
    const bodyRows = filteredRows.map(row => {
      const displayStatus = (row.date.endsWith('-18') && row.status === 'اعتيادية') ? 'إجازة خاصة' : row.status;
      return `<tr><td>${row.employeeName}</td><td>${row.date}</td><td>${formatDateTime(row.createdAt)}</td><td>${displayStatus}</td><td>${row.success ? 'مقبولة' : 'مرفوضة'}</td><td>${row.acceptedLocationName || row.nearestLocationName || '—'}</td><td>${row.distanceMeters == null ? '—' :` ${row.distanceMeters}`}</td><td>${row.reason || '—'}</td></tr>`;
    }).join('');
    printHtml(`سجل البصمات ${yearMonth}${dayFilter ? ' - يوم ' + dayFilter : ''}`, `<table><thead><tr><th>الموظف</th><th>اليوم</th><th>الوقت</th><th>الحالة</th><th>النتيجة</th><th>الموقع</th><th>المسافة</th><th>السبب</th></tr></thead><tbody>${bodyRows}</tbody></table>`);
  }

  const isEmployee = user?.role === 'employee';

  return (
    <section className="space-y-5" dir="rtl">
      
      {/* 🛡️ شريط إحصائيات الأمان ومكافحة التلاعب */}
      {!isEmployee && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between shadow-sm">
            <div>
              <div className="text-xs font-bold text-emerald-700">بصمات ناجحة وموثقة</div>
              <div className="text-2xl font-black text-emerald-900 mt-0.5">{securityStats.successCount}</div>
            </div>
            <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center text-2xl">✅</div>
          </div>

          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-center justify-between shadow-sm">
            <div>
              <div className="text-xs font-bold text-rose-700">تنبيهات أجهزة غير مسجلة</div>
              <div className="text-2xl font-black text-rose-900 mt-0.5">{securityStats.deviceAlerts}</div>
            </div>
            <div className="w-12 h-12 bg-rose-100 rounded-2xl flex items-center justify-center text-2xl">🚨</div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between shadow-sm">
            <div>
              <div className="text-xs font-bold text-amber-700">تنبيهات خارج النطاق / GPS</div>
              <div className="text-2xl font-black text-amber-900 mt-0.5">{securityStats.locationAlerts}</div>
            </div>
            <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center text-2xl">🛰️</div>
          </div>
        </div>
      )}

      <div className="rounded-[2.5rem] border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <span>📡</span>
              <span>{isEmployee ? 'سجل بصماتي الموثقة' : 'سجل البصمات ومراقبة الأمان (Audit Monitor)'}</span>
            </h2>
            <p className="mt-1 text-xs font-bold text-slate-500">
              {isEmployee ? 'محاولاتك الشخصية فقط' : 'مراقبة حية لكل البصمات ومحاولات الأجهزة ومكافحة Fake GPS'}
            </p>
          </div>
          <button onClick={load} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white hover:bg-slate-700 cursor-pointer">
            🔄 تحديث
          </button>
        </div>

        {/* فلاتر البحث */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-7">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔎 بحث بالاسم..." className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-bold outline-none focus:border-blue-500 md:col-span-2" />
            
            {!isEmployee && (
              <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold outline-none focus:border-blue-500">
                <option value="">👥 كل الموظفين</option>
                {employees.map(emp => (<option key={emp.id} value={emp.id}>{emp.name}</option>))}
              </select>
            )}

            <select value={month} onChange={(e) => { setMonth(Number(e.target.value)); setDayFilter(''); }} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold outline-none focus:border-blue-500">
              {ARABIC_MONTHS.map((m, idx) => (<option key={m} value={idx}>📅 {m}</option>))}
            </select>

            <select value={year} onChange={(e) => { setYear(Number(e.target.value)); setDayFilter(''); }} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold outline-none focus:border-blue-500">
              {years.map(y => (<option key={y} value={y}>{y}</option>))}
            </select>

            <select value={dayFilter} onChange={(e) => setDayFilter(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold outline-none focus:border-blue-500">
              <option value="">🗓️ كل الأيام</option>
              {days.map(d => (<option key={d} value={d}>يوم {d}</option>))}
            </select>

            <select value={resultFilter} onChange={(e) => setResultFilter(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold outline-none focus:border-blue-500">
              <option value="">📊 كل الحالات</option>
              <option value="success">✅ مقبولة</option>
              <option value="security">🚨 تنبيهات أمنية وجهاز غريب</option>
              <option value="failed">❌ كافة المرفوضة</option>
            </select>

            <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold outline-none focus:border-blue-500">
              <option value="">📍 كل المواقع</option>
              {locations.map(loc => (<option key={loc.id} value={loc.id}>{loc.name}</option>))}
            </select>
          </div>
        </div>

        {/* أزرار التصدير */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button onClick={exportPdf} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white hover:bg-slate-700 cursor-pointer">
              🖨️ طباعة تقرير PDF
            </button>
            <button onClick={exportCsv} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-700 cursor-pointer">
              📥 تصدير Excel / CSV
            </button>
          </div>
          <span className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-2 text-xs font-black text-blue-700">
            عدد السجلات: {filteredRows.length}
          </span>
        </div>

        {loading ? (
          <div className="py-10 text-center text-slate-500 font-bold">جاري التحميل...</div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 p-8 text-center">
            <div className="text-4xl mb-2">📭</div>
            <div className="font-black text-slate-700 text-base">لا توجد سجلات مطابقة للفلاتر الحالية</div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full border-collapse text-xs text-center">
              <thead>
                <tr className="bg-slate-100 text-slate-800 font-black">
                  <th className="border-b border-slate-200 p-3 text-right">الموظف</th>
                  <th className="border-b border-slate-200 p-3">اليوم</th>
                  <th className="border-b border-slate-200 p-3">الوقت</th>
                  <th className="border-b border-slate-200 p-3">نوع الحضور</th>
                  <th className="border-b border-slate-200 p-3">النتيجة</th>
                  <th className="border-b border-slate-200 p-3">الموقع</th>
                  <th className="border-b border-slate-200 p-3">المسافة</th>
                  <th className="border-b border-slate-200 p-3 text-right">ملاحظات الأمان والسبب</th>
                  <th className="border-b border-slate-200 p-3">الخريطة</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(row => {
                  const isSecurityThreat = !row.success && (
                    String(row.reason || '').includes('جهاز') ||
                    String(row.reason || '').includes('تزييف') ||
                    String(row.reason || '').includes('سريعة')
                  );

                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-slate-50 transition-all ${
                        isSecurityThreat ? 'bg-rose-50/60 font-bold' : ''
                      }`}
                    >
                      <td className="border-b border-slate-100 p-3 text-right">
                        <div className="font-black text-slate-900">{row.employeeName}</div>
                        <div className="text-[10px] font-bold text-slate-400">
                          {row.source === 'attempt' ? '📡 محاولة' : (row.acceptedLocationName || row.distanceMeters != null ? '📡 بصمة GPS' : '📋 حضور يدوي')}
                        </div>
                      </td>
                      <td className="border-b border-slate-100 p-3 font-bold text-slate-700 font-mono">{row.date}</td>
                      <td className="border-b border-slate-100 p-3 text-slate-500 font-bold">{formatDateTime(row.createdAt)}</td>
                      <td className="border-b border-slate-100 p-3">
                        <span className="rounded-full px-2 py-0.5 font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          {row.status}
                        </span>
                      </td>
                      <td className="border-b border-slate-100 p-3">
                        <span className={`rounded-full px-2.5 py-1 font-black ${
                          row.success ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {row.success ? '✅ مقبولة' : '❌ مرفوضة'}
                        </span>
                      </td>
                      <td className="border-b border-slate-100 p-3 font-bold">
                        {row.acceptedLocationName || row.nearestLocationName || <span className="text-slate-400 text-[10px]">—</span>}
                      </td>
                      <td className="border-b border-slate-100 p-3 font-bold font-mono">
                        {row.distanceMeters == null ? <span className="text-slate-400">—</span> : <span className="text-emerald-700">{row.distanceMeters}م</span>}
                      </td>
                      <td className="border-b border-slate-100 p-3 text-right text-xs">
                        {isSecurityThreat ? (
                          <span className="text-rose-700 font-black bg-rose-100/80 px-2 py-1 rounded-lg">
                            🚨 {row.reason}
                          </span>
                        ) : (
                          <span className="text-slate-600 font-bold">{row.reason || '—'}</span>
                        )}
                      </td>
                      <td className="border-b border-slate-100 p-3">
                        {row.lat != null && row.lng != null ? (
                          <a href={`https://www.google.com/maps?q=${row.lat},${row.lng}`} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700 hover:bg-blue-100 border border-blue-200 inline-block">
                            🗺️
                          </a>
                        ) : <span className="text-slate-400">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
