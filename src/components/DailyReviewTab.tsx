import { useMemo, useState } from 'react';
import { getAttendance, getCheckInAttempts } from '../lib/db';
import { getManagedEmployees } from '../lib/permissions';
import type { Employee } from '../lib/types';

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function DailyReviewTab({ user }: { user: Employee }) {
  const [date, setDate] = useState(todayIso());
  const [refresh, setRefresh] = useState(0);
  const employees = getManagedEmployees(user);
  const employeeIds = new Set(employees.map(e => e.id));

  const data = useMemo(() => {
    const attendance = getAttendance().filter(a => a.date === date && employeeIds.has(a.employeeId));
    const attempts = getCheckInAttempts().filter(a => a.date === date && employeeIds.has(a.employeeId));
    const presentStatuses = new Set(['حاضر', 'سهر', 'عارضة حضور']);
    const leaveStatuses = new Set(['عارضة إجازة', 'إجازة عارضة', 'إجازة اعتيادية', 'إجازة مرضية', 'إجازة رسمية', 'إجازة سنوية', 'بدون مرتب', 'بدل سهرة']);
    const presentIds = new Set(attendance.filter(a => presentStatuses.has(a.status)).map(a => a.employeeId));
    const leave = attendance.filter(a => leaveStatuses.has(a.status));
    const absent = attendance.filter(a => a.status === 'غياب');
    const rejected = attempts.filter(a => !a.success);
    const missing = employees.filter(e => !attendance.some(a => a.employeeId === e.id));
    const present = employees.filter(e => presentIds.has(e.id));
    return { attendance, attempts, present, leave, absent, rejected, missing };
  }, [date, refresh, user.id]);

  const card = (title: string, value: number, cls: string) => (
    <div className={`rounded-2xl p-4 text-center border ${cls}`}>
      <div className="text-3xl font-black">{value}</div>
      <div className="mt-1 text-xs font-black opacity-80">{title}</div>
    </div>
  );

  return (
    <div className="space-y-5">
      <section className="rounded-[2rem] bg-white border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <h2 className="text-2xl font-black text-slate-950">📌 مراجعة اليوم</h2>
            <p className="text-xs font-bold text-slate-500 mt-1">
              {user.role === 'manager' ? 'ملخص موظفي مواقعك فقط' : 'ملخص الحضور والبصمات لهذا اليوم'}
            </p>
          </div>
          <div className="flex gap-2">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold" />
            <button onClick={() => setRefresh(v => v + 1)} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white">🔄 تحديث</button>
          </div>
        </div>

        <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
          {card('حاضر', data.present.length, 'bg-green-50 border-green-100 text-green-700')}
          {card('إجازات اليوم', data.leave.length, 'bg-purple-50 border-purple-100 text-purple-700')}
          {card('غياب', data.absent.length, 'bg-red-50 border-red-100 text-red-700')}
          {card('بصمات مرفوضة', data.rejected.length, 'bg-amber-50 border-amber-100 text-amber-700')}
          {card('لم يبصم / لا يوجد سجل', data.missing.length, 'bg-slate-50 border-slate-200 text-slate-700')}
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-2">
        <div className="rounded-[2rem] bg-white border border-slate-200 p-5 shadow-sm">
          <h3 className="font-black text-lg mb-3 text-green-700">✅ الحاضرين ({data.present.length})</h3>
          <List names={data.present.map(e => e.name)} empty="لا يوجد حضور" />
        </div>
        <div className="rounded-[2rem] bg-white border border-slate-200 p-5 shadow-sm">
          <h3 className="font-black text-lg mb-3 text-red-700">❌ الغياب ({data.absent.length})</h3>
          <List names={data.absent.map(a => employees.find(e => e.id === a.employeeId)?.name || '—')} empty="لا يوجد غياب" />
        </div>
        <div className="rounded-[2rem] bg-white border border-slate-200 p-5 shadow-sm">
          <h3 className="font-black text-lg mb-3 text-purple-700">🏖️ إجازات اليوم ({data.leave.length})</h3>
          {data.leave.length === 0 ? <Empty text="لا توجد إجازات اليوم" /> : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {data.leave.map(a => (
                <div key={a.id} className="rounded-xl bg-purple-50 border border-purple-100 p-3 text-sm">
                  <div className="font-black text-slate-900">{employees.find(e => e.id === a.employeeId)?.name || '—'}</div>
                  <div className="text-xs font-bold text-purple-700 mt-1">{a.status}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-[2rem] bg-white border border-slate-200 p-5 shadow-sm">
          <h3 className="font-black text-lg mb-3 text-amber-700">📡 بصمات مرفوضة ({data.rejected.length})</h3>
          {data.rejected.length === 0 ? <Empty text="لا توجد بصمات مرفوضة" /> : (
            <div className="space-y-2">
              {data.rejected.map(a => (
                <div key={a.id} className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-sm">
                  <div className="font-black text-slate-900">{a.employeeName || employees.find(e => e.id === a.employeeId)?.name || '—'}</div>
                  <div className="text-xs font-bold text-amber-700 mt-1">{a.reason || 'مرفوضة'} {a.distanceMeters != null ? `• ${a.distanceMeters}م` : ''}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-[2rem] bg-white border border-slate-200 p-5 shadow-sm">
          <h3 className="font-black text-lg mb-3 text-slate-700">⏳ لم يبصموا ({data.missing.length})</h3>
          <List names={data.missing.map(e => e.name)} empty="كل الموظفين لهم سجل اليوم" />
        </div>
      </section>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl bg-slate-50 p-4 text-center text-sm font-bold text-slate-400">{text}</div>;
}

function List({ names, empty }: { names: string[]; empty: string }) {
  if (names.length === 0) return <Empty text={empty} />;
  return (
    <div className="space-y-2 max-h-72 overflow-y-auto">
      {names.map((name, i) => (
        <div key={`${name}-${i}`} className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-sm font-bold text-slate-700">{name}</div>
      ))}
    </div>
  );
}