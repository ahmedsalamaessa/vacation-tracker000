import { useState, useMemo } from 'react';
import { getEmployees, getAttendance, getVacations, getLocations } from '../lib/db';
import { calculateEmployeeBalance } from '../lib/balance';
import type { Employee } from '../lib/types';

export default function TrackerTab({ user, refreshKey }: { user: Employee; refreshKey: number }) {
  const [locFilter, setLocFilter] = useState<string>('all');
  const [jobFilter, setJobFilter] = useState<string>('all');

  const locations = useMemo(() => getLocations(), []);
  const jobs = useMemo(() => {
    const allEmployees = getEmployees();
    return Array.from(new Set(allEmployees.map(e => e.jobTitle).filter(Boolean))).sort();
  }, []);

  const employees = useMemo(() => {
    const all = getEmployees().filter(e => e.active && e.role !== 'admin');
    return all
      .filter(emp => {
        const matchLoc = locFilter === 'all' || emp.locationIds?.some(id => id === locFilter);
        const matchJob = jobFilter === 'all' || emp.jobTitle === jobFilter;
        return matchLoc && matchJob;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [refreshKey, locFilter, jobFilter]);

  const attendance = getAttendance();
  const vacations = getVacations();

  return (
    <div className="space-y-6">
      {/* قسم الفلاتر - الشكل القديم */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">الموقع:</span>
            <select 
              value={locFilter} 
              onChange={e => setLocFilter(e.target.value)}
              className="rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-3 py-2 text-xs font-bold outline-none focus:border-blue-500"
            >
              <option value="all">كل المواقع</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">الوظيفة:</span>
            <select 
              value={jobFilter} 
              onChange={e => setJobFilter(e.target.value)}
              className="rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-3 py-2 text-xs font-bold outline-none focus:border-blue-500"
            >
              <option value="all">كل الوظائف</option>
              {jobs.map(j => <option key={j} value={j}>{j}</option>)}
            </select>
          </div>
        </div>
        <button 
          onClick={() => {}} // يتم التحديث عبر refreshKey من App.tsx
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-black transition-all shadow-sm"
        >
          تحديث 🔄
        </button>
      </div>

      {/* قائمة الموظفين - شكل الكروت القديم */}
      <div className="grid gap-6">
        {employees.map(emp => {
          const empAtt = attendance.filter(a => a.employeeId === emp.id);
          const empVac = vacations.filter(v => v.employeeId === emp.id);
          
          // استخدام المنطق الجديد للحسابات (الاستهلاك التلقائي)
          const balanceData = calculateEmployeeBalance(empAtt, empVac);
          
          const saharEarned = empAtt.filter(r => r.status === 'سهر').length;
          const saharSpent = empAtt.filter(r => r.status === 'بدل سهرة').length;
          const saharBal = Math.max(0, saharEarned - saharSpent);

          const finalBalance = (balanceData.earned - balanceData.taken) + saharBal;

          return (
            <div key={emp.id} className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm hover:border-blue-300 transition-all">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-xl font-black text-slate-900">{emp.name}</h3>
                  <p className="text-xs font-bold text-slate-500">{emp.jobTitle || 'مساح'}</p>
                </div>
                <div className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-[10px] font-black border border-blue-100">
                  {emp.role === 'manager' ? 'مدير فرعي' : 'موظف'}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="rounded-2xl border p-4 text-center bg-blue-50 border-blue-100">
                  <div className="text-xs font-bold text-slate-500">الأيام الفعلية</div>
                  <div className="mt-1 text-2xl font-black text-blue-700">{balanceData.effectivePresent}</div>
                </div>
                <div className="rounded-2xl border p-4 text-center bg-green-50 border-green-100">
                  <div className="text-xs font-bold text-slate-500">مستحقة</div>
                  <div className="mt-1 text-2xl font-black text-green-700">{balanceData.earned}</div>
                </div>
                <div className="rounded-2xl border p-4 text-center bg-orange-50 border-orange-100">
                  <div className="text-xs font-bold text-slate-500">مأخوذة</div>
                  <div className="mt-1 text-2xl font-black text-orange-700">{balanceData.taken}</div>
                </div>
                <div className={`rounded-2xl border p-4 text-center ${finalBalance < 0 ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100'}`}>
                  <div className="text-xs font-bold text-slate-500">صافي الرصيد المتاح</div>
                  <div className={`mt-1 text-2xl font-black ${finalBalance < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{finalBalance}</div>
                </div>
                <div className="rounded-2xl border p-4 text-center bg-cyan-50 border-cyan-100">
                  <div className="text-xs font-bold text-slate-500">بدل السهرة</div>
                  <div className="mt-1 text-2xl font-black text-cyan-700">{saharBal}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
