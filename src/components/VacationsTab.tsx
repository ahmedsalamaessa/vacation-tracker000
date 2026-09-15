import { useCallback, useEffect, useState } from 'react';
import { WORK_DAY_PRESETS, VACATION_TYPES } from '../lib/constants';
import { earnedVacationDaysForWorkDays } from '../lib/vacation';
import {
  getVacations,
  getEmployees,
  getAttendance,
  addVacation,
  updateVacation,
  deleteVacation,
  addAuditLog,
  addSystemNotification,
  clearVacationFromAttendance,
  syncVacationToAttendance,
} from '../lib/db';
import { calculateEmployeeBalance } from '../lib/balance';
import { getManagedEmployees } from '../lib/permissions';
import type { Employee, Vacation } from '../lib/types';

const STATUS_STYLES: Record<string, string> = {
  'بانتظار الموافقة': 'bg-yellow-100 text-yellow-800',
  'مقبولة': 'bg-green-100 text-green-800',
  'مرفوضة': 'bg-red-100 text-red-800',
  'مجدولة': 'bg-blue-100 text-blue-800',
  'جارية': 'bg-indigo-100 text-indigo-800',
  'منتهية': 'bg-slate-100 text-slate-700',
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function calculateDaysBetween(start: string, end: string): number {
  if (!start || !end) return 1;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return 1;
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, diffDays);
}

interface MultiVacationItem {
  id: string;
  vacationType: string;
  startDate: string;
  endDate: string;
  vacationDays: number;
  workDays: number;
  notes?: string;
}

interface Props {
  user: Employee;
  onChanged?: () => void;
  onUpdate?: () => void;
}

