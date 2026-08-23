import { useState, useMemo } from 'react';
import { getEmployees, getAttendance, getVacations, getLocations } from '../lib/db';
import { calculateEmployeeBalance, getSaharBalance } from '../lib/balance';
import { printAllBalancesTable, printIndividualBalances } from '../lib/printBalance';
import { exportToExcelHTML } from '../lib/export';
import type { Employee } from '../lib/types';
import VacationStagesTable from './VacationStagesTable';

function getStageInfo(effectivePresent: number): { name: string; range: string; color: string; number: string } {
  if (effectivePresent < 0) {
    return { number: '⚠️', name: 'عجز', range: 'مستهلك أكتر من رصيده', color: 'text-red-700' };
  }
  if (effectivePresent === 0) {
    return { number: '—', name: 'قبل البداية', range: 'لسه ماحضرش', color: 'text-slate-400' };
  }
  if (effectivePresent <= 12) {
    return { number: '1', name: 'الأولى', range: '1 - 12 يوم', color: 'text-blue-700' };
  }
  if (effectivePresent <= 18) {
    return { number: '2', name: 'الثانية', range: '13 - 18 يوم', color: 'text-indigo-700' };
  }
  return { number: '3', name: 'الثالثة', range: '19+ يوم', color: 'text-purple-700' };
}

