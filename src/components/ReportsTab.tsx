import { useCallback, useEffect, useMemo, useState } from 'react';
import { ARABIC_MONTHS } from '../lib/constants';
import { exportToCSV } from '../lib/export';
import { printHtml } from '../lib/pdf';
import { getAttendance, getLocations } from '../lib/db';
import { getManagedEmployees } from '../lib/permissions';
import type { AttendanceRecord, Employee, WorkLocation } from '../lib/types';

function pad(n: number) { return String(n).padStart(2, '0'); }

const COLUMNS: { key: string; label: string; emoji: string; color: string }[] = [
  { key: 'حاضر', label: 'حاضر', emoji: '✅', color: 'text-green-600' },
  { key: 'سهر', label: 'سهر', emoji: '🏗️', color: 'text-indigo-600' },
  { key: 'بدل سهرة', label: 'بدل سهرة', emoji: '🌙', color: 'text-indigo-700 font-black' },
  { key: 'عارضة حضور', label: 'عارضة حضور', emoji: '🟡', color: 'text-yellow-600' },
  { key: 'عارضة إجازة', label: 'عارضة إجازة', emoji: '⛱️', color: 'text-orange-600' },
  { key: 'إجازة مرضية', label: 'مرضي', emoji: '🤒', color: 'text-pink-600' },
  { key: 'إجازة رسمية', label: 'رسمية', emoji: '🏛️', color: 'text-slate-600' },
  { key: 'إجازة سنوية', label: 'سنوية', emoji: '🎉', color: 'text-purple-600' },
  { key: 'غياب', label: 'غياب', emoji: '❌', color: 'text-red-600' },
  { key: 'بدون مرتب', label: 'بدون مرتب', emoji: '💰', color: 'text-amber-600' },
  { key: 'إجازة اعتيادية', label: 'اعتيادية', emoji: '🏠', color: 'text-teal-600' },
];

interface Props { user: Employee; }