export default function VacationsTab({ user, onChanged, onUpdate }: Props) {
  const isAdmin = user.role === 'admin';
  const isManager = user.role === 'manager';
  const managed = getManagedEmployees(user);
  const [list, setList] = useState<(Vacation & { employeeName?: string })[]>([]);
  const [employees, setEmployeesState] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  // Mode: Single Request vs Multiple Requests Builder
  const [formMode, setFormMode] = useState<'single' | 'multiple'>('single');

  // Single Form State
  const [employeeId, setEmployeeId] = useState<string>('');
  const [presetIdx, setPresetIdx] = useState(0);
  const [manual, setManual] = useState(false);
  const [vacationType, setVacationType] = useState('اعتيادية');
  const [workDays, setWorkDays] = useState(12);
  const [vacationDays, setVacationDays] = useState(3);
  const [vacStart, setVacStart] = useState('');
  const [vacEnd, setVacEnd] = useState('');
  const [notes, setNotes] = useState('');

  // 🌟 Multiple Vacations Batch List State
  const [multiItems, setMultiItems] = useState<MultiVacationItem[]>([
    {
      id: 'm1',
      vacationType: 'اعتيادية',
      startDate: '',
      endDate: '',
      vacationDays: 3,
      workDays: 12,
      notes: '',
    },
  ]);

  const isSaharCompensation = vacationType === 'بدل سهرة';

  const load = useCallback(() => {
    setLoading(true);
    const emps = getEmployees();
    setEmployeesState(emps);
    const vacs = getVacations();

    let filtered: (Vacation & { employeeName?: string })[];
    if (isAdmin) {
      filtered = vacs.map(v => ({
        ...v,
        employeeName: emps.find(e => e.id === v.employeeId)?.name || 'غير معروف',
      }));
    } else if (isManager) {
      const managedIds = new Set(managed.map(e => e.id));
      filtered = vacs
        .filter(v => managedIds.has(v.employeeId))
        .map(v => ({
          ...v,
          employeeName: emps.find(e => e.id === v.employeeId)?.name || 'غير معروف',
        }));
    } else {
      filtered = vacs
        .filter(v => v.employeeId === user.id)
        .map(v => ({ ...v, employeeName: user.name }));
    }

    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setList(filtered);
    setLoading(false);
  }, [user.id, isAdmin, isManager]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (isSaharCompensation && vacStart && vacEnd) {
      const days = calculateDaysBetween(vacStart, vacEnd);
      setVacationDays(days);
      setWorkDays(days);
    }
  }, [vacStart, vacEnd, isSaharCompensation]);

  function applyPreset(idx: number) {
    setPresetIdx(idx);
    if (idx === -1) setManual(true);
    else {
      setManual(false);
      setWorkDays(WORK_DAY_PRESETS[idx].workDays);
      setVacationDays(WORK_DAY_PRESETS[idx].vacationDays);
    }
  }

  // Submit Single Vacation
  function submitSingle(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    const empId = (isAdmin || isManager) ? Number(employeeId) : user.id;
    if (!empId) { setMsg('اختر الموظف'); return; }
    if (!vacStart || !vacEnd) { setMsg('بداية ونهاية الإجازة مطلوبة'); return; }
    if (new Date(vacEnd) < new Date(vacStart)) { setMsg('تاريخ النهاية قبل البداية'); return; }

    const finalVacationDays = isSaharCompensation 
      ? calculateDaysBetween(vacStart, vacEnd) 
      : vacationDays;
    const finalWorkDays = isSaharCompensation 
      ? calculateDaysBetween(vacStart, vacEnd) 
      : workDays;

    const status = isAdmin ? 'مجدولة' : 'بانتظار الموافقة';

    try {
      const created = addVacation({
        employeeId: empId,
        workDays: finalWorkDays,
        vacationDays: finalVacationDays,
        vacationType,
        startDate: vacStart,
        endDate: vacEnd,
        vacationStartDate: vacStart,
        vacationEndDate: vacEnd,
        status,
        notes: notes || null,
        requestedBy: user.id,
        approvedBy: isAdmin ? user.id : null,
      });

      addAuditLog({
        actorId: user.id,
        actorName: user.name,
        action: isAdmin ? 'إضافة إجازة مجدولة' : 'طلب إجازة جديد - بانتظار الموافقة',
        entityType: 'vacation',
        entityId: created.id,
        employeeId: empId,
        employeeName: employees.find(e => e.id === empId)?.name,
        date: null,
        oldValue: null,
        newValue: status,
        notes: `${vacationType} - ${finalVacationDays} يوم من ${vacStart} إلى ${vacEnd}`,
      } as any);

      setMsg(isAdmin ? '✅ تم حفظ الإجازة بنجاح' : '📨 تم إرسال طلب الإجازة للاعتماد');
      setVacStart('');
      setVacEnd('');
      setNotes('');
      load();
      onChanged?.();
      onUpdate?.();
    } catch (err: any) {
      setMsg('⛔ ' + (err?.message || 'حصل خطأ'));
    }
  }

  // 🌟 Submit Multiple Vacations at once
  function submitMultiple(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    const empId = (isAdmin || isManager) ? Number(employeeId) : user.id;
    if (!empId) { setMsg('اختر الموظف'); return; }

    if (multiItems.length === 0) {
      setMsg('يرجى إضافة إجازة واحدة على الأقل');
      return;
    }

    // Validate dates
    for (let i = 0; i < multiItems.length; i++) {
      const it = multiItems[i];
      if (!it.startDate || !it.endDate) {
        setMsg(`يرجى إكمال بداية ونهاية الإجازة رقم (${i + 1})`);
        return;
      }
      if (new Date(it.endDate) < new Date(it.startDate)) {
        setMsg(`تاريخ نهاية الإجازة رقم (${i + 1}) قبل تاريخ بدايتها`);
        return;
      }
    }

    const status = isAdmin ? 'مجدولة' : 'بانتظار الموافقة';
    let addedCount = 0;
    let totalDays = 0;

    try {
      for (const it of multiItems) {
        const days = calculateDaysBetween(it.startDate, it.endDate);
        const created = addVacation({
          employeeId: empId,
          workDays: it.workDays || days,
          vacationDays: days,
          vacationType: it.vacationType,
          startDate: it.startDate,
          endDate: it.endDate,
          vacationStartDate: it.startDate,
          vacationEndDate: it.endDate,
          status,
          notes: it.notes || 'طلب مجمع متعدد الإجازات',
          requestedBy: user.id,
          approvedBy: isAdmin ? user.id : null,
        });

        addAuditLog({
          actorId: user.id,
          actorName: user.name,
          action: isAdmin ? 'إضافة إجازة متعددة مجدولة' : 'طلب إجازة مجمعة - بانتظار الموافقة',
          entityType: 'vacation',
          entityId: created.id,
          employeeId: empId,
          employeeName: employees.find(e => e.id === empId)?.name,
          date: null,
          oldValue: null,
          newValue: status,
          notes: `${it.vacationType} - ${days} يوم (${it.startDate} ← ${it.endDate})`,
        } as any);

        addedCount++;
        totalDays += days;
      }

      setMsg(
        isAdmin
          ? `✅ تم حفظ ${addedCount} إجازات بإجمالي ${totalDays} يوم بنجاح!`
          : `🎉 تم إرسال ${addedCount} طلبات إجازة بإجمالي ${totalDays} يوم للاعتماد دفعة واحدة!`
      );

      // Reset
      setMultiItems([
        {
          id: `m-${Date.now()}`,
          vacationType: 'اعتيادية',
          startDate: '',
          endDate: '',
          vacationDays: 3,
          workDays: 12,
          notes: '',
        },
      ]);
      load();
      onChanged?.();
      onUpdate?.();
    } catch (err: any) {
      setMsg('⛔ ' + (err?.message || 'حصل خطأ'));
    }
  }

  // Multi-Items Handlers
  const addMultiItemRow = () => {
    setMultiItems(prev => [
      ...prev,
      {
        id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        vacationType: 'اعتيادية',
        startDate: '',
        endDate: '',
        vacationDays: 3,
        workDays: 12,
        notes: '',
      },
    ]);
  };

  const removeMultiItemRow = (id: string) => {
    if (multiItems.length <= 1) return;
    setMultiItems(prev => prev.filter(x => x.id !== id));
  };

  const updateMultiItem = (id: string, field: keyof MultiVacationItem, val: any) => {
    setMultiItems(prev =>
      prev.map(item => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: val };
        if ((field === 'startDate' || field === 'endDate') && updated.startDate && updated.endDate) {
          updated.vacationDays = calculateDaysBetween(updated.startDate, updated.endDate);
        }
        return updated;
      })
    );
  };

  function remove(id: number) {
    if (!confirm('هل أنت متأكد من حذف هذه الإجازة؟')) return;
    clearVacationFromAttendance(id);
    deleteVacation(id);
    addAuditLog({
      actorId: user.id,
      actorName: user.name,
      action: 'حذف إجازة مع تنظيف الحضور',
      entityType: 'vacation',
      entityId: id,
      employeeId: null,
      employeeName: null,
      date: null,
      oldValue: null,
      newValue: null,
      notes: 'تم حذف الإجازة وتنظيف أيامها من شيت الحضور تلقائياً',
    } as any);
    load();
    onChanged?.();
    onUpdate?.();
  }

  return (
    <div className="space-y-5" dir="rtl">
      
      {/* Top Request Card */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 space-y-4">
        
        {/* Title & Mode Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="font-black text-xl text-slate-900 flex items-center gap-2">
              <span>🏖️</span>
              <span>{isAdmin || isManager ? 'إضافة وجدولة الإجازات' : 'تقديم طلبات الإجازات'}</span>
            </h2>
            <p className="text-xs text-slate-500 font-bold mt-0.5">
              يمكنك طلب إجازة فردية أو إضافة أكثر من فترة وإرسالها للاعتماد دفعة واحدة
            </p>
          </div>

          {/* Mode Pills: Single vs Multiple */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-2xl border border-slate-200">
            <button
              type="button"
              onClick={() => setFormMode('single')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                formMode === 'single'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              📝 إجازة فردية
            </button>
            <button
              type="button"
              onClick={() => setFormMode('multiple')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                formMode === 'multiple'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              📑 طلب عدة إجازات معاً ({multiItems.length})
            </button>
          </div>
        </div>

        {msg && (
          <div className="text-xs text-center font-black bg-blue-50 text-blue-800 rounded-xl py-2.5 border border-blue-200 animate-fade-in">
            {msg}
          </div>
        )}

        {/* ============================================================== */}
        {/* 1) SINGLE VACATION FORM */}
        {/* ============================================================== */}
        {formMode === 'single' && (
          <form onSubmit={submitSingle} className="space-y-4">
            
            {(isAdmin || isManager) && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الموظف *</label>
                <select
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-bold"
                  required
                >
                  <option value="">اختر الموظف...</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} — {emp.jobTitle || ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">نوع الإجازة *</label>
                <select
                  value={vacationType}
                  onChange={(e) => setVacationType(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-bold"
                >
                  {VACATION_TYPES.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              {!isSaharCompensation && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">دورة العمل / الأيام</label>
                  <select
                    value={presetIdx}
                    onChange={(e) => applyPreset(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-bold"
                  >
                    {WORK_DAY_PRESETS.map((p, i) => (
                      <option key={i} value={i}>{p.label}</option>
                    ))}
                    <option value={-1}>أخرى / إدخال يدوي</option>
                  </select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">من تاريخ (بداية الإجازة) *</label>
                <input
                  type="date"
                  value={vacStart}
                  onChange={(e) => setVacStart(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-bold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">إلى تاريخ (نهاية الإجازة) *</label>
                <input
                  type="date"
                  value={vacEnd}
                  onChange={(e) => setVacEnd(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-bold"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات وسبب الإجازة</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="تفاصيل إضافية..."
                className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-bold"
                rows={2}
              />
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-2xl font-black text-xs shadow-md transition-all cursor-pointer"
            >
              {isAdmin ? '💾 حفظ وجدولة الإجازة' : '📨 إرسال طلب الإجازة للاعتماد'}
            </button>
          </form>
        )}

        {/* ============================================================== */}
        {/* 2) MULTIPLE VACATIONS BATCH BUILDER FORM */}
        {/* ============================================================== */}
        {formMode === 'multiple' && (
          <form onSubmit={submitMultiple} className="space-y-4">
            
            <div className="rounded-2xl bg-blue-50/70 border border-blue-200 p-3 text-xs text-blue-900 font-bold">
              💡 <b>ميزة الطلبات المتعددة:</b> يمكنك إضافة أكثر من إجازة بفترات وأنواع مختلفة (مثال: عارضة + اعتيادية + بدل سهرة) وإرسالها دفعة واحدة للمدير لاعتمادها بضغطة واحدة!
            </div>

            {(isAdmin || isManager) && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الموظف *</label>
                <select
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-bold"
                  required
                >
                  <option value="">اختر الموظف...</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} — {emp.jobTitle || ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* List of Vacation Items */}
            <div className="space-y-3">
              {multiItems.map((it, idx) => {
                const days = (it.startDate && it.endDate) ? calculateDaysBetween(it.startDate, it.endDate) : 0;

                return (
                  <div
                    key={it.id}
                    className="rounded-2xl border-2 border-slate-200 bg-slate-50/80 p-4 space-y-3 relative"
                  >
                    <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                      <span className="font-black text-xs text-blue-900 flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px]">
                          {idx + 1}
                        </span>
                        <span>فترة إجازة رقم ({idx + 1})</span>
                      </span>

                      {multiItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeMultiItemRow(it.id)}
                          className="text-rose-600 hover:text-rose-800 text-xs font-bold cursor-pointer"
                        >
                          ✕ حذف هذه الفترة
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">نوع الإجازة:</label>
                        <select
                          value={it.vacationType}
                          onChange={(e) => updateMultiItem(it.id, 'vacationType', e.target.value)}
                          className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold bg-white"
                        >
                          {VACATION_TYPES.map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">من تاريخ:</label>
                        <input
                          type="date"
                          value={it.startDate}
                          onChange={(e) => updateMultiItem(it.id, 'startDate', e.target.value)}
                          className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold bg-white"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">إلى تاريخ:</label>
                        <input
                          type="date"
                          value={it.endDate}
                          onChange={(e) => updateMultiItem(it.id, 'endDate', e.target.value)}
                          className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold bg-white"
                          required
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-xs font-black text-emerald-700 bg-emerald-100/70 px-2.5 py-1 rounded-lg">
                        ⏱️ مدة هذه الإجازة: <b>{days} يوم</b>
                      </span>

                      <input
                        type="text"
                        placeholder="ملاحظات لهذه الفترة..."
                        value={it.notes || ''}
                        onChange={(e) => updateMultiItem(it.id, 'notes', e.target.value)}
                        className="flex-1 max-w-sm border border-slate-200 rounded-xl px-3 py-1.5 text-xs bg-white"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add another period button */}
            <button
              type="button"
              onClick={addMultiItemRow}
              className="w-full py-2.5 rounded-2xl border-2 border-dashed border-blue-400 bg-blue-50/40 text-blue-700 hover:bg-blue-50 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all"
            >
              <span>➕</span>
              <span>إضافة فترة إجازة أخرى للقائمة</span>
            </button>

            {/* Total Summary Banner */}
            <div className="rounded-2xl bg-gradient-to-l from-slate-900 to-blue-950 text-white p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs text-slate-300 font-bold">إجمالي الطلب المجمع:</div>
                <div className="text-lg font-black text-sky-400">
                  {multiItems.length} فترات إجازة • {multiItems.reduce((s, it) => s + ((it.startDate && it.endDate) ? calculateDaysBetween(it.startDate, it.endDate) : 0), 0)} يوم إجمالي
                </div>
              </div>

              <button
                type="submit"
                className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-lg transition-all cursor-pointer active:scale-95"
              >
                <span>🚀</span>
                <span>{isAdmin ? 'حفظ كافة الإجازات معاً' : 'إرسال كل الإجازات دفعة واحدة للاعتماد'}</span>
              </button>
            </div>

          </form>
        )}

      </div>

      {/* ============================================================== */}
      {/* VACATIONS HISTORY TABLE */}
      {/* ============================================================== */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 space-y-3">
        <h2 className="font-black text-lg text-slate-900">
          🗂️ {isAdmin || isManager ? `سجل الإجازات العام (${list.length})` : `سجل إجازاتي الخاصة (${list.length})`}
        </h2>

        {loading ? (
          <div className="text-center text-slate-500 py-6 font-bold">جاري التحميل...</div>
        ) : list.length === 0 ? (
          <div className="text-center text-slate-500 py-6 font-bold text-xs">لا توجد إجازات مسجلة</div>
        ) : (
          <div className="space-y-2.5">
            {list.map(v => (
              <div
                key={v.id}
                className="border border-slate-200 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 hover:border-slate-300 transition-all bg-slate-50/50"
              >
                <div>
                  <div className="font-black text-slate-900 text-sm flex items-center gap-2">
                    <span>{v.employeeName || '—'}</span>
                    <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-black ${STATUS_STYLES[v.status] || ''}`}>
                      {v.status}
                    </span>
                  </div>

                  <div className="text-xs text-slate-600 font-bold mt-1">
                    {v.vacationType} • <span className="text-blue-700 font-black">{v.vacationDays} يوم</span>
                    <span className="text-slate-400 font-mono text-[11px] mr-2">
                      (من {v.startDate || v.vacationStartDate} إلى {v.endDate || v.vacationEndDate})
                    </span>
                  </div>

                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                    🕒 تم التقديم: {formatDateTime(v.createdAt)}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {(isAdmin || isManager || v.employeeId === user.id) && (
                    <button
                      onClick={() => remove(v.id)}
                      className="p-2 rounded-xl text-rose-500 hover:bg-rose-50 text-sm cursor-pointer"
                      title="حذف الإجازة"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