export default function TrackerTab({ user, refreshKey }: { user: Employee; refreshKey: number }) {
  const [locFilter, setLocFilter] = useState<string>('all');
  const [jobFilter, setJobFilter] = useState<string>('all');

  // 🖨️ حالات الطباعة
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printMode, setPrintMode] = useState<'table' | 'individual'>('table');
  const [printScope, setPrintScope] = useState<'filtered' | 'all' | 'selected'>('filtered');
  const [selectedForPrint, setSelectedForPrint] = useState<number[]>([]);

  const locations = useMemo(() => getLocations(), []);

  const jobs = useMemo(() => {
    const allEmployees = getEmployees().filter(e => e.active);
    return Array.from(new Set(allEmployees.map(e => e.jobTitle).filter(Boolean))).sort();
  }, [refreshKey]);

  const employees = useMemo(() => {
    const all = getEmployees().filter(e => e.active);
    return all
      .filter(emp => {
        const matchLoc = locFilter === 'all' || (emp.locationIds && emp.locationIds.some(id => String(id) === locFilter));
        const matchJob = jobFilter === 'all' || emp.jobTitle === jobFilter;
        return matchLoc && matchJob;
      })
      .sort((a, b) => {
        const roleOrder: Record<string, number> = { admin: 0, manager: 1, employee: 2 };
        const roleDiff = (roleOrder[a.role] ?? 3) - (roleOrder[b.role] ?? 3);
        if (roleDiff !== 0) return roleDiff;
        return a.name.localeCompare(b.name);
      });
  }, [refreshKey, locFilter, jobFilter]);

  const attendance = getAttendance();
  const vacations = getVacations();

  // 📊 تصدير تقرير Excel لأرصدة الموظفين المفلترين (بنفس أرقام الشاشة)
  function exportExcel() {
    const rows = employees.map(emp => {
      const empAtt = attendance.filter(a => a.employeeId === emp.id);
      const empVac = vacations.filter(v => v.employeeId === emp.id);
      const bd = calculateEmployeeBalance(empAtt, empVac);
      const saharBal = getSaharBalance(empAtt, empVac);
      const locNames = (emp.locationIds || [])
        .map(id => locations.find(l => l.id === id)?.name)
        .filter(Boolean)
        .join('، ');
      return {
        name: emp.name,
        job: emp.jobTitle || '',
        location: locNames || '—',
        role: emp.role === 'admin' ? 'مدير النظام' : emp.role === 'manager' ? 'مسؤول' : 'موظف',
        stage: bd.stageLabel,
        present: bd.totalPresent,
        consumed: bd.consumedWorkDays,
        effective: bd.effectivePresent,
        earned: bd.earned,
        saharBal,
        net: bd.netBalance,
        deficit: bd.hasDeficit ? `نعم (${bd.deficitDays} يوم)` : 'لا',
      };
    });
    const today = new Date().toISOString().slice(0, 10);
    exportToExcelHTML(
      rows,
      `أرصدة_الإجازات_${today}`,
      {
        name: 'اسم الموظف',
        job: 'الوظيفة',
        location: 'الموقع',
        role: 'الدور',
        stage: 'المرحلة',
        present: 'أيام الحضور',
        consumed: 'أيام مستهلكة',
        effective: 'الأيام الفعلية',
        earned: 'الإجازات المستحقة',
        saharBal: 'رصيد بدل السهرة',
        net: 'صافي الرصيد',
        deficit: 'عجز؟',
      },
      'تقرير أرصدة الإجازات — نظام إدارة الإجازات • قسم المساحة',
    );
  }

  // 🖨️ تنفيذ الطباعة
  function executePrint() {
    let ids: number[] | undefined;

    if (printScope === 'filtered') {
      ids = employees.map(e => e.id);
    } else if (printScope === 'selected') {
      if (selectedForPrint.length === 0) {
        alert('⚠️ اختار موظف واحد على الأقل');
        return;
      }
      ids = selectedForPrint;
    } else {
      ids = undefined; // all
    }

    if (printMode === 'table') {
      printAllBalancesTable(ids);
    } else {
      printIndividualBalances(ids);
    }
    setShowPrintModal(false);
  }

  function togglePrintSelect(id: number) {
    setSelectedForPrint(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  return (
    <div className="space-y-6">
      {/* 🖨️ مودال الطباعة */}
      {showPrintModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="text-center mb-4">
              <div className="text-4xl mb-2">🖨️</div>
              <h3 className="text-xl font-black text-slate-800">طباعة أرصدة الإجازات</h3>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-black text-slate-700 mb-2">📋 نوع الطباعة:</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPrintMode('table')}
                  className={`p-4 rounded-xl border-2 text-center transition ${
                    printMode === 'table'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <div className="text-2xl mb-1">📊</div>
                  <div className="font-black text-sm">جدول مجمع</div>
                  <div className="text-[10px] text-slate-500 mt-1">كل الموظفين في ورقة واحدة</div>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintMode('individual')}
                  className={`p-4 rounded-xl border-2 text-center transition ${
                    printMode === 'individual'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <div className="text-2xl mb-1">📄</div>
                  <div className="font-black text-sm">ورقة فردية</div>
                  <div className="text-[10px] text-slate-500 mt-1">كل موظف في صفحة</div>
                </button>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-black text-slate-700 mb-2">👥 اختار مين:</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPrintScope('filtered')}
                  className={`p-3 rounded-xl border-2 text-center transition ${
                    printScope === 'filtered'
                      ? 'border-orange-500 bg-orange-50 text-orange-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <div className="font-black text-sm">🔍 حسب الفلتر</div>
                  <div className="text-[10px] text-slate-500 mt-1">{employees.length} موظف</div>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintScope('all')}
                  className={`p-3 rounded-xl border-2 text-center transition ${
                    printScope === 'all'
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <div className="font-black text-sm">🌐 كل الموظفين</div>
                  <div className="text-[10px] text-slate-500 mt-1">بدون فلاتر</div>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintScope('selected')}
                  className={`p-3 rounded-xl border-2 text-center transition ${
                    printScope === 'selected'
                      ? 'border-purple-500 bg-purple-50 text-purple-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <div className="font-black text-sm">✅ اختيار محدد</div>
                  <div className="text-[10px] text-slate-500 mt-1">{selectedForPrint.length} محدد</div>
                </button>
              </div>
            </div>

            {printScope === 'selected' && (
              <div className="mb-4 border-2 border-purple-200 rounded-xl p-3 bg-purple-50/50">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-black text-purple-700">
                    اختار الموظفين ({selectedForPrint.length} من {employees.length})
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setSelectedForPrint(employees.map(e => e.id))}
                      className="text-[10px] bg-green-100 text-green-700 px-2 py-1 rounded-full font-black hover:bg-green-200"
                    >
                      ✓ الكل
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedForPrint([])}
                      className="text-[10px] bg-red-100 text-red-700 px-2 py-1 rounded-full font-black hover:bg-red-200"
                    >
                      ✕ مسح
                    </button>
                  </div>
                </div>
                <div className="max-h-60 overflow-y-auto space-y-1">
                  {employees.map(emp => (
                    <label
                      key={emp.id}
                      className="flex items-center gap-2 p-2 bg-white rounded-lg cursor-pointer hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedForPrint.includes(emp.id)}
                        onChange={() => togglePrintSelect(emp.id)}
                        className="w-4 h-4"
                      />
                      <span className="text-sm font-bold text-slate-700 flex-1">{emp.name}</span>
                      <span className="text-[10px] text-slate-400">{emp.jobTitle || '—'}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowPrintModal(false)}
                className="flex-1 bg-slate-200 text-slate-700 py-3 rounded-xl font-black hover:bg-slate-300"
              >
                إلغاء
              </button>
              <button
                onClick={executePrint}
                className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-black hover:bg-blue-700"
              >
                🖨️ طباعة
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">الموقع:</span>
            <select value={locFilter} onChange={e => setLocFilter(e.target.value)} className="rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-3 py-2 text-xs font-bold outline-none focus:border-blue-500">
              <option value="all">كل المواقع</option>
              {locations.map(l => <option key={l.id} value={String(l.id)}>{l.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">الوظيفة:</span>
            <select value={jobFilter} onChange={e => setJobFilter(e.target.value)} className="rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-3 py-2 text-xs font-bold outline-none focus:border-blue-500">
              <option value="all">كل الوظائف</option>
              {jobs.map(j => <option key={j} value={j}>{j}</option>)}
            </select>
          </div>
          <span className="text-xs font-bold text-slate-400">
            العدد: {employees.length}
          </span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* 🖨️ زر الطباعة */}
          <button
            onClick={() => {
              setSelectedForPrint([]);
              setPrintScope('filtered');
              setPrintMode('table');
              setShowPrintModal(true);
            }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-black transition-all shadow-sm"
          >
            🖨️ طباعة
          </button>
          {/* 📊 زر تصدير Excel */}
          <button
            onClick={exportExcel}
            className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-xl text-xs font-black transition-all shadow-sm"
          >
            📊 تصدير Excel
          </button>
          <button onClick={() => window.location.reload()} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-black transition-all shadow-sm">تحديث 🔄</button>
        </div>
      </div>

      <VacationStagesTable />

      {employees.length === 0 ? (
        <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-8 text-center">
          <div className="text-4xl mb-3">🔍</div>
          <div className="font-black text-amber-700 text-lg">مفيش موظفين مطابقين للفلاتر</div>
          <div className="text-sm font-bold text-amber-600 mt-2">جرب تشيل الفلاتر</div>
        </div>
      ) : (
        <div className="grid gap-6">
          {employees.map(emp => {
            const empAtt = attendance.filter(a => a.employeeId === emp.id);
            const empVac = vacations.filter(v => v.employeeId === emp.id);
            const balanceData = calculateEmployeeBalance(empAtt, empVac);
            // 🌙 بدل السهرة: رصيد منفصل لوحدة (لا يُضاف لرصيد الإجازات)
            const saharBal = getSaharBalance(empAtt, empVac);
            const finalBalance = balanceData.netBalance;
            const stageInfo = getStageInfo(balanceData.effectivePresent);
            const hasDeficit = balanceData.hasDeficit;

            const roleLabel = emp.role === 'admin'
              ? 'مدير النظام'
              : emp.role === 'manager'
                ? 'مدير فرعي'
                : 'موظف';

            const roleColor = emp.role === 'admin'
              ? 'bg-purple-100 text-purple-700 border-purple-200'
              : emp.role === 'manager'
                ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
                : 'bg-blue-50 text-blue-700 border-blue-100';

            return (
              <div key={emp.id} className={`rounded-[2rem] border p-6 shadow-sm transition-all ${
                hasDeficit
                  ? 'border-red-300 bg-red-50/30 hover:border-red-400'
                  : emp.role === 'admin'
                    ? 'border-purple-200 bg-purple-50/20 hover:border-purple-400'
                    : 'border-slate-200 bg-white hover:border-blue-300'
              }`}>
                <div className="flex justify-between items-start mb-6">
                  <div className="text-left ml-auto">
                    <h3 className="text-xl font-black text-slate-900">{emp.name}</h3>
                    <p className="text-xs font-bold text-slate-500">{emp.jobTitle || 'مساح'}</p>
                  </div>
                  <div className="flex gap-2 items-start flex-wrap justify-end">
                    {hasDeficit && (
                      <div className="px-3 py-1 rounded-full bg-red-100 text-red-700 text-[10px] font-black border border-red-200 animate-pulse">
                        ⚠️ عجز {balanceData.deficitDays} يوم
                      </div>
                    )}
                    <div className={`px-3 py-1 rounded-full text-[10px] font-black border ${roleColor}`}>
                      {roleLabel}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-6">
                  <div className={`rounded-2xl border p-4 text-center ${
                    hasDeficit ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'
                  }`}>
                    <div className="text-xs font-bold text-slate-500">المرحلة الحالية</div>
                    <div className={`mt-1 text-2xl font-black ${stageInfo.color}`}>
                      {stageInfo.name}
                    </div>
                    <div className="text-[10px] font-bold text-slate-500 mt-1">
                      {stageInfo.range}
                    </div>
                  </div>

                  <div className={`rounded-2xl border p-4 text-center ${
                    balanceData.effectivePresent < 0
                      ? 'bg-red-50 border-red-200'
                      : 'bg-blue-50 border-blue-200'
                  }`}>
                    <div className="text-xs font-bold text-slate-500">الأيام الفعلية</div>
                    <div className={`mt-1 text-2xl font-black ${
                      balanceData.effectivePresent < 0 ? 'text-red-700' : 'text-blue-700'
                    }`}>
                      {balanceData.effectivePresent}
                    </div>
                  </div>

                  <div className="rounded-2xl border p-4 text-center bg-cyan-50 border-cyan-200">
                    <div className="text-xs font-bold text-slate-500">بدل السهرة</div>
                    <div className="mt-1 text-2xl font-black text-cyan-600">{saharBal}</div>
                  </div>

                  <div className="rounded-2xl border p-4 text-center bg-green-50 border-green-200">
                    <div className="text-xs font-bold text-slate-500">مستحقة</div>
                    <div className="mt-1 text-2xl font-black text-green-600">{balanceData.earned}</div>
                  </div>
                </div>

                {hasDeficit && (
                  <div className="mb-4 rounded-2xl border-2 border-red-300 bg-gradient-to-br from-red-50 to-orange-50 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">⚠️</span>
                        <span className="text-sm font-black text-red-800">عجز في الرصيد</span>
                      </div>
                      <span className="text-[10px] font-bold text-red-600 bg-white px-2 py-1 rounded-full">
                        استهلك أكتر من المستحق
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-white border border-red-200 p-3 text-center shadow-sm">
                        <div className="text-[10px] font-black text-red-700 mb-1">📉 أيام العجز</div>
                        <div className="text-2xl font-black text-red-600">
                          {balanceData.deficitDays} يوم
                        </div>
                        <div className="text-[9px] font-bold text-slate-500 mt-1">
                          إجازات زيادة
                        </div>
                      </div>
                      <div className="rounded-xl bg-white border border-orange-200 p-3 text-center shadow-sm">
                        <div className="text-[10px] font-black text-orange-700 mb-1">💼 أيام لتغطية العجز</div>
                        <div className="text-2xl font-black text-orange-600">
                          {Math.abs(balanceData.effectivePresent)} يوم
                        </div>
                        <div className="text-[9px] font-bold text-slate-500 mt-1">
                          محتاج يحضر
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 text-[11px] font-bold text-red-700 text-center bg-white/60 rounded-lg py-2">
                      💡 محتاج يحضر <b>{Math.abs(balanceData.effectivePresent)} يوم</b> عمل عشان يسدد العجز
                    </div>
                  </div>
                )}

                <div className={`rounded-2xl border p-4 text-center mb-4 ${
                  finalBalance < 0
                    ? 'bg-red-50 border-red-200'
                    : 'bg-emerald-50 border-emerald-200'
                }`}>
                  <div className="text-xs font-bold text-slate-500">صافي الرصيد المتاح</div>
                  <div className={`mt-1 text-3xl font-black ${
                    finalBalance < 0 ? 'text-red-600' : 'text-emerald-600'
                  }`}>
                    {finalBalance} يوم
                  </div>
                </div>

                <div className="flex justify-between items-center px-2">
                  <div className="text-xs font-bold text-blue-600">{saharBal} يوم</div>
                  <div className="text-xs font-bold text-slate-400">بدل السهرة:</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
