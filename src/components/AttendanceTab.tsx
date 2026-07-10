import { useCallback, useEffect, useMemo, useState } from 'react';
import { ARABIC_MONTHS, ATTENDANCE_STATUSES, STATUS_MAP } from '../lib/constants';
import {
  getEmployees,
  getAttendance,
  upsertAttendance,
  deleteAttendance,
  isMonthLocked,
  lockMonth,
  unlockMonth,
  addAuditLog,
  refreshFromRemote,
} from '../lib/db';
import { getManagedEmployees } from '../lib/permissions';
import type { AttendanceRecord, Employee } from '../lib/types';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function formatTime(value: string | null | undefined) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(value: string) {
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('ar-EG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

interface AttendanceTabProps {
  onSaved?: () => void;
  readOnly?: boolean;
  currentUserId?: number;
  user?: Employee;
}

export default function AttendanceTab({
  onSaved,
  readOnly = false,
  currentUserId,
  user,
}: AttendanceTabProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [employees, setEmployeesState] = useState<Employee[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [cells, setCells] = useState<Record<string, string>>({});
  const [createdAtCells, setCreatedAtCells] = useState<Record<string, string>>({});
  const [dirtyValues, setDirtyValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [search, setSearch] = useState('');
  const [jobFilter, setJobFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [singleEmployeeId, setSingleEmployeeId] = useState('');

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);
  const startDate = `${year}-${pad(month + 1)}-01`;
  const endDate = `${year}-${pad(month + 1)}-${pad(daysInMonth)}`;

  const applyLocal = useCallback(() => {
    let emps = getEmployees().filter(e => e.active);
    if (user) emps = getManagedEmployees(user);
    const atts = getAttendance().filter(a => {
      const d = String(a.date).slice(0, 10);
      return d >= startDate && d <= endDate;
    });

    if (currentUserId && readOnly) {
      setEmployeesState(emps.filter(e => e.id === currentUserId));
    } else {
      setEmployeesState(emps);
    }

    setRecords(
      atts.map(a => ({
        ...a,
        date: String(a.date).slice(0, 10),
      })),
    );
    const map: Record<string, string> = {};
    const createdMap: Record<string, string> = {};
    for (const a of atts) {
      const key = `${a.employeeId}_${String(a.date).slice(0, 10)}`;
      map[key] = a.status;
      if (a.createdAt) createdMap[key] = a.createdAt;
    }
    setCells(map);
    setCreatedAtCells(createdMap);
    setDirtyValues({});
  }, [startDate, endDate, currentUserId, readOnly, user]);

  const load = useCallback(async () => {
    setLoading(true);
    // always pull latest from Neon first so phone/laptop stay in sync
    await refreshFromRemote();
    applyLocal();
    setLoading(false);
  }, [applyLocal]);

  useEffect(() => {
    load();
    // auto-refresh every 2 minutes while attendance tab is open
    const t = setInterval(() => {
      refreshFromRemote().then(() => applyLocal());
    }, 2 * 60 * 1000);
    return () => clearInterval(t);
  }, [load, applyLocal]);

  function setCell(empId: number, day: number, value: string) {
    if (readOnly) return;
    const date = `${year}-${pad(month + 1)}-${pad(day)}`;
    const key = `${empId}_${date}`;
    setCells(prev => ({ ...prev, [key]: value }));
    setDirtyValues(prev => ({ ...prev, [key]: value }));
  }

  function changeMonthLock(action: 'lock' | 'unlock') {
    const password = window.prompt(
      action === 'lock'
        ? 'اكتب كلمة مرور المدير لقفل هذا الشهر:'
        : 'اكتب كلمة مرور المدير لفتح هذا الشهر:',
    );
    if (!password) return;
    const yearMonth = `${year}-${pad(month + 1)}`;
    if (action === 'lock') {
      lockMonth(yearMonth, 1, 'Admin');
      setMsg('🔒 تم قفل الشهر');
    } else {
      unlockMonth(yearMonth);
      setMsg('🔓 تم فتح الشهر');
    }
  }

  function save() {
    const entries = Object.entries(dirtyValues);
    if (entries.length === 0) {
      setMsg('لا توجد تغييرات للحفظ');
      return;
    }

    setSaving(true);
    setMsg('');
    const yearMonth = `${year}-${pad(month + 1)}`;
    const monthLocked = isMonthLocked(yearMonth);

    if (monthLocked) {
      if (!user?.canLockMonths && user?.role !== 'admin') {
        setMsg('🔒 الشهر مقفول ولا تملك صلاحية التعديل بعد القفل');
        setSaving(false);
        return;
      }
      const override = window.confirm(
        'الشهر مقفول. سيتم تسجيل هذا كتعديل استثنائي في سجل الحركات. هل تريد المتابعة؟',
      );
      if (!override) {
        setSaving(false);
        return;
      }
    }

    let savedCount = 0;
    let deletedCount = 0;

    for (const [key, status] of entries) {
      const [employeeId, date] = key.split('_');
      const oldRecord = records.find(
        r => r.employeeId === Number(employeeId) && r.date === date,
      );

      if (status) {
        upsertAttendance({
          employeeId: Number(employeeId),
          date,
          status,
          notes: null,
          checkInLat: null,
          checkInLng: null,
          workLocationId: null,
          workLocationName: null,
          distanceMeters: null,
        });
        addAuditLog({
          actorId: user?.id || null,
          actorName: user?.name || 'غير معروف',
          action: monthLocked ? 'تعديل حضور بعد قفل الشهر' : 'تعديل حضور',
          entityType: 'attendance',
          entityId: oldRecord?.id || null,
          employeeId: Number(employeeId),
          employeeName: employees.find(e => e.id === Number(employeeId))?.name || null,
          date,
          oldValue: oldRecord?.status || null,
          newValue: status,
          notes: monthLocked ? `Override لشهر ${yearMonth}` : null,
          override: monthLocked,
        } as any);
        savedCount++;
      } else {
        deleteAttendance(Number(employeeId), date);
        addAuditLog({
          actorId: user?.id || null,
          actorName: user?.name || 'غير معروف',
          action: monthLocked ? 'حذف حضور بعد قفل الشهر' : 'حذف حضور',
          entityType: 'attendance',
          entityId: oldRecord?.id || null,
          employeeId: Number(employeeId),
          employeeName: employees.find(e => e.id === Number(employeeId))?.name || null,
          date,
          oldValue: oldRecord?.status || null,
          newValue: null,
          notes: monthLocked ? `Override لشهر ${yearMonth}` : null,
          override: monthLocked,
        } as any);
        deletedCount++;
      }
    }

    setMsg(`✅ تم حفظ ${savedCount} وتفريغ ${deletedCount} — تم تحديث رصيد الإجازات`);
    setDirtyValues({});
    onSaved?.();
    load();
    setSaving(false);
  }

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
  const recentAttendanceLogs = records
    .filter(record => Boolean(record.createdAt))
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, 12);

  const jobTitles = Array.from(
    new Set(employees.map(emp => emp.jobTitle).filter((job): job is string => Boolean(job))),
  );

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch =
      !search.trim() || emp.name.toLowerCase().includes(search.trim().toLowerCase());
    const matchesJob = !jobFilter || emp.jobTitle === jobFilter;
    const matchesSingle = !singleEmployeeId || emp.id === Number(singleEmployeeId);
    const matchesStatus =
      !statusFilter ||
      days.some(day => {
        const date = `${year}-${pad(month + 1)}-${pad(day)}`;
        return cells[`${emp.id}_${date}`] === statusFilter;
      });
    return matchesSearch && matchesJob && matchesSingle && matchesStatus;
  });

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="font-bold text-lg text-slate-800">
          📅 {readOnly ? 'متابعة حضوري الشهري' : 'شيت الحضور والغياب اليومي'}
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            {ARABIC_MONTHS.map((m, i) => (
              <option key={i} value={i}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            {years.map(y => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          {!readOnly && (
            <>
              <button
                onClick={save}
                disabled={saving}
                className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? '...' : `💾 حفظ التغييرات (${Object.keys(dirtyValues).length})`}
              </button>
              <button
                onClick={() => changeMonthLock('lock')}
                className="bg-slate-900 text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-slate-700"
              >
                🔒 قفل الشهر
              </button>
              <button
                onClick={() => changeMonthLock('unlock')}
                className="bg-slate-100 text-slate-700 px-3 py-2 rounded-lg text-xs font-bold hover:bg-slate-200"
              >
                🔓 فتح
              </button>
            </>
          )}
        </div>
      </div>

      {!readOnly && (
        <div className="bg-slate-50 p-3 rounded-xl mb-4 flex items-center justify-between border border-slate-200">
          <span className="text-xs font-bold text-slate-600">تعيين حالة سريعة للكل اليوم:</span>
          <div className="flex gap-2">
            {['حاضر', 'إجازة رسمية'].map(s => (
              <button
                key={s}
                onClick={() => {
                  const today = new Date().getDate();
                  employees.forEach(e => setCell(e.id, today, s));
                }}
                className="bg-white border border-slate-200 px-3 py-1 rounded-md text-[10px] font-bold hover:bg-blue-50 hover:text-blue-600 transition"
              >
                {s === 'حاضر' ? '✅ الكل حاضر' : '🏛️ الكل إجازة'}
              </button>
            ))}
          </div>
        </div>
      )}

      {readOnly && (
        <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">
          👁️ هذه الصفحة للعرض فقط: يمكنك متابعة أيام حضورك في الشهر، ولا يمكنك تعديلها.
        </div>
      )}

      {!readOnly && (
        <div className="mb-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-4">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔎 بحث باسم الموظف"
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold outline-none focus:border-blue-500"
          />
          <select
            value={jobFilter}
            onChange={e => setJobFilter(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold outline-none focus:border-blue-500"
          >
            <option value="">كل الوظائف</option>
            {jobTitles.map(job => (
              <option key={job} value={job}>
                {job}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold outline-none focus:border-blue-500"
          >
            <option value="">كل الحالات</option>
            {ATTENDANCE_STATUSES.map(status => (
              <option key={status.value} value={status.value}>
                {status.emoji} {status.label}
              </option>
            ))}
          </select>
          <select
            value={singleEmployeeId}
            onChange={e => setSingleEmployeeId(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold outline-none focus:border-blue-500"
          >
            <option value="">عرض كل الموظفين</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4 text-xs">
        <span className="text-slate-500 font-medium self-center">الحالات:</span>
        {ATTENDANCE_STATUSES.map(s => (
          <span key={s.value} className={`px-2 py-1 rounded-full border ${s.className}`}>
            {s.emoji} {s.label}
          </span>
        ))}
      </div>

      {msg && (
        <div className="mb-3 text-sm text-center bg-blue-50 text-blue-700 rounded-lg py-2">{msg}</div>
      )}

      {loading ? (
        <div className="text-center text-slate-500 py-8">جاري التحميل...</div>
      ) : filteredEmployees.length === 0 ? (
        <div className="text-center text-slate-500 py-8">لا توجد نتائج مطابقة للفلاتر</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky right-0 bg-slate-100 border border-slate-200 p-2 text-right min-w-[140px] z-10">
                    الموظف
                  </th>
                  {days.map(d => {
                    const wd = new Date(year, month, d).getDay();
                    const isFri = wd === 5;
                    return (
                      <th
                        key={d}
                        className={`border border-slate-200 p-1 min-w-[64px] ${
                          isFri ? 'bg-red-50 text-red-600' : 'bg-slate-100'
                        }`}
                      >
                        {d}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map(emp => (
                  <tr key={emp.id}>
                    <td className="sticky right-0 bg-white border border-slate-200 p-2 text-right z-10">
                      <div className="font-medium text-slate-800">{emp.name}</div>
                      <div className="text-[10px] text-slate-400">{emp.jobTitle || '—'}</div>
                    </td>
                    {days.map(d => {
                      const date = `${year}-${pad(month + 1)}-${pad(d)}`;
                      const key = `${emp.id}_${date}`;
                      const val = cells[key] || '';
                      const def = STATUS_MAP[val];
                      const savedTime = formatTime(createdAtCells[key]);
                      const record = records.find(
                        r => r.employeeId === emp.id && r.date === date,
                      );
                      return (
                        <td key={d} className="border border-slate-200 p-0.5 align-top">
                          <select
                            value={val}
                            onChange={e => setCell(emp.id, d, e.target.value)}
                            disabled={readOnly}
                            className={`w-full text-xs rounded p-1 border disabled:cursor-not-allowed disabled:opacity-90 ${
                              def ? def.className : 'bg-white border-slate-200 text-slate-400'
                            }`}
                            title={def?.label}
                          >
                            <option value="">—</option>
                            {ATTENDANCE_STATUSES.map(s => (
                              <option key={s.value} value={s.value}>
                                {s.emoji} {s.label}
                              </option>
                            ))}
                          </select>
                          {savedTime && (
                            <div
                              className="mt-1 text-[9px] font-bold text-blue-600 text-center"
                              title="وقت تسجيل الموظف"
                            >
                              🕒 {savedTime}
                            </div>
                          )}
                          {record?.workLocationName && (
                            <div
                              className="mt-1 text-[8px] font-bold text-emerald-700 text-center"
                              title="موقع البصمة"
                            >
                              📍 {record.workLocationName}{' '}
                              {record.distanceMeters != null ? `(${record.distanceMeters}م)` : ''}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-bold text-slate-800">🕒 آخر تسجيلات الحضور في الشهر</h3>
              <span className="text-[11px] font-bold text-slate-400">
                الاسم + اليوم + الساعة + الحالة
              </span>
            </div>
            {recentAttendanceLogs.length === 0 ? (
              <div className="rounded-xl bg-white p-4 text-center text-sm text-slate-500">
                لا توجد تسجيلات محفوظة في هذا الشهر حتى الآن.
              </div>
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {recentAttendanceLogs.map(record => {
                  const emp = employees.find(e => e.id === record.employeeId);
                  return (
                    <div
                      key={record.id}
                      className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-black text-slate-900">{emp?.name || '—'}</div>
                        <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700">
                          {record.status}
                        </span>
                      </div>
                      <div className="mt-1 text-xs font-bold text-slate-500">
                        📅 {formatDate(record.date)} — 🕒 {formatTime(record.createdAt)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
