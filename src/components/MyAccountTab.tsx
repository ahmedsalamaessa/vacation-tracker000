import { useEffect, useState } from 'react';
import { getAttendance, getVacations, getLocations } from '../lib/db';
import { calculateEmployeeBalance, sumApprovedByTypes } from '../lib/balance';
import type { Employee } from '../lib/types';

// 🆕 دالة حساب المرحلة الحالية
function getStageInfo(effectivePresent: number): { name: string; range: string; color: string } {
  if (effectivePresent < 0) {
    return { name: 'عجز', range: 'مستهلك أكتر من رصيدك', color: 'text-red-700' };
  }
  if (effectivePresent === 0) {
    return { name: 'قبل البداية', range: 'لسه ماحضرتش', color: 'text-slate-400' };
  }
  if (effectivePresent <= 12) {
    return { name: 'الأولى', range: '1 - 12 يوم', color: 'text-blue-700' };
  }
  if (effectivePresent <= 18) {
    return { name: 'الثانية', range: '13 - 18 يوم', color: 'text-indigo-700' };
  }
  return { name: 'الثالثة', range: '19+ يوم', color: 'text-purple-700' };
}

export default function MyAccountTab({ user }: { user: Employee }) {
  const [balanceData, setBalanceData] = useState({
    totalPresent: 0,
    effectivePresent: 0,
    consumedWorkDays: 0,
    earned: 0,
    taken: 0,
    netBalance: 0,
    deficitDays: 0,
    hasDeficit: false,
    stageLabel: '',
  });
  const [extra, setExtra] = useState({ saharBal: 0, absent: 0, sick: 0 });
  const [locNames, setLocNames] = useState<string[]>([]);
  const [recentVacs, setRecentVacs] = useState<{ type: string; days: number; status: string; date: string }[]>([]);

  useEffect(() => {
    const att = getAttendance().filter(a => a.employeeId === user.id);
    const vacs = getVacations().filter(v => v.employeeId === user.id);
    const locs = getLocations();

    const c = (s: string) => att.filter(r => r.status === s).length;

    // 🎯 نفس معادلة الملف الشخصي
    const bd = calculateEmployeeBalance(att, vacs);

    // بدل السهرة
    const saharEarned = c('سهر');
    const saharSpentAttendance = c('بدل سهرة');
    const saharSpentVacations = sumApprovedByTypes(vacs, ['سهرة']);
    const saharBal = Math.max(0, saharEarned - (saharSpentAttendance + saharSpentVacations));

    setBalanceData(bd);
    setExtra({ saharBal, absent: c('غياب'), sick: c('إجازة مرضية') });
    setLocNames(user.locationIds.map(id => locs.find(l => l.id === id)?.name).filter(Boolean) as string[]);
    setRecentVacs(
      vacs
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5)
        .map(v => ({
          type: v.vacationType,
          days: v.vacationDays,
          status: v.status,
          date: v.startDate || '—',
        }))
    );
  }, [user]);

  const initials = user.name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();

  const finalBalance = balanceData.netBalance + extra.saharBal;
  const stageInfo = getStageInfo(balanceData.effectivePresent);
  const hasDeficit = balanceData.hasDeficit;

  return (
    <div className="max-w-2xl mx-auto space-y-5 pt-2">
      {/* رأس الصفحة */}
      <div className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-sm text-center relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-blue-50 rounded-full blur-3xl opacity-50"></div>
        <div className="relative">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-3xl font-black text-white shadow-lg mb-4">
            {initials || '👤'}
          </div>
          <h2 className="text-2xl font-black text-slate-950">{user.name}</h2>
          <p className="text-sm font-bold text-slate-500 mt-1">@{user.username} · {user.jobTitle || 'بدون وظيفة'}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2 text-xs font-bold">
            <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">
              {user.role === 'admin' ? 'مدير النظام' : user.role === 'manager' ? 'مدير فرعي' : 'موظف'}
            </span>
            {user.phone && <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">📞 {user.phone}</span>}
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">🟢 نشط</span>
            {hasDeficit && (
              <span className="rounded-full bg-red-100 px-3 py-1 text-red-700 font-black animate-pulse">
                ⚠️ عجز {balanceData.deficitDays} يوم
              </span>
            )}
          </div>
          {locNames.length > 0 && (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {locNames.map(n => (
                <span key={n} className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-bold">📍 {n}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 🎯 كارت المرحلة والأيام الفعلية */}
      <div className="grid gap-3 grid-cols-2">
        <div className={`rounded-2xl border p-4 text-center ${hasDeficit ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
          <div className="text-xs font-bold text-slate-500">المرحلة الحالية</div>
          <div className={`mt-1 text-2xl font-black ${stageInfo.color}`}>{stageInfo.name}</div>
          <div className="text-[10px] font-bold text-slate-500 mt-1">{stageInfo.range}</div>
        </div>

        <div className={`rounded-2xl border p-4 text-center ${balanceData.effectivePresent < 0 ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
          <div className="text-xs font-bold text-slate-500">الأيام الفعلية</div>
          <div className={`mt-1 text-2xl font-black ${balanceData.effectivePresent < 0 ? 'text-red-700' : 'text-blue-700'}`}>
            {balanceData.effectivePresent}
          </div>
          <div className="text-[10px] font-bold text-slate-500 mt-1">بعد خصم الإجازات</div>
        </div>
      </div>

      {/* 🎯 كارت الرصيد */}
      <div className="grid gap-3 grid-cols-3">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-center">
          <div className="text-xs font-bold text-slate-500">إجازات مستحقة لي</div>
          <div className="text-3xl font-black text-emerald-700 mt-1">{balanceData.earned}</div>
        </div>
        <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-4 text-center">
          <div className="text-xs font-bold text-slate-500">بدل سهرة</div>
          <div className="text-3xl font-black text-cyan-700 mt-1">{extra.saharBal}</div>
        </div>
        <div className={`rounded-2xl border p-4 text-center ${finalBalance < 0 ? 'border-red-100 bg-red-50' : 'border-green-100 bg-green-50'}`}>
          <div className="text-xs font-bold text-slate-500">رصيدي المتاح</div>
          <div className={`text-3xl font-black mt-1 ${finalBalance < 0 ? 'text-red-700' : 'text-green-700'}`}>
            {finalBalance}
          </div>
        </div>
      </div>

      {/* حالات إضافية */}
      <div className="grid gap-3 grid-cols-2">
        <div className="rounded-2xl border border-red-100 bg-red-50 p-3 text-center">
          <div className="text-[10px] font-bold text-slate-500">غياب</div>
          <div className="text-xl font-black text-red-700">{extra.absent}</div>
        </div>
        <div className="rounded-2xl border border-pink-100 bg-pink-50 p-3 text-center">
          <div className="text-[10px] font-bold text-slate-500">مرضي</div>
          <div className="text-xl font-black text-pink-700">{extra.sick}</div>
        </div>
      </div>

      {/* 🆕 كارت العجز - يظهر لو في عجز */}
      {hasDeficit && (
        <div className="rounded-2xl border-2 border-red-300 bg-gradient-to-br from-red-50 to-orange-50 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <div className="text-sm font-black text-red-800">عجز في رصيدك</div>
              <div className="text-[11px] font-bold text-red-600">استهلكت إجازات أكتر من رصيدك</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-white border border-red-200 p-2 text-center">
              <div className="text-[10px] font-black text-red-700">📉 أيام العجز</div>
              <div className="text-lg font-black text-red-600">{balanceData.deficitDays} يوم</div>
            </div>
            <div className="rounded-xl bg-white border border-orange-200 p-2 text-center">
              <div className="text-[10px] font-black text-orange-700">💼 محتاج تحضر</div>
              <div className="text-lg font-black text-orange-600">{Math.abs(balanceData.effectivePresent)} يوم</div>
            </div>
          </div>
        </div>
      )}

      {/* المرحلة الحالية - رسالة */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm text-center">
        <div className="text-xs font-bold text-slate-500">المرحلة الحالية</div>
        <div className="text-lg font-black text-indigo-700 mt-1">{balanceData.stageLabel}</div>
        <p className="text-[11px] text-slate-400 mt-1">هذا رصيدك الشخصي فقط - لا ترى رصيد باقي الموظفين</p>
      </div>

      {/* آخر الإجازات */}
      {recentVacs.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="font-black text-slate-800 mb-3">🗓️ آخر إجازاتي</h3>
          <div className="space-y-2">
            {recentVacs.map((v, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
                <div>
                  <span className="font-bold text-slate-700">{v.type}</span>
                  <span className="text-xs text-slate-500 mr-2"> · {v.days} يوم · {v.date}</span>
                </div>
                <span className={`rounded-full px-2 py-1 text-[10px] font-black ${v.status === 'مقبولة' ? 'bg-green-100 text-green-700' : v.status === 'مرفوضة' ? 'bg-red-100 text-red-700' : v.status === 'بانتظار الموافقة' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>
                  {v.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
