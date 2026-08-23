import { useMemo, useState } from 'react';
import { getAttendance, getEmployees } from '../lib/db';
import { STATUS_MAP, ARABIC_MONTHS, ATTENDANCE_STATUSES } from '../lib/constants';
import type { AttendanceRecord, Employee } from '../lib/types';

const WEEKDAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface DayInfo {
  date: string;
  statuses: { status: string; names: string[] }[];
  total: number;
}

export default function CalendarTab({ user }: { user: Employee }) {
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const employees = getEmployees().filter(e => e.active);
  const attendance = getAttendance();

  const q = search.trim();
  const visibleEmployees = useMemo(
    () => (q ? employees.filter(e => e.name.includes(q) || (e.username || '').includes(q)) : employees),
    [employees, q],
  );
  const visibleIds = useMemo(() => new Set(visibleEmployees.map(e => e.id)), [visibleEmployees]);

  const monthPrefix = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}-`;

  // تجميع حالات كل يوم في الشهر
  const days = useMemo(() => {
    const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const out: DayInfo[] = [];
    const nameById = new Map(employees.map(e => [e.id, e.name] as const));
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${monthPrefix}${String(day).padStart(2, '0')}`;
      const byStatus = new Map<string, string[]>();
      let total = 0;
      for (const a of attendance as AttendanceRecord[]) {
        if (a.date !== iso || !visibleIds.has(a.employeeId)) continue;
        total++;
        const arr = byStatus.get(a.status) || [];
        arr.push(nameById.get(a.employeeId) || `#${a.employeeId}`);
        byStatus.set(a.status, arr);
      }
      const statuses = [...byStatus.entries()]
        .map(([status, names]) => ({ status, names }))
        .sort((a, b) => b.names.length - a.names.length);
      out.push({ date: iso, statuses, total });
    }
    return out;
  }, [attendance, visibleIds, monthPrefix, cursor, employees]);

  // إزاحة بداية الشهر (الأسبوع يبدأ بالسبت)
  const startOffset = (new Date(cursor.year, cursor.month, 1).getDay() + 1) % 7;
  const today = todayIso();

  const monthTotalPresent = days.reduce(
    (sum, d) => sum + d.statuses.filter(s => ['حاضر', 'سهر', 'عارضة حضور'].includes(s.status)).reduce((x, s) => x + s.names.length, 0),
    0,
  );
  const monthTotalVacation = days.reduce(
    (sum, d) => sum + d.statuses.filter(s => s.status.includes('إجازة')).reduce((x, s) => x + s.names.length, 0),
    0,
  );
  const monthTotalAbsent = days.reduce(
    (sum, d) => sum + d.statuses.filter(s => s.status === 'غياب').reduce((x, s) => x + s.names.length, 0),
    0,
  );

  function shiftMonth(delta: number) {
    setSelectedDay(null);
    setCursor(c => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  const selectedInfo = selectedDay ? days.find(d => d.date === selectedDay) : null;

  return (
    <div className="space-y-6">
      {/* رأس التقويم */}
      <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:p-8 dark:bg-slate-800 dark:border-slate-700">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">📅 تقويم الشهر</h1>
            <p className="text-xs font-bold text-slate-500 mt-1 dark:text-slate-400">
              نظرة شاملة لحضور وإجازات {visibleEmployees.length} موظف — اضغط على أي يوم للتفاصيل
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="🔍 ابحث باسم موظف..."
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold outline-none focus:border-blue-500 dark:bg-slate-700 dark:border-slate-600 dark:text-white w-44"
            />
            <button
              onClick={() => shiftMonth(-1)}
              className="rounded-xl bg-slate-100 hover:bg-slate-200 px-4 py-2 font-black text-slate-700 dark:bg-slate-700 dark:text-white"
            >
              ›
            </button>
            <div className="rounded-xl bg-blue-600 text-white px-5 py-2 text-sm font-black min-w-36 text-center">
              {ARABIC_MONTHS[cursor.month]} {cursor.year}
            </div>
            <button
              onClick={() => shiftMonth(1)}
              className="rounded-xl bg-slate-100 hover:bg-slate-200 px-4 py-2 font-black text-slate-700 dark:bg-slate-700 dark:text-white"
            >
              ‹
            </button>
            <button
              onClick={() => { setSelectedDay(null); setCursor({ year: now.getFullYear(), month: now.getMonth() }); }}
              className="rounded-xl bg-emerald-100 hover:bg-emerald-200 px-3 py-2 text-[10px] font-black text-emerald-700"
            >
              الشهر الحالي
            </button>
          </div>
        </div>

        {/* ملخص الشهر */}
        <div className="grid grid-cols-3 gap-3 mt-5">
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3 text-center">
            <div className="text-2xl font-black text-emerald-700">{monthTotalPresent}</div>
            <div className="text-[10px] font-black text-emerald-600 mt-1">أيام حضور وسهر</div>
          </div>
          <div className="rounded-2xl bg-orange-50 border border-orange-200 p-3 text-center">
            <div className="text-2xl font-black text-orange-700">{monthTotalVacation}</div>
            <div className="text-[10px] font-black text-orange-600 mt-1">أيام إجازات</div>
          </div>
          <div className="rounded-2xl bg-red-50 border border-red-200 p-3 text-center">
            <div className="text-2xl font-black text-red-700">{monthTotalAbsent}</div>
            <div className="text-[10px] font-black text-red-600 mt-1">أيام غياب</div>
          </div>
        </div>
      </div>

      {/* شبكة التقويم */}
      <div className="rounded-[2rem] border border-slate-200 bg-white p-4 md:p-6 shadow-sm dark:bg-slate-800 dark:border-slate-700">
        <div className="grid grid-cols-7 gap-1 mb-2">
          {WEEKDAYS.map(d => (
            <div key={d} className="text-center text-[10px] md:text-xs font-black text-slate-500 py-2 dark:text-slate-400">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: startOffset }).map((_, i) => (
            <div key={`pad-${i}`} className="min-h-20 rounded-xl bg-slate-50/50 dark:bg-slate-900/30" />
          ))}
          {days.map(d => {
            const dayNum = Number(d.date.slice(8));
            const isFriday = new Date(d.date + 'T12:00:00').getDay() === 5;
            const isToday = d.date === today;
            const isSelected = d.date === selectedDay;
            return (
              <button
                key={d.date}
                onClick={() => setSelectedDay(isSelected ? null : d.date)}
                className={`min-h-20 rounded-xl border p-1.5 text-right align-top transition-all hover:scale-[1.03] hover:shadow-md ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-300 dark:bg-blue-900/30'
                    : isToday
                      ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
                      : isFriday
                        ? 'border-slate-200 bg-slate-50 dark:bg-slate-900/40 dark:border-slate-700'
                        : 'border-slate-100 bg-white dark:bg-slate-800 dark:border-slate-700'
                }`}
              >
                <div className={`text-xs font-black mb-1 ${isToday ? 'text-emerald-700' : 'text-slate-600 dark:text-slate-300'}`}>
                  {dayNum} {isToday && '⭐'}
                </div>
                <div className="flex flex-wrap gap-0.5">
                  {d.statuses.slice(0, 4).map(s => (
                    <span
                      key={s.status}
                      className={`inline-flex items-center gap-0.5 rounded-md border px-1 py-0.5 text-[9px] font-black ${STATUS_MAP[s.status]?.className || 'bg-slate-100 text-slate-700 border-slate-300'}`}
                      title={`${s.status}: ${s.names.join('، ')}`}
                    >
                      {STATUS_MAP[s.status]?.emoji || '•'} {s.names.length}
                    </span>
                  ))}
                  {d.statuses.length > 4 && (
                    <span className="text-[9px] font-black text-slate-400">+{d.statuses.length - 4}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* دليل الألوان */}
        <div className="flex flex-wrap gap-1.5 mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
          {ATTENDANCE_STATUSES.map(s => (
            <span key={s.value} className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[9px] font-black ${s.className}`}>
              {s.emoji} {s.label}
            </span>
          ))}
        </div>
      </div>

      {/* تفاصيل اليوم المختار */}
      {selectedInfo && (
        <div className="rounded-[2rem] border border-blue-200 bg-white p-6 shadow-sm md:p-8 dark:bg-slate-800 dark:border-blue-800">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-black text-slate-900 dark:text-white">
              📋 تفاصيل يوم {Number(selectedInfo.date.slice(8))} {ARABIC_MONTHS[cursor.month]} {cursor.year}
            </h2>
            <button
              onClick={() => setSelectedDay(null)}
              className="text-[10px] bg-red-100 text-red-700 px-3 py-1.5 rounded-full font-black hover:bg-red-200"
            >
              ✕ إغلاق
            </button>
          </div>
          {selectedInfo.statuses.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-2">🌙</div>
              <div className="font-black text-slate-500">مفيش تسجيلات في اليوم ده</div>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {selectedInfo.statuses.map(s => (
                <div key={s.status} className={`rounded-2xl border p-4 ${STATUS_MAP[s.status]?.className || 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-black text-sm">
                      {STATUS_MAP[s.status]?.emoji} {s.status}
                    </span>
                    <span className="text-xs font-black bg-white/60 rounded-full px-2 py-0.5">{s.names.length}</span>
                  </div>
                  <div className="text-xs font-bold leading-relaxed">{s.names.join('، ')}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="text-center text-[10px] font-bold text-slate-400">
        التقويم بيقرأ من نفس بيانات النظام — مرحبًا يا {user.name.split(' ')[0]} 🌟
      </div>
    </div>
  );
}
