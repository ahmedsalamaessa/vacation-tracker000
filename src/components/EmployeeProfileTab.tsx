import { useEffect, useState } from 'react';
import { printHtml } from '../lib/pdf';
import { getEmployeeById, getAttendance, getVacations, getCheckInAttempts, getLocations } from '../lib/db';
import { computeGraduatedVacation } from '../lib/vacation';
import { getVacationDaysTaken } from '../lib/balance';
import type { Employee, AttendanceRecord, Vacation, CheckInAttempt } from '../lib/types';

function fmtDt(v: string | null | undefined) {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function EmployeeProfileTab({ employeeId, onBack }: { employeeId: number; onBack: () => void }) {
  const [emp, setEmp] = useState<Employee | null>(null);
  const [att, setAtt] = useState<AttendanceRecord[]>([]);
  const [vac, setVac] = useState<Vacation[]>([]);
  const [atm, setAtm] = useState<CheckInAttempt[]>([]);
  const [locNames, setLocNames] = useState<string[]>([]);

  useEffect(() => {
    const e = getEmployeeById(employeeId);
    if (!e) return;
    setEmp(e);
    setAtt(getAttendance().filter(a => a.employeeId === employeeId));
    setVac(getVacations().filter(v => v.employeeId === employeeId));
    setAtm(getCheckInAttempts().filter(a => a.employeeId === employeeId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10));
    setLocNames(e.locationIds.map(id => getLocations().find(l => l.id === id)?.name).filter(Boolean) as string[]);
  }, [employeeId]);

  if (!emp) return <div className="p-10 text-center font-bold text-red-600">الموظف غير موجود<br /><button onClick={onBack} className="mt-4 bg-slate-900 text-white px-5 py-2 rounded-xl text-sm font-black">رجوع</button></div>;

  const c = (s: string) => att.filter(r => r.status === s).length;
  const totalPresent = c('حاضر') + c('سهر') + c('عارضة حضور');
  const g = computeGraduatedVacation(totalPresent);
  const sahar = c('سهر'), saharSpent = c('بدل سهرة'), saharBal = Math.max(0, sahar - saharSpent);
  const taken = getVacationDaysTaken(att, vac);
  const balance = g.earned - taken + saharBal;
  const initials = emp.name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();

  function printPdf() {
    printHtml(`ملف الموظف - ${emp!.name}`, `<h2>بيانات الموظف</h2><table><tbody><tr><th>الاسم</th><td>${emp!.name}</td></tr><tr><th>الوظيفة</th><td>${emp!.jobTitle || '—'}</td></tr><tr><th>الهاتف</th><td>${emp!.phone || '—'}</td></tr><tr><th>المواقع</th><td>${locNames.join('، ') || '—'}</td></tr></tbody></table><h2>الإحصائيات</h2><table><tbody><tr><th>حضور</th><td>${totalPresent}</td></tr><tr><th>مستحقة</th><td>${g.earned}</td></tr><tr><th>مأخوذة</th><td>${taken}</td></tr><tr><th>الرصيد</th><td>${balance}</td></tr><tr><th>سهرة</th><td>${saharBal}</td></tr><tr><th>غياب</th><td>${c('غياب')}</td></tr></tbody></table>`);
  }

  const stats = [
    { l: 'إجمالي الحضور', v: totalPresent, bg: 'bg-blue-50 border-blue-100', tc: 'text-blue-700' },
    { l: 'إجازات مستحقة', v: g.earned, bg: 'bg-green-50 border-green-100', tc: 'text-green-700' },
    { l: 'إجازات مأخوذة', v: taken, bg: 'bg-orange-50 border-orange-100', tc: 'text-orange-700' },
    { l: 'الرصيد المتاح', v: balance, bg: balance < 0 ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100', tc: balance < 0 ? 'text-red-700' : 'text-emerald-700' },
    { l: 'بدل السهرة', v: saharBal, bg: 'bg-cyan-50 border-cyan-100', tc: 'text-cyan-700' },
  ];

  const extra = [
    { l: 'غياب', v: c('غياب'), e: '❌' }, { l: 'مرضي', v: c('إجازة مرضية'), e: '🤒' },
    { l: 'رسمية', v: c('إجازة رسمية'), e: '🏛️' }, { l: 'بدون مرتب', v: c('بدون مرتب'), e: '💰' },
  ];

  return (
    <div className="space-y-5">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between gap-3">
          <button onClick={onBack} className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-200">← رجوع</button>
          <h2 className="text-2xl font-black text-slate-950">👤 ملف الموظف</h2>
          <button onClick={printPdf} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white hover:bg-slate-700">🖨️ PDF</button>
        </div>
        <div className="flex flex-col gap-6 md:flex-row md:items-center">
          <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-[2rem] bg-gradient-to-br from-blue-600 to-indigo-700 text-3xl font-black text-white shadow-lg">{initials || '👤'}</div>
          <div className="flex-1">
            <h3 className="text-3xl font-black text-slate-950">{emp.name}</h3>
            <p className="mt-1 text-sm font-bold text-slate-500">@{emp.username} · {emp.jobTitle || 'بدون وظيفة'}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
              <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">{emp.role === 'admin' ? 'مدير النظام' : emp.role === 'manager' ? 'مدير فرعي' : 'موظف'}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">📞 {emp.phone || '—'}</span>
              <span className={`rounded-full px-3 py-1 ${emp.active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{emp.active ? '🟢 نشط' : '🔴 موقوف'}</span>
            </div>
            <div className="mt-2 text-sm font-bold text-slate-600">المواقع: {locNames.length ? locNames.join('، ') : 'غير محدد'}</div>
          </div>
        </div>
      </section>
      <section className="grid gap-3 grid-cols-2 md:grid-cols-5">
        {stats.map((s, i) => (<div key={i} className={`rounded-2xl border p-4 text-center ${s.bg}`}><div className="text-xs font-bold text-slate-500">{s.l}</div><div className={`mt-1 text-3xl font-black ${s.tc}`}>{s.v}</div></div>))}
      </section>
      <section className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {extra.map((s, i) => (<div key={i} className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm"><div className="text-2xl mb-1">{s.e}</div><div className="text-xs font-bold text-slate-500">{s.l}</div><div className="text-2xl font-black text-slate-800">{s.v}</div></div>))}
      </section>
      <section className="grid gap-5 md:grid-cols-2">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-lg font-black text-slate-900">📡 آخر البصمات</h3>
          {atm.length === 0 ? <div className="rounded-xl bg-slate-50 p-4 text-center text-sm font-bold text-slate-500">لا توجد بصمات</div> : (
            <div className="space-y-2 max-h-64 overflow-y-auto">{atm.map(a => (
              <div key={a.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="flex items-center justify-between"><b>{a.status || '—'}</b><span className={`rounded-full px-2 py-1 text-[10px] font-black ${a.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{a.success ? 'مقبولة' : 'مرفوضة'}</span></div>
                <div className="mt-1 text-xs font-bold text-slate-500">{fmtDt(a.createdAt)}</div>
                {a.acceptedLocationName && <div className="mt-1 text-xs text-emerald-700 font-bold">📍 {a.acceptedLocationName}{a.distanceMeters != null ? ` (${a.distanceMeters}م)` : ''}</div>}
                {a.reason && <div className="mt-1 text-xs text-red-600 font-bold">{a.reason}</div>}
              </div>
            ))}</div>
          )}
        </div>
        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-lg font-black text-slate-900">🗓️ آخر الإجازات</h3>
          {vac.length === 0 ? <div className="rounded-xl bg-slate-50 p-4 text-center text-sm font-bold text-slate-500">لا توجد إجازات</div> : (
            <div className="space-y-2 max-h-64 overflow-y-auto">{vac.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10).map(v => (
              <div key={v.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="flex items-center justify-between"><b>{v.vacationType}</b><span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-700">{v.status}</span></div>
                <div className="mt-1 text-xs font-bold text-slate-500">{v.vacationDays} يوم · {v.startDate || '—'} ← {v.endDate || '—'}</div>
              </div>
            ))}</div>
          )}
        </div>
      </section>
    </div>
  );
}
