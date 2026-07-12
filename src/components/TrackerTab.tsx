import { useEffect, useMemo, useState } from 'react';
import { getAttendance, getVacations, getLocations } from '../lib/db';
import { computeGraduatedVacation } from '../lib/vacation';
import { getManagedEmployees } from '../lib/permissions';
import { getVacationDaysTaken, sumApprovedByTypes } from '../lib/balance';
import type { TrackerRow, Employee, WorkLocation } from '../lib/types';

interface TrackerTabProps {
  refreshKey?: number;
  user: Employee;
}

export default function TrackerTab({ refreshKey = 0, user }: TrackerTabProps) {
  const [rows, setRows] = useState<TrackerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [manualRefresh, setManualRefresh] = useState(0);
  const [showRules, setShowRules] = useState(false);
  const [locationFilter, setLocationFilter] = useState(''); // 🆕 فلتر المواقع
  const [locations, setLocations] = useState<WorkLocation[]>([]); // 🆕 قائمة المواقع
  const [employeeLocations, setEmployeeLocations] = useState<Map<number, number[]>>(new Map()); // 🆕 خريطة الموظف ← مواقعه

  useEffect(() => {
    loadData();
  }, [refreshKey, manualRefresh, user.id]);

  function loadData() {
    setLoading(true);
    const employees = getManagedEmployees(user);
    const attendance = getAttendance();
    const vacations = getVacations();

    // 🆕 تحميل المواقع + خريطة الموظفين
    setLocations(getLocations().filter(loc => loc.active));
    const empLocMap = new Map<number, number[]>();
    employees.forEach(emp => {
      empLocMap.set(emp.id, emp.locationIds || []);
    });
    setEmployeeLocations(empLocMap);

    const trackerData: TrackerRow[] = employees.map((emp) => {
      const empAttendance = attendance.filter(a => a.employeeId === emp.id);
      const empVacations = vacations.filter(v => v.employeeId === emp.id);
      const countBy = (status: string) => empAttendance.filter(r => r.status === status).length;
      const present = countBy('حاضر');
      const sahar = countBy('سهر');
      const casualPresent = countBy('عارضة حضور');
      const absent = countBy('غياب');
      const overtimeLeave = countBy('بدل سهرة');
      const effectivePresent = Math.max(0, present + sahar + casualPresent);
      const cycles = Math.floor(effectivePresent / 12);
      const grad = computeGraduatedVacation(effectivePresent);
      const vacationDaysTaken = getVacationDaysTaken(empAttendance, empVacations);
      const saharBalance = Math.max(0, sahar - overtimeLeave);
      const vacationBalance = grad.earned - vacationDaysTaken + saharBalance;
      return {
        employeeId: emp.id,
        name: emp.name,
        jobTitle: emp.jobTitle,
        phone: emp.phone,
        workCycle: emp.workCycle,
        cycleType: emp.cycleType || 'fixed',
        currentStage: grad.stage,
        currentStageLabel: grad.stageLabel,
        totalPresent: effectivePresent,
        cycles,
        earnedVacationDays: grad.earned,
        vacationDaysTaken,
        vacationBalance,
        deficitDays: Math.max(0, -vacationBalance),
        daysToNextVacation: grad.daysToNext,
        progressPct: grad.progressPct,
        casualPresentDays: casualPresent,
        casualVacationDays: countBy('عارضة إجازة') + countBy('إجازة عارضة'),
        sickLeave: countBy('إجازة مرضية') + sumApprovedByTypes(empVacations, ['مرضية', 'إجازة مرضية']),
        absent,
        unpaidLeave: countBy('بدون مرتب') + sumApprovedByTypes(empVacations, ['بدون مرتب']),
        saharDays: sahar,
        saharBalance,
        officialLeave: countBy('إجازة رسمية') + sumApprovedByTypes(empVacations, ['رسمية', 'إجازة رسمية']),
        annualLeave: countBy('إجازة سنوية') + sumApprovedByTypes(empVacations, ['سنوية', 'إجازة سنوية']),
      };
    });
    setRows(trackerData);
    setLoading(false);
  }

  // 🆕 فلترة الصفوف حسب الموقع المختار
  const filteredRows = useMemo(() => {
    if (!locationFilter) return rows;
    return rows.filter(r => {
      const empLocs = employeeLocations.get(r.employeeId) || [];
      return empLocs.includes(Number(locationFilter));
    });
  }, [rows, locationFilter, employeeLocations]);

  const isEmployeeView = user.role === 'employee';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex-wrap gap-3">
        <div>
          <h2 className="font-black text-slate-900">{isEmployeeView ? '📋 رصيد إجازاتي' : '📋 رصيد الإجازات'}</h2>
          <p className="text-xs font-bold text-slate-400">{isEmployeeView ? 'رصيدك الشخصي فقط - يتحدث تلقائياً بعد الحضور' : user.role === 'manager' ? `موظفي مواقعك فقط (${filteredRows.length})` : `جميع الموظفين (${filteredRows.length})`}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!isEmployeeView && (
            <button onClick={() => setShowRules(v => !v)} className="rounded-xl bg-amber-100 px-4 py-2 text-xs font-black text-amber-800 hover:bg-amber-200">{showRules ? 'إخفاء' : 'نظام الإجازات'}</button>
          )}
          {/* 🆕 فلتر المواقع الجديد */}
          {!isEmployeeView && (
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black text-slate-700 outline-none focus:border-blue-500"
            >
              <option value="">📍 كل المواقع</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          )}
          <button onClick={() => setManualRefresh(v => v + 1)} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white hover:bg-blue-700">🔄 تحديث</button>
        </div>
      </div>

      {showRules && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <h2 className="font-bold text-amber-900 mb-3">📋 نظام الإجازات المعتمد</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-center border-collapse">
              <thead><tr className="bg-amber-100 text-amber-900"><th className="p-2 border border-amber-200">المرحلة</th><th className="p-2 border border-amber-200">الأيام</th><th className="p-2 border border-amber-200">الحساب</th></tr></thead>
              <tbody className="bg-white/60">
                <tr><td className="p-2 border border-amber-100">المرحلة الأولى</td><td className="p-2 border border-amber-100">1 إلى 12</td><td className="p-2 border border-amber-100">÷ 4</td></tr>
                <tr><td className="p-2 border border-amber-100">المرحلة الثانية</td><td className="p-2 border border-amber-100">13 إلى 18</td><td className="p-2 border border-amber-100">÷ 4.5</td></tr>
                <tr><td className="p-2 border border-amber-100">المرحلة الثالثة</td><td className="p-2 border border-amber-100">19+</td><td className="p-2 border border-amber-100">÷ 5</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loading && <div className="text-center text-slate-500 py-8">جاري التحميل...</div>}
      {!loading && filteredRows.length === 0 && <div className="text-center text-slate-500 py-8 bg-white rounded-2xl">لا يوجد موظفون{locationFilter ? ' في هذا الموقع' : ''}</div>}

      {filteredRows.map((r) => (
        <div key={r.employeeId} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
          <div className="flex justify-between items-start mb-3">
            <div><h3 className="font-bold text-lg text-slate-800">{r.name}</h3><p className="text-xs text-slate-500">{r.jobTitle || '—'}</p></div>
            <span className="bg-orange-500 text-white text-xs px-3 py-1 rounded-full">{r.currentStageLabel}</span>
          </div>
          <div className="mb-2 text-xs text-slate-500">التقدم للمرحلة الحالية:</div>
          <div className="w-full bg-slate-100 rounded-full h-3 mb-1 overflow-hidden"><div className="bg-gradient-to-l from-blue-500 to-indigo-500 h-3 rounded-full transition-all" style={{ width: `${r.progressPct}%` }} /></div>
          <div className="text-left text-xs text-slate-500 mb-3">باقي {r.daysToNextVacation} يوم للإجازة القادمة</div>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="bg-blue-50 rounded-lg p-2"><div className="text-xs text-slate-500">إجمالي الحضور</div><div className="text-xl font-bold text-blue-700">{r.totalPresent}</div></div>
            <div className="bg-sky-50 rounded-lg p-2"><div className="text-xs text-slate-500">الدورات</div><div className="text-xl font-bold text-sky-700">{r.cycles}</div></div>
            <div className="bg-green-50 rounded-lg p-2"><div className="text-xs text-slate-500">مستحقة</div><div className="text-xl font-bold text-green-700">{r.earnedVacationDays} يوم</div></div>
            <div className="bg-orange-50 rounded-lg p-2"><div className="text-xs text-slate-500">مأخوذة</div><div className="text-xl font-bold text-orange-700">{r.vacationDaysTaken} يوم</div></div>
            <div className={`rounded-2xl p-4 border-2 col-span-2 ${r.vacationBalance < 0 ? 'bg-red-50 border-red-100' : r.vacationBalance === 0 ? 'bg-amber-50 border-amber-100' : 'bg-emerald-50 border-emerald-100'}`}>
              <div className="text-[10px] font-black uppercase text-slate-500 mb-1">صافي الرصيد المتاح</div>
              <div className={`text-3xl font-black tabular-nums ${r.vacationBalance < 0 ? 'text-red-600' : r.vacationBalance === 0 ? 'text-amber-600' : 'text-emerald-700'}`}>{r.vacationBalance} <span className="text-xs">يوم</span></div>
            </div>
          </div>
          {r.deficitDays > 0 && <div className="mt-3 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">⚠️ عجز {r.deficitDays} يوم</div>}
          <div className="mt-3 flex justify-between text-sm border-t border-slate-100 pt-3"><span className="text-slate-500">بدل السهرة:</span><span className="font-bold text-cyan-700">{r.saharBalance} يوم</span></div>
        </div>
      ))}
    </div>
  );
}