export default function ReportsTab({ user }: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [day, setDay] = useState('');
  const [employees, setEmployeesState] = useState<Employee[]>([]);
  const [locations, setLocationsState] = useState<WorkLocation[]>([]);
  const [locationId, setLocationId] = useState('');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDate = `${year}-${pad(month + 1)}-01`;
  const endDate = `${year}-${pad(month + 1)}-${pad(daysInMonth)}`;

  const load = useCallback(() => {
    setLoading(true);
    setEmployeesState(getManagedEmployees(user));
    setRecords(getAttendance().filter(a => a.date >= startDate && a.date <= endDate));
    setLocationsState(getLocations());
    setLoading(false);
  }, [startDate, endDate, user]);

  useEffect(() => { load(); }, [load]);

  const summary = useMemo(() => {
    const map = new Map<number, Record<string, number>>();
    for (const r of records) {
      const m = map.get(r.employeeId) ?? {};
      m[r.status] = (m[r.status] || 0) + 1;
      map.set(r.employeeId, m);
    }
    return map;
  }, [records]);

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  const filteredEmployees = employees.filter(emp => {
    const matchesLocation = !locationId || (emp.locationIds || []).includes(Number(locationId));
    const matchesName = !employeeSearch.trim() || emp.name.toLowerCase().includes(employeeSearch.trim().toLowerCase()) || (emp.username || '').toLowerCase().includes(employeeSearch.trim().toLowerCase());
    return matchesLocation && matchesName;
  });

  const finalRecords = useMemo(() => {
    if (!day) return records;
    const selectedDate = `${year}-${pad(month + 1)}-${pad(Number(day))}`;
    return records.filter(r => r.date === selectedDate);
  }, [records, day, year, month]);

  const currentSummary = useMemo(() => {
    const map = new Map<number, Record<string, number>>();
    for (const r of finalRecords) {
      const m = map.get(r.employeeId) ?? {};
      m[r.status] = (m[r.status] || 0) + 1;
      map.set(r.employeeId, m);
    }
    return map;
  }, [finalRecords]);

  function buildReportRows() {
    return filteredEmployees.map(emp => {
      const counts = currentSummary.get(emp.id) ?? {};
      const row: Record<string, unknown> = { name: emp.name, jobTitle: emp.jobTitle || '' };
      for (const c of COLUMNS) row[c.key] = counts[c.key] || 0;
      return row;
    });
  }

  function doExport() {
    const rows = buildReportRows();
    const headers: Record<string, string> = { name: 'الموظف', jobTitle: 'الوظيفة' };
    for (const c of COLUMNS) headers[c.key] = c.label;
    const selectedLocationName = locations.find(loc => loc.id === Number(locationId))?.name;
    const searchSuffix = employeeSearch.trim() ? `_${employeeSearch.trim()}` : '';
    exportToCSV(rows, `تقرير_${year}_${pad(month + 1)}${day ? `_يوم_${day}` : ''}${selectedLocationName ? `_${selectedLocationName}` : ''}${searchSuffix}`, headers);
  }

  function doPdfExport() {
    const rows = buildReportRows();
    const headerCells = ['الموظف', 'الوظيفة', ...COLUMNS.map(c => c.label)].map(h => `<th>${h}</th>`).join('');
    const bodyRows = rows.map(row => {
      const cells = [row.name, row.jobTitle, ...COLUMNS.map(c => row[c.key] ?? 0)].map(v => `<td>${String(v ?? '')}</td>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    const selectedLocationName = locations.find(loc => loc.id === Number(locationId))?.name;
    printHtml(`تقرير حضور شهري ${year}-${pad(month + 1)}${day ? ` - يوم ${day}` : ''}${selectedLocationName ? ` - ${selectedLocationName}` : ''}`, `<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`);
  }

  const isEmployee = user.role === 'employee';

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-bold text-lg text-slate-800">📈 {isEmployee ? 'تقريري الشهري' : `تقرير شامل - ${year}-${pad(month + 1)}`}</h2>
          <p className="text-xs font-bold text-slate-400">{isEmployee ? 'تقرير حضورك الشخصي فقط' : user.role === 'manager' ? `موظفي مواقعك فقط (${filteredEmployees.length})` : 'جميع الموظفين'}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={month} onChange={e => setMonth(Number(e.target.value))} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
            {ARABIC_MONTHS.map((m, i) => (
              <option key={i} value={i}>{m}</option>
            ))}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select value={day} onChange={e => setDay(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
            <option value="">كل الأيام</option>
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
              <option key={d} value={d}>يوم {d}</option>
            ))}
          </select>
          {!isEmployee && (
            <select value={locationId} onChange={e => setLocationId(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
              <option value="">كل المواقع</option>
              {locations.filter(l => user.role === 'admin' || user.locationIds.includes(l.id)).map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          )}
          {!isEmployee && <input value={employeeSearch} onChange={e => setEmployeeSearch(e.target.value)} placeholder="بحث باسم الموظف" className="border border-slate-300 rounded-lg px-3 py-2 text-sm min-w-[170px]" />}
          <button onClick={doExport} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-700">📥 CSV</button>
          <button onClick={doPdfExport} className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-700">🖨️ PDF</button>
        </div>
      </div>
      {loading ? (
        <div className="text-center text-slate-500 py-8">جاري التحميل...</div>
      ) : filteredEmployees.length === 0 ? (
        <div className="text-center text-slate-500 py-8">لا توجد بيانات</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-center border-collapse">
            <thead>
              <tr className="bg-slate-100">
                <th className="p-2 border border-slate-200 text-right min-w-[140px]">الموظف</th>
                {COLUMNS.map(c => (
                  <th key={c.key} className="p-2 border border-slate-200">
                    <div>{c.emoji}</div>
                    <div className="text-[10px] text-slate-500">{c.label}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map(emp => {
                const counts = currentSummary.get(emp.id) ?? {};
                return (
                  <tr key={emp.id}>
                    <td className="p-2 border border-slate-200 text-right">
                      <div className="font-medium">{emp.name}</div>
                      <div className="text-[10px] text-slate-400">{emp.jobTitle || '—'}</div>
                    </td>
                    {COLUMNS.map(c => (
                      <td key={c.key} className={`p-2 border border-slate-200 font-bold ${c.color}`}>
                        {counts[c.key] || 0}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
