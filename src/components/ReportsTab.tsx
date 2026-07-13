import { useState, useMemo } from 'react';
import { getEmployees, getAttendance, getVacations } from '../lib/db';
import { getVacationDaysTaken, sumApprovedByTypes } from '../lib/balance';
import type { Employee, AttendanceRecord, Vacation } from '../lib/types';

export default function ReportsTab({ user }: { user: Employee }) {
  const [dateFilter, setDateFilter] = useState<string>('all');

  const employees = useMemo(() => {
    const all = getEmployees().filter(e => e.active);
    return all.sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  const attendance = getAttendance();
  const vacations = getVacations();

  const reportData = useMemo(() => {
    return employees.map(emp => {
      const empAtt = attendance.filter(a => a.employeeId === emp.id);
      const empVac = vacations.filter(v => v.employeeId === emp.id);

      const filteredAtt = dateFilter === 'all' 
        ? empAtt 
        : empAtt.filter(a => a.date === dateFilter);

      const present = filteredAtt.filter(a => a.status === 'حاضر').length;
      const absent = filteredAtt.filter(a => a.status === 'غياب').length;
      const sahar = filteredAtt.filter(a => a.status === 'سهر').length;
      const saharComp = filteredAtt.filter(a => a.status === 'بدل سهرة').length;
      const taken = getVacationDaysTaken(filteredAtt, empVac);

      return {
        name: emp.name,
        job: emp.jobTitle || '—',
        present,
        absent,
        sahar,
        saharComp,
        taken,
      };
    });
  }, [employees, attendance, vacations, dateFilter]);

  const uniqueDates = useMemo(() => {
    const dates = Array.from(new Set(attendance.map(a => a.date))).sort().reverse();
    return dates;
  }, [attendance]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white">📊 تقارير الحضور والإجازات</h2>
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400">إحصائيات تفصيلية لجميع الموظفين</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-600 dark:text-slate-300">تصفية بالتاريخ:</span>
          <select 
            value={dateFilter} 
            onChange={e => setDateFilter(e.target.value)}
            className="rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-3 py-2 text-xs font-bold outline-none focus:border-blue-500"
          >
            <option value="all">الكل</option>
            {uniqueDates.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
        <table className="w-full text-right border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
              <th className="p-4 text-xs font-black text-slate-500 dark:text-slate-400">الموظف</th>
              <th className="p-4 text-xs font-black text-slate-500 dark:text-slate-400">الوظيفة</th>
              <th className="p-4 text-xs font-black text-slate-500 dark:text-slate-400">حضور</th>
              <th className="p-4 text-xs font-black text-slate-500 dark:text-slate-400">غياب</th>
              <th className="p-4 text-xs font-black text-slate-500 dark:text-slate-400">سهر</th>
              <th className="p-4 text-xs font-black text-slate-500 dark:text-slate-400">بدل سهرة</th>
              <th className="p-4 text-xs font-black text-slate-500 dark:text-slate-400">إجازات</th>
            </tr>
          </thead>
          <tbody>
            {reportData.map((row, i) => (
              <tr key={i} className="border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                <td className="p-4 text-sm font-black text-slate-900 dark:text-white">{row.name}</td>
                <td className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400">{row.job}</td>
                <td className="p-4 text-sm font-black text-green-600">{row.present}</td>
                <td className="p-4 text-sm font-black text-red-600">{row.absent}</td>
                <td className="p-4 text-sm font-black text-blue-600">{row.sahar}</td>
                <td className="p-4 text-sm font-black text-cyan-600">{row.saharComp}</td>
                <td className="p-4 text-sm font-black text-orange-600">{row.taken}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
