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
  const [locations, setLocationsState] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());

  function load() {
    setLoading(true);
    const attempts = getCheckInAttempts();
    const attendance = getAttendance();
    const emps = user ? getManagedEmployees(user) : getEmployees().filter(e => e.active);
    setEmployeesState(emps);
    const empMap = new Map<number, string>();
    getEmployees().forEach(e => empMap.set(e.id, e.name));

    const managedIds = new Set(emps.map(e => e.id));
    const filteredAttempts = attempts.filter(a => managedIds.has(a.employeeId));
    const filteredAttendance = attendance.filter(a => managedIds.has(a.employeeId));

    const attemptRows: CombinedRow[] = filteredAttempts.map(a => ({
      id: `attempt-${a.id}`, employeeId: a.employeeId, employeeName: a.employeeName || empMap.get(a.employeeId) || 'موظف #' + a.employeeId,
      date: a.date, status: a.status || '—', success: a.success, reason: a.reason, lat: a.lat, lng: a.lng,
      nearestLocationName: a.nearestLocationName, acceptedLocationName: a.acceptedLocationName, distanceMeters: a.distanceMeters, createdAt: a.createdAt, source: 'attempt',
    }));
    const attendanceRows: CombinedRow[] = filteredAttendance.map(a => ({
      id: `attendance-${a.id}`, employeeId: a.employeeId, employeeName: empMap.get(a.employeeId) || 'موظف #' + a.employeeId,
      date: a.date, status: a.status, success: true, reason: 'حضور محفوظ', lat: a.checkInLat ?? null, lng: a.checkInLng ?? null,
      nearestLocationName: null, acceptedLocationName: a.workLocationName ?? null, distanceMeters: a.distanceMeters ?? null, createdAt: a.createdAt, source: 'attendance',
    }));
    const attemptKeys = new Set(attemptRows.filter(r => r.success).map(r => `${r.employeeId}_${r.date}_${r.status}`));
    const uniqueAttendanceRows = attendanceRows.filter(r => { const key = `${r.employeeId}_${r.date}_${r.status}`; return !attemptKeys.has(key); });
    const combined = [...attemptRows, ...uniqueAttendanceRows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setAllRows(combined);

    const locationSet = new Set<string>();
    try {
      const allLocations = getLocations();
      allLocations.forEach((loc: any) => { if (loc?.name) locationSet.add(loc.name); });
    } catch (e) {}
    combined.forEach(r => {
      if (r.acceptedLocationName) locationSet.add(r.acceptedLocationName);
      if (r.nearestLocationName) locationSet.add(r.nearestLocationName);
    });
    setLocationsState(Array.from(locationSet).sort());

    setLoading(false);
  }

  useEffect(() => { load(); }, [user?.id]);

  const yearMonth = `${year}-${String(month + 1).padStart(2, '0')}`;
  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  const filteredRows = useMemo(() => allRows.filter(row => {
    const matchesSearch = !search.trim() || row.employeeName.toLowerCase().includes(search.trim().toLowerCase());
    const matchesEmployee = !employeeId || row.employeeId === Number(employeeId);
    const matchesResult = !resultFilter || (resultFilter === 'success' ? row.success : !row.success);
    const matchesMonth = row.date?.startsWith(yearMonth);
    const matchesLocation = !locationFilter || row.acceptedLocationName === locationFilter || row.nearestLocationName === locationFilter;
    return matchesSearch && matchesEmployee && matchesResult && matchesMonth && matchesLocation;
  }), [allRows, search, employeeId, resultFilter, yearMonth, locationFilter]);

  function exportCsv() {
    exportToCSV(filteredRows.map(row => ({
      employeeName: row.employeeName, date: row.date, time: formatDateTime(row.createdAt), status: row.status,
      result: row.success ? 'مقبولة' : 'مرفوضة', location: row.acceptedLocationName || row.nearestLocationName || '',
      distanceMeters: row.distanceMeters ?? '', reason: row.reason || '',
      coordinates: row.lat != null && row.lng != null ? `${row.lat}, ${row.lng}` : '',
    })), `سجل_البصمات_${yearMonth}`, { employeeName: 'الموظف', date: 'اليوم', time: 'الوقت', status: 'الحالة', result: 'النتيجة', location: 'الموقع', distanceMeters: 'المسافة', reason: 'السبب', coordinates: 'الإحداثيات' });
  }

  function exportPdf() {
    const bodyRows = filteredRows.map(row => `<tr><td>${row.employeeName}</td><td>${row.date}</td><td>${formatDateTime(row.createdAt)}</td><td>${row.status}</td><td>${row.success ? 'مقبولة' : 'مرفوضة'}</td><td>${row.acceptedLocationName || row.nearestLocationName || '—'}</td><td>${row.distanceMeters == null ? '—' : `${row.distanceMeters}م`}</td><td>${row.reason || '—'}</td></tr>`).join('');
    printHtml(`سجل البصمات ${yearMonth}`, `<table><thead><tr><th>الموظف</th><th>اليوم</th><th>الوقت</th><th>الحالة</th><th>النتيجة</th><th>الموقع</th><th>المسافة</th><th>السبب</th></tr></thead><tbody>${bodyRows}</tbody></table>`);
  }

  const isEmployee = user?.role === 'employee';

  return (
    <section className="space-y-5">
      <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-slate-950">📡 {isEmployee ? 'سجل بصماتي' : 'سجل البصمات التفصيلي'}</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">{isEmployee ? 'محاولاتك الشخصية فقط' : user?.role === 'manager' ? 'سجل بصمات موظفي مواقعك فقط' : 'كل محاولات البصمة - ناجحة ومرفوضة'}</p>
          </div>
          <button onClick={load} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white hover:bg-slate-700">🔄 تحديث</button>
        </div>

        <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 text-sm font-black text-slate-700">🔍 فلاتر</div>
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔎 بحث باسم الموظف..." className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 md:col-span-2" />
            {!isEmployee && (
              <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500">
                <option value="">👥 كل الموظفين</option>
                {employees.map(emp => (<option key={emp.id} value={emp.id}>{emp.name}</option>))}
              </select>
            )}
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500">
              {ARABIC_MONTHS.map((m, idx) => (<option key={m} value={idx}>📅 {m}</option>))}
            </select>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500">
              {years.map(y => (<option key={y} value={y}>{y}</option>))}
            </select>
            <select value={resultFilter} onChange={(e) => setResultFilter(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500">
              <option value="">📊 كل النتائج</option>
              <option value="success">✅ مقبولة</option>
              <option value="failed">❌ مرفوضة</option>
            </select>
            <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500">
              <option value="">📍 كل المواقع</option>
              {locations.map(loc => (<option key={loc} value={loc}>{loc}</option>))}
            </select>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <button onClick={exportPdf} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white hover:bg-slate-700">🖨️ PDF</button>
          <button onClick={exportCsv} className="rounded-xl bg-green-600 px-4 py-2 text-xs font-black text-white hover:bg-green-700">📥 CSV</button>
          <span className="rounded-xl bg-blue-50 px-4 py-2 text-xs font-black text-blue-700">النتائج: {filteredRows.length}</span>
        </div>

        {loading ? (<div className="py-10 text-center text-slate-500 font-bold">جاري التحميل...</div>) : filteredRows.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 p-8 text-center"><div className="text-4xl mb-3">📭</div><div className="font-black text-slate-700 text-lg">لا توجد سجلات</div></div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full border-collapse text-sm">
              <thead><tr className="bg-slate-100 text-slate-700"><th className="border-b border-slate-200 p-3 text-right font-black">الموظف</th><th className="border-b border-slate-200 p-3 font-black">اليوم</th><th className="border-b border-slate-200 p-3 font-black">الوقت</th><th className="border-b border-slate-200 p-3 font-black">الحالة</th><th className="border-b border-slate-200 p-3 font-black">النتيجة</th><th className="border-b border-slate-200 p-3 font-black">الموقع</th><th className="border-b border-slate-200 p-3 font-black">المسافة</th><th className="border-b border-slate-200 p-3 font-black">السبب</th><th className="border-b border-slate-200 p-3 font-black">الخريطة</th></tr></thead>
              <tbody>
                {filteredRows.map(row => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="border-b border-slate-100 p-3 text-right"><div className="font-black text-slate-900">{row.employeeName}</div><div className="text-[10px] font-bold text-slate-400">{row.source === 'attempt' ? '📡 محاولة' : '📋 حضور'}</div></td>
                    <td className="border-b border-slate-100 p-3 font-bold text-slate-700">{row.date}</td>
                    <td className="border-b border-slate-100 p-3 text-xs font-bold text-slate-500">{formatDateTime(row.createdAt)}</td>
                    <td className="border-b border-slate-100 p-3"><span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-black text-blue-700">{row.status}</span></td>
                    <td className="border-b border-slate-100 p-3"><span className={`rounded-full px-3 py-1 text-xs font-black ${row.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{row.success ? '✅ مقبولة' : '❌ مرفوضة'}</span></td>
                    <td className="border-b border-slate-100 p-3 font-bold text-sm">{row.acceptedLocationName || row.nearestLocationName || <span className="text-slate-400">—</span>}</td>
                    <td className="border-b border-slate-100 p-3 font-bold">{row.distanceMeters == null ? <span className="text-slate-400">—</span> : <span className="text-emerald-700">{row.distanceMeters}م</span>}</td>
                    <td className="border-b border-slate-100 p-3 text-xs font-bold text-slate-600">{row.reason || '—'}</td>
                    <td className="border-b border-slate-100 p-3">{row.lat != null && row.lng != null ? (<a href={`https://www.google.com/maps?q=${row.lat},${row.lng}`} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100">🗺️</a>) : <span className="text-slate-400">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
