import { useCallback, useEffect, useState } from 'react';
import { VACATION_TYPES } from '../lib/constants';
import {
  getVacations,
  getEmployees,
  addVacation,
  deleteVacation,
  addAuditLog,
  clearVacationFromAttendance,
  syncVacationToAttendance,
} from '../lib/db';
import { getManagedEmployees } from '../lib/permissions';
import type { Employee, Vacation } from '../lib/types';

const STATUS_STYLES: Record<string, string> = {
  'بانتظار الموافقة': 'bg-amber-100 text-amber-800 border-amber-300',
  'مقبولة': 'bg-emerald-100 text-emerald-800 border-emerald-300',
  'مرفوضة': 'bg-rose-100 text-rose-800 border-rose-300',
  'مجدولة': 'bg-blue-100 text-blue-800 border-blue-300',
  'جارية': 'bg-indigo-100 text-indigo-800 border-indigo-300',
  'منتهية': 'bg-slate-100 text-slate-700 border-slate-300',
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

interface VacationPeriodItem {
  id: string;
  vacationType: string;
  startDate: string;
  endDate: string;
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

  // Selected Employee (for admin/manager)
  const [employeeId, setEmployeeId] = useState<string>('');

  // Vacation periods list (starts with 1 item, user can add more)
  const [items, setItems] = useState<VacationPeriodItem[]>([
    {
      id: 'v1',
      vacationType: 'اعتيادية',
      startDate: '',
      endDate: '',
      notes: '',
    },
  ]);

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

  // Handlers for managing items list
  const addItemRow = () => {
    setItems(prev => [
      ...prev,
      {
        id: `v-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        vacationType: 'اعتيادية',
        startDate: '',
        endDate: '',
        notes: '',
      },
    ]);
  };

  const removeItemRow = (id: string) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter(x => x.id !== id));
  };

  const updateItem = (id: string, field: keyof VacationPeriodItem, val: string) => {
    setItems(prev =>
      prev.map(item => {
        if (item.id !== id) return item;
        return { ...item, [field]: val };
      })
    );
  };

  // Submit Vacation Request (Single or Multiple)
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');

    const empId = (isAdmin || isManager) ? Number(employeeId) : user.id;
    if (!empId) {
      setMsg('يرجى اختيار الموظف أولاً');
      return;
    }

    if (items.length === 0) {
      setMsg('يرجى إدخال تفاصيل الإجازة');
      return;
    }

    // Validate dates
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.startDate || !it.endDate) {
        setMsg(items.length > 1 ? `يرجى تحديد بداية ونهاية الإجازة رقم (${i + 1})` : 'يرجى تحديد بداية ونهاية الإجازة');
        return;
      }
      if (new Date(it.endDate) < new Date(it.startDate)) {
        setMsg(items.length > 1 ? `تاريخ نهاية الإجازة رقم (${i + 1}) قبل تاريخ بدايتها` : 'تاريخ نهاية الإجازة يسبق تاريخ بدايتها');
        return;
      }
    }

    const status = isAdmin ? 'مجدولة' : 'بانتظار الموافقة';
    let addedCount = 0;
    let totalDays = 0;

    try {
      for (const it of items) {
        const days = calculateDaysBetween(it.startDate, it.endDate);
        const calculatedWorkDays = (it.vacationType === 'اعتيادية' || it.vacationType === 'نظامية')
          ? (days <= 3 ? days * 4 : days === 4 ? 18 : days * 5)
          : days;

        const created = addVacation({
          employeeId: empId,
          workDays: calculatedWorkDays,
          vacationDays: days,
          vacationType: it.vacationType,
          startDate: it.startDate,
          endDate: it.endDate,
          vacationStartDate: it.startDate,
          vacationEndDate: it.endDate,
          status,
          notes: it.notes || (items.length > 1 ? 'طلب إجازة ضمن مجموعة' : null),
          requestedBy: user.id,
          approvedBy: isAdmin ? user.id : null,
        });

        if (status === 'مجدولة') {
          syncVacationToAttendance(created.id);
        }

        addAuditLog({
          actorId: user.id,
          actorName: user.name,
          action: isAdmin ? 'إضافة إجازة مجدولة' : 'طلب إجازة - بانتظار الموافقة',
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

      if (items.length === 1) {
        setMsg(isAdmin ? '✅ تم حفظ وجدولة الإجازة بنجاح!' : '📨 تم إرسال طلب الإجازة للاعتماد بنجاح!');
      } else {
        setMsg(
          isAdmin
            ? `✅ تم حفظ وجدولة ${addedCount} إجازات بإجمالي ${totalDays} يوم بنجاح!`
            : `🎉 تم إرسال ${addedCount} إجازات بإجمالي ${totalDays} يوم للاعتماد دفعة واحدة!`
        );
      }

      // Reset Form to initial 1 item
      setItems([
        {
          id: `v-${Date.now()}`,
          vacationType: 'اعتيادية',
          startDate: '',
          endDate: '',
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

  // Calculate total days
  const totalCalculatedDays = items.reduce((sum, it) => {
    if (it.startDate && it.endDate) {
      return sum + calculateDaysBetween(it.startDate, it.endDate);
    }
    return sum;
  }, 0);

  return (
    <div className="space-y-5" dir="rtl">
      
      {/* Vacation Submission Card */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 space-y-4">
        
        {/* Header Title */}
        <div className="border-b border-slate-100 pb-3">
          <h2 className="font-black text-xl text-slate-900 flex items-center gap-2">
            <span>🏖️</span>
            <span>{isAdmin || isManager ? 'إضافة وجدولة الإجازات' : 'تقديم طلب إجازة'}</span>
          </h2>
          <p className="text-xs text-slate-500 font-bold mt-0.5">
            سجل بيانات الإجازة، ويمكنك الضغط على «إضافة إجازة أخرى» إذا أردت إرسال أكثر من إجازة معاً
          </p>
        </div>

        {msg && (
          <div className="text-xs text-center font-black bg-blue-50 text-blue-800 rounded-xl py-2.5 border border-blue-200 animate-fade-in">
            {msg}
          </div>
        )}

        {/* The Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Employee Selector for Admin/Manager */}
          {(isAdmin || isManager) && (
            <div>
              <label className="block text-xs font-black text-slate-700 mb-1">الموظف *</label>
              <select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-bold bg-white"
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

          {/* List of Vacation Entries */}
          <div className="space-y-3">
            {items.map((it, idx) => {
              const days = (it.startDate && it.endDate) ? calculateDaysBetween(it.startDate, it.endDate) : 0;

              return (
                <div
                  key={it.id}
                  className={`rounded-2xl border p-4 space-y-3 transition-all ${
                    items.length > 1
                      ? 'border-blue-200 bg-blue-50/30 shadow-sm'
                      : 'border-slate-200 bg-slate-50/50'
                  }`}
                >
                  {/* Header if multiple items */}
                  {items.length > 1 && (
                    <div className="flex items-center justify-between border-b border-blue-100 pb-2">
                      <span className="font-black text-xs text-blue-900 flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] font-mono">
                          {idx + 1}
                        </span>
                        <span>فترة إجازة رقم ({idx + 1})</span>
                      </span>

                      <button
                        type="button"
                        onClick={() => removeItemRow(it.id)}
                        className="text-rose-600 hover:text-rose-800 text-xs font-black cursor-pointer px-2 py-1 hover:bg-rose-50 rounded-lg transition-all"
                      >
                        ✕ إلغاء هذه الإجازة
                      </button>
                    </div>
                  )}

                  {/* Fields Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">نوع الإجازة *</label>
                      <select
                        value={it.vacationType}
                        onChange={(e) => updateItem(it.id, 'vacationType', e.target.value)}
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold bg-white"
                      >
                        {VACATION_TYPES.map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">من تاريخ (بداية الإجازة) *</label>
                      <input
                        type="date"
                        value={it.startDate}
                        onChange={(e) => updateItem(it.id, 'startDate', e.target.value)}
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold bg-white"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">إلى تاريخ (نهاية الإجازة) *</label>
                      <input
                        type="date"
                        value={it.endDate}
                        onChange={(e) => updateItem(it.id, 'endDate', e.target.value)}
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold bg-white"
                        required
                      />
                    </div>
                  </div>

                  {/* Notes & Duration preview */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex-1 min-w-[200px]">
                      <input
                        type="text"
                        placeholder="سبب الإجازة أو تفاصيل إضافية (اختياري)..."
                        value={it.notes || ''}
                        onChange={(e) => updateItem(it.id, 'notes', e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs bg-white font-bold"
                      />
                    </div>

                    {it.startDate && it.endDate && (
                      <span className="text-xs font-black text-emerald-800 bg-emerald-100 border border-emerald-300 px-3 py-1.5 rounded-xl flex items-center gap-1 shrink-0">
                        <span>⏱️ المدة:</span>
                        <span className="font-mono">{days}</span>
                        <span>يوم</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add Another Vacation Button */}
          <button
            type="button"
            onClick={addItemRow}
            className="w-full py-2.5 rounded-2xl border-2 border-dashed border-blue-400 bg-blue-50/50 hover:bg-blue-100/70 text-blue-700 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-sm"
          >
            <span className="text-base">➕</span>
            <span>إضافة إجازة أخرى</span>
          </button>

          {/* Submit Area */}
          {items.length > 1 ? (
            /* Multi-vacation summary & submit button */
            <div className="rounded-2xl bg-gradient-to-l from-slate-900 to-blue-950 text-white p-4 flex flex-wrap items-center justify-between gap-3 shadow-md">
              <div>
                <div className="text-xs text-slate-300 font-bold">إجمالي الإجازات المضافة:</div>
                <div className="text-base font-black text-sky-400 flex items-center gap-2">
                  <span>{items.length} إجازات</span>
                  <span>•</span>
                  <span>{totalCalculatedDays} يوم إجمالي</span>
                </div>
              </div>

              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-lg transition-all cursor-pointer active:scale-95"
              >
                <span>🚀</span>
                <span className="mr-1">
                  {isAdmin ? `حفظ وجدولة (${items.length}) إجازات معاً` : `إرسال كل الإجازات (${items.length}) للاعتماد`}
                </span>
              </button>
            </div>
          ) : (
            /* Single vacation submit button */
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-2xl font-black text-xs shadow-md transition-all cursor-pointer active:scale-[0.99] flex items-center justify-center gap-1.5"
            >
              <span>{isAdmin ? '💾' : '📨'}</span>
              <span>
                {isAdmin
                  ? `حفظ وجدولة الإجازة ${totalCalculatedDays > 0 ? `(${totalCalculatedDays} يوم)` : ''}`
                  : `إرسال طلب الإجازة للاعتماد ${totalCalculatedDays > 0 ? `(${totalCalculatedDays} يوم)` : ''}`}
              </span>
            </button>
          )}

        </form>
      </div>

      {/* Vacations History Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 space-y-3">
        <h2 className="font-black text-lg text-slate-900 flex items-center justify-between">
          <span>🗂️ {isAdmin || isManager ? `سجل الإجازات العام (${list.length})` : `سجل إجازاتي الخاصة (${list.length})`}</span>
          <button
            onClick={load}
            className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1 rounded-xl"
          >
            🔄 تحديث
          </button>
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
                    <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-black border ${STATUS_STYLES[v.status] || ''}`}>
                      {v.status}
                    </span>
                  </div>

                  <div className="text-xs text-slate-600 font-bold mt-1">
                    {v.vacationType} • <span className="text-blue-700 font-black">{v.vacationDays} يوم</span>
                    <span className="text-slate-500 font-mono text-[11px] mr-2">
                      (من {v.startDate || v.vacationStartDate} إلى {v.endDate || v.vacationEndDate})
                    </span>
                  </div>

                  {v.notes && (
                    <div className="text-xs text-slate-500 mt-1">
                      📝 {v.notes}
                    </div>
                  )}

                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                    🕒 تم التقديم: {formatDateTime(v.createdAt)}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <button
                      onClick={() => remove(v.id)}
                      className="text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-2.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all border border-rose-200"
                    >
                      🗑️ حذف
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
