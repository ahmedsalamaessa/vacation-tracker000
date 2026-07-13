import { useMemo } from 'react';
import { getEmployees, getAttendance, getVacations } from '../lib/db';
import { calculateEmployeeBalance } from '../lib/balance';
import type { Employee } from '../lib/types';

export default function TrackerTab({ user, refreshKey }: { user: Employee; refreshKey: number }) {
  const employees = useMemo(() => {
    const all = getEmployees().filter(e => e.active && e.role !== 'admin');
    return all.sort((a, b) => a.name.localeCompare(b.name));
  }, [refreshKey]);

  const attendance = getAttendance();
  const vacations = getVacations();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-white dark:bg-slate-800 p-6 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-sm">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">📋 تتبع أرصدة الإجازات</h2>
          <p className="text-sm font-bold text-slate-500 dark:text-slate-400">حسابات تلقائية بناءً على الحضور الفعلي والاستهلاك</p>
        </div>
        <div className="hidden md:block text-right">
          <div className="text-xs font-black text-slate-400 uppercase tracking-wider">إجمالي الموظفين</div>
          <div className="text-2xl font-black text-blue-600">{employees.length}</div>
        </div>
      </div>

      <div className="grid gap-6">
        {employees.map(emp => {
          const empAtt = attendance.filter(a => a.employeeId === emp.id);
          const empVac = vacations.filter(v => v.employeeId === emp.id);
          
          // استخدام الدالة الشاملة لحساب الرصيد (تطبق الاستهلاك تلقائياً)
          const balanceData = calculateEmployeeBalance(empAtt, empVac);
          
          // حساب بدل السهرة بشكل منفصل
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
