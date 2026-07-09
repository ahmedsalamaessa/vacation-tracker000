import { useEffect, useState } from 'react';
import { getAttendance, getVacations, getLocations } from '../lib/db';
import { computeGraduatedVacation } from '../lib/vacation';
import { getVacationDaysTaken } from '../lib/balance';
import type { Employee } from '../lib/types';

export default function MyAccountTab({ user }: { user: Employee }) {
  const [stats, setStats] = useState({ present: 0, earned: 0, taken: 0, balance: 0, saharBal: 0, absent: 0, sick: 0, stage: '' });
  const [locNames, setLocNames] = useState<string[]>([]);
  const [recentVacs, setRecentVacs] = useState<{ type: string; days: number; status: string; date: string }[]>([]);

  useEffect(() => {
    const att = getAttendance().filter(a => a.employeeId === user.id);
    const vacs = getVacations().filter(v => v.employeeId === user.id);
    const locs = getLocations();
    const c = (s: string) => att.filter(r => r.status === s).length;
    const present = c('حاضر') + c('سهر') + c('عارضة حضور');
    const g = computeGraduatedVacation(present);
    const sahar = c('سهر'), saharSpent = c('بدل سهرة');
    const saharBal = Math.max(0, sahar - saharSpent);
    const taken = getVacationDaysTaken(att, vacs);
    const balance = g.earned - taken + saharBal;
    setStats({ present, earned: g.earned, taken, balance, saharBal, absent: c('غياب'), sick: c('إجازة مرضية'), stage: g.stageLabel });
    setLocNames(user.locationIds.map(id => locs.find(l => l.id === id)?.name).filter(Boolean) as string[]);
    setRecentVacs(vacs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5).map(v => ({
      type: v.vacationType, days: v.vacationDays, status: v.status, date: v.startDate || '—',
    })));
  }, [user]);

  const initials = user.name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();

  return (
    <div className="max-w-2xl mx-auto space-y-5 pt-2">
      <div className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-sm text-center relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-blue-50 rounded-full blur-3xl opacity-50"></div>
        <div className="relative">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-3xl font-black text-white shadow-lg mb-4">{initials || '👤'}</div>
          <h2 className="text-2xl font-black text-slate-950">{user.name}</h2>
          <p className="text-sm font-bold text-slate-500 mt-1">@{user.username} · {user.jobTitle || 'بدون وظيفة'}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2 text-xs font-bold">
            <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">{user.role === 'admin' ? 'مدير النظام' : user.role === 'manager' ? 'مدير فرعي' : 'موظف'}</span>
            {user.phone && <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">📞 {user.phone}</span>}
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">🟢 نشط</span>
          </div>
          {locNames.length > 0 && (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {locNames.map(n => <span key={n} className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-bold">📍 {n}</span>)}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2">
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-center"><div className="text-xs font-bold text-slate-500">إجمالي حضوري</div><div className="text-3xl font-black text-blue-700 mt-1">{stats.present}</div></div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-center"><div className="text-xs font-bold text-slate-500">إجازات مستحقة لي</div><div className="text-3xl font-black text-emerald-700 mt-1">{stats.earned}</div></div>
        <div className="rounded-2xl border border-orange-100 bg-orange-50 p-4 text-center"><div className="text-xs font-bold text-slate-500">إجازات مأخوذة</div><div className="text-3xl font-black text-orange-700 mt-1">{stats.taken}</div></div>
        <div className={`rounded-2xl border p-4 text-center ${stats.balance < 0 ? 'border-red-100 bg-red-50' : 'border-green-100 bg-green-50'}`}><div className="text-xs font-bold text-slate-500">رصيدي المتاح</div><div className={`text-3xl font-black mt-1 ${stats.balance < 0 ? 'text-red-700' : 'text-green-700'}`}>{stats.balance}</div></div>
      </div>

      <div className="grid gap-3 grid-cols-3">
        <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-3 text-center"><div className="text-[10px] font-bold text-slate-500">بدل سهرة</div><div className="text-xl font-black text-cyan-700">{stats.saharBal}</div></div>
        <div className="rounded-2xl border border-red-100 bg-red-50 p-3 text-center"><div className="text-[10px] font-bold text-slate-500">غياب</div><div className="text-xl font-black text-red-700">{stats.absent}</div></div>
        <div className="rounded-2xl border border-pink-100 bg-pink-50 p-3 text-center"><div className="text-[10px] font-bold text-slate-500">مرضي</div><div className="text-xl font-black text-pink-700">{stats.sick}</div></div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm text-center">
        <div className="text-xs font-bold text-slate-500">المرحلة الحالية</div>
        <div className="text-lg font-black text-indigo-700 mt-1">{stats.stage}</div>
        <p className="text-[11px] text-slate-400 mt-1">هذا رصيدك الشخصي فقط - لا ترى رصيد باقي الموظفين</p>
      </div>

      {recentVacs.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="font-black text-slate-800 mb-3">🗓️ آخر إجازاتي</h3>
          <div className="space-y-2">
            {recentVacs.map((v, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
                <div><span className="font-bold text-slate-700">{v.type}</span><span className="text-xs text-slate-500 mr-2"> · {v.days} يوم · {v.date}</span></div>
                <span className={`rounded-full px-2 py-1 text-[10px] font-black ${v.status === 'مقبولة' ? 'bg-green-100 text-green-700' : v.status === 'مرفوضة' ? 'bg-red-100 text-red-700' : v.status === 'بانتظار الموافقة' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>{v.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
