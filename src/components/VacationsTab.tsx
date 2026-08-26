import { useCallback, useEffect, useState } from 'react';
import { WORK_DAY_PRESETS, VACATION_TYPES } from '../lib/constants';
import { earnedVacationDaysForWorkDays } from '../lib/vacation';
import { getVacations, getEmployees, getAttendance, addVacation, updateVacation, deleteVacation, addAuditLog, addSystemNotification, clearVacationFromAttendance, syncVacationToAttendance } from '../lib/db';
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
  return d.toLocaleString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// 🆕 دالة تحسب عدد الأيام بين تاريخين
function calculateDaysBetween(start: string, end: string): number {
  if (!start || !end) return 1;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return 1;
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 عشان يشمل اليوم الأخير
  return Math.max(1, diffDays);
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

  const [employeeId, setEmployeeId] = useState<string>('');
  const [presetIdx, setPresetIdx] = useState(0);
  const [manual, setManual] = useState(false);
  const [vacationType, setVacationType] = useState('اعتيادية');
  const [workDays, setWorkDays] = useState(12);
  const [vacationDays, setVacationDays] = useState(3);
  const [vacStart, setVacStart] = useState('');
  const [vacEnd, setVacEnd] = useState('');
  const [notes, setNotes] = useState('');

  // 🆕 دالة تحقق: هل الإجازة "بدل سهرة"؟
  const isSaharCompensation = vacationType === 'بدل سهرة';

  const load = useCallback(() => {
    setLoading(true);
    const vacs = getVacations();
    const vacsWithNames = vacs.map(v => ({ ...v, employeeName: managed.find(e => e.id === v.employeeId)?.name || getEmployees().find(e => e.id === v.employeeId)?.name || '—' }));
    if (isAdmin || isManager) {
      const managedIds = new Set(managed.map(e => e.id));
      setList(vacsWithNames.filter(v => managedIds.has(v.employeeId)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setEmployeesState(managed);
    } else {
      setList(vacsWithNames.filter(v => v.employeeId === user.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setEmployeesState([user]);
    }
    setLoading(false);
  }, [isAdmin, isManager, user.id]);

  useEffect(() => { load(); }, [load]);

  // 🆕 لما يتغير التاريخ في حالة "بدل سهرة"، احسب الأيام تلقائياً
  useEffect(() => {
    if (isSaharCompensation && vacStart && vacEnd) {
      const days = calculateDaysBetween(vacStart, vacEnd);
      setVacationDays(days);
      setWorkDays(days); // للتوثيق
    }
  }, [vacStart, vacEnd, isSaharCompensation]);

  function applyPreset(idx: number) {
    setPresetIdx(idx);
    if (idx === -1) setManual(true);
    else { setManual(false); setWorkDays(WORK_DAY_PRESETS[idx].workDays); setVacationDays(WORK_DAY_PRESETS[idx].vacationDays); }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    const empId = (isAdmin || isManager) ? Number(employeeId) : user.id;
    if (!empId) { setMsg('اختر الموظف'); return; }
    if (!vacStart || !vacEnd) { setMsg('بداية ونهاية الإجازة مطلوبة'); return; }
    if (new Date(vacEnd) < new Date(vacStart)) { setMsg('تاريخ النهاية قبل البداية'); return; }

    // 🆕 لو بدل سهرة، احسب الأيام من التواريخ
    const finalVacationDays = isSaharCompensation 
      ? calculateDaysBetween(vacStart, vacEnd) 
      : vacationDays;
    const finalWorkDays = isSaharCompensation 
      ? calculateDaysBetween(vacStart, vacEnd) 
      : workDays;

    // 🛡️ تحقق الرصيد: الاعتيادية بس هي اللي بتخصم من رصيد الإجازات
    const isRegularType = ['اعتيادية', 'نظامية', 'إجازة اعتيادية'].includes(vacationType);
    if (isRegularType && finalVacationDays > 0) {
      const empAtt = getAttendance().filter(a => a.employeeId === empId);
      const empVac = getVacations().filter(v => v.employeeId === empId);
      const bal = calculateEmployeeBalance(empAtt, empVac);
      if (finalVacationDays > bal.netBalance) {
        const empName = employees.find(e => e.id === empId)?.name || 'الموظف';
        const deficit = finalVacationDays - bal.netBalance;
        const ok = window.confirm(
          `⚠️ تحقق من الرصيد\n\nرصيد ${empName} الحالي: ${bal.netBalance} يوم\nوالمطلوب: ${finalVacationDays} يوم اعتيادية\n\n` +
          `لو كملت الطلب هيدخل في عجز ${deficit} يوم إضافي.\nتأكيد الطلب برضه؟`
        );
        if (!ok) {
          setMsg('⚠️ تم إلغاء الطلب — الرصيد المتاح ' + bal.netBalance + ' يوم بس');
          return;
        }
      }
    }

    const status = isAdmin ? 'مجدولة' : 'بانتظار الموافقة';

    let created: Vacation;
    try {
      created = addVacation({
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
    } catch (err: any) {
      setMsg('⛔ ' + (err?.message || 'حصل خطأ'));
      return;
    }

    addAuditLog({
      actorId: user.id, actorName: user.name,
      action: isAdmin ? 'إضافة إجازة مجدولة' : 'طلب إجازة جديد - بانتظار الموافقة',
      entityType: 'vacation', entityId: null,
      employeeId: empId, employeeName: employees.find(e => e.id === empId)?.name,
      date: null, oldValue: null, newValue: status,
      notes: `${vacationType} - ${finalVacationDays} يوم من ${vacStart} إلى ${vacEnd}`,
    } as any);

    if (!isAdmin) {
      const targetManagers = getEmployees().filter(e =>
        e.active &&
        (e.role === 'admin' || (e.role === 'manager' && (employees.find(emp => emp.id === empId)?.locationIds || []).some(id => e.locationIds.includes(id))))
      );
      addSystemNotification({
        type: 'vacation_request',
        title: 'طلب إجازة جديد',
        body: `${employees.find(e => e.id === empId)?.name || 'موظف'} طلب إجازة ${vacationType} لمدة ${finalVacationDays} يوم`,
        employeeId: empId,
        targetUserIds: targetManagers.map(m => m.id),
        entityType: 'vacation',
        entityId: created.id,
        severity: 'warn',
      });
    }

    setMsg(status === 'مجدولة' ? '✅ تم جدولة الإجازة' : '✅ تم إرسال طلبك - في انتظار الاعتماد');
    setVacStart(''); setVacEnd(''); setNotes('');
    load(); onChanged?.(); onUpdate?.();
  }

  function remove(id: number) {
    if (!confirm('حذف هذه الإجازة؟')) return;
    deleteVacation(id); load(); onChanged?.(); onUpdate?.();
  }

  function editVacation(v: Vacation & { employeeName?: string }) {
    const nextStart = prompt('تاريخ بداية الإجازة الجديد:', v.startDate || '') ?? null;
    if (nextStart === null) return;
    const nextEnd = prompt('تاريخ نهاية الإجازة الجديد:', v.endDate || '') ?? null;
    if (nextEnd === null) return;
    const nextType = prompt('نوع الإجازة:', v.vacationType || 'اعتيادية') ?? v.vacationType;
    const nextDaysRaw = prompt('عدد أيام الإجازة:', String(v.vacationDays || 1));
    if (nextDaysRaw === null) return;
    const nextDays = Math.max(1, Number(nextDaysRaw) || v.vacationDays || 1);

    if (!nextStart || !nextEnd) { setMsg('بداية ونهاية الإجازة مطلوبة'); return; }
    if (new Date(nextEnd) < new Date(nextStart)) { setMsg('تاريخ النهاية قبل البداية'); return; }

    const updates = {
      startDate: nextStart,
      endDate: nextEnd,
      vacationStartDate: nextStart,
      vacationEndDate: nextEnd,
      vacationType: nextType,
      vacationDays: nextDays,
    };
    const updated = updateVacation(v.id, updates);

    if (updated && ['مقبولة', 'مجدولة', 'جارية', 'منتهية'].includes(updated.status)) {
      clearVacationFromAttendance(v.id);
      const result = syncVacationToAttendance(updated);
      setMsg(`✅ تم تعديل الإجازة وإعادة مزامنتها مع الشيت (${result.synced} يوم)`);
    } else {
      setMsg('✅ تم تعديل الإجازة');
    }

    addAuditLog({
      actorId: user.id,
      actorName: user.name,
      action: 'تعديل إجازة مع إعادة مزامنة',
      entityType: 'vacation',
      entityId: v.id,
      employeeId: v.employeeId,
      employeeName: v.employeeName || null,
      date: null,
      oldValue: `${v.startDate} → ${v.endDate} / ${v.vacationType} / ${v.vacationDays}`,
      newValue: `${nextStart} → ${nextEnd} / ${nextType} / ${nextDays}`,
      notes: ['مقبولة', 'مجدولة', 'جارية', 'منتهية'].includes(v.status) ? 'تم حذف القديم من الشيت وتنزيل الجديد' : null,
    } as any);

    load(); onChanged?.(); onUpdate?.();
  }

  const latestDecision = (!isAdmin && !isManager) ? list.find(v => v.status === 'مقبولة' || v.status === 'مرفوضة') : undefined;

  // 🆕 عدد الأيام لبدل السهرة (محسوب تلقائياً)
  const saharDays = isSaharCompensation && vacStart && vacEnd 
    ? calculateDaysBetween(vacStart, vacEnd) 
    : 0;

  return (
    <div className="space-y-4">
      {latestDecision && (
        <div className={`rounded-2xl border px-4 py-3 text-sm font-bold ${latestDecision.status === 'مقبولة' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {latestDecision.status === 'مقبولة' ? `✅ تم اعتماد إجازتك (${latestDecision.vacationType}) ${latestDecision.vacationDays} يوم` : `❌ تم رفض إجازتك (${latestDecision.vacationType})${latestDecision.notes ? ` - ${latestDecision.notes}` : ''}`}
        </div>
      )}

      <form onSubmit={submit} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-4">
        <h2 className="font-bold text-lg text-slate-800">➕ {isAdmin || isManager ? 'إضافة إجازة' : 'طلب إجازة جديد'}</h2>
        {msg && <div className="text-sm text-center bg-blue-50 text-blue-700 rounded-lg py-2 border border-blue-200">{msg}</div>}
        {(isAdmin || isManager) && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">الموظف * {isManager ? `(موظفي مواقعك فقط)` : ''}</label>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2" required>
              <option value="">اختر الموظف...</option>
              {employees.map(emp => (<option key={emp.id} value={emp.id}>{emp.name} - {emp.jobTitle || ''}</option>))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">نوع الإجازة *</label>
          <select value={vacationType} onChange={(e) => setVacationType(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2">
            {VACATION_TYPES.map(type => (<option key={type} value={type}>{type}</option>))}
          </select>
          <p className="mt-1 text-[11px] text-slate-400">
            {isSaharCompensation 
              ? '🌙 بدل السهرة يُخصم من رصيد السهر (اختر عدد الأيام التي تريدها).'
              : 'الاعتيادية والعارضة تخصم من الرصيد بعد الاعتماد، وستنزل تلقائياً في شيت الحضور عند الموافقة.'}
          </p>
        </div>

        {/* 🆕 إخفاء "عدد أيام العمل" لو بدل سهرة */}
        {!isSaharCompensation && (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">عدد أيام العمل *</label>
              <select value={presetIdx} onChange={(e) => applyPreset(Number(e.target.value))} className="w-full border border-slate-300 rounded-lg px-3 py-2">
                {WORK_DAY_PRESETS.map((p, i) => (<option key={i} value={i}>{p.label}</option>))}
                <option value={-1}>أخرى / إدخال يدوي</option>
              </select>
            </div>
            {manual && (
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-slate-500 mb-1">أيام العمل</label><input type="number" value={workDays} onChange={(e) => { const v = Number(e.target.value); setWorkDays(v); setVacationDays(earnedVacationDaysForWorkDays(v)); }} className="w-full border border-slate-300 rounded-lg px-3 py-2" /></div>
                <div><label className="block text-xs text-slate-500 mb-1">أيام الإجازة</label><input type="number" value={vacationDays} onChange={(e) => setVacationDays(Number(e.target.value))} className="w-full border border-slate-300 rounded-lg px-3 py-2" /></div>
              </div>
            )}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">✅ أيام الإجازة: <b>{vacationDays} أيام</b> مقابل {workDays} يوم عمل</div>
            {(() => {
              const liveEmpId = (isAdmin || isManager) ? Number(employeeId) : user.id;
              if (!liveEmpId) return null;
              const isRegular = ['اعتيادية', 'نظامية', 'إجازة اعتيادية'].includes(vacationType);
              if (!isRegular) return null;
              const empAtt = getAttendance().filter(a => a.employeeId === liveEmpId);
              const empVac = getVacations().filter(v => v.employeeId === liveEmpId);
              const bal = calculateEmployeeBalance(empAtt, empVac);
              const enough = bal.netBalance >= vacationDays;
              return (
                <div className={`rounded-lg border p-3 text-sm font-bold ${enough ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-300 text-amber-800'}`}>
                  {enough ? '✅' : '⚠️'} رصيد الإجازات الحالي لـ{employees.find(e => e.id === liveEmpId)?.name || 'الموظف'}: <b>{bal.netBalance} يوم</b>
                  {!enough && vacationDays > 0 && ` — المطلوب ${vacationDays} (ناقص ${vacationDays - bal.netBalance})`}
                </div>
              );
            })()}
          </>
        )}

        {/* 🆕 معلومة لبدل السهرة (بتظهر بس لما يختار التواريخ) */}
        {isSaharCompensation && saharDays > 0 && (
          <div className="bg-cyan-50 border-2 border-cyan-300 rounded-lg p-4 text-sm text-cyan-800">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">🌙</span>
              <span className="font-black">بدل السهرة</span>
            </div>
            <p className="text-xs font-bold">سيتم خصم <b>{saharDays} يوم</b> من رصيد السهر الخاص بك.</p>
          </div>
        )}

        {/* التواريخ (نفس اللي كان موجود قبل كده) */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {isSaharCompensation ? '📅 بداية بدل السهرة *' : 'بداية الإجازة *'}
            </label>
            <input type="date" value={vacStart} onChange={(e) => setVacStart(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {isSaharCompensation ? '📅 نهاية بدل السهرة *' : 'نهاية الإجازة *'}
            </label>
            <input type="date" value={vacEnd} onChange={(e) => setVacEnd(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2" required />
          </div>
        </div>

        <div><label className="block text-sm font-medium text-slate-700 mb-1">ملاحظات</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظات..." className="w-full border border-slate-300 rounded-lg px-3 py-2" rows={2} /></div>
        <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700">{isAdmin ? '💾 حفظ وجدولة' : '📨 إرسال طلب للاعتماد'}</button>
        {!isAdmin && <p className="text-[11px] text-center text-amber-600 font-bold">طلبك سيظهر تلقائياً في "الاعتمادات" حسب موقعك مع عداد أحمر 🔴 وسيتم تنزيله في الشيت عند الموافقة</p>}
      </form>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
        <h2 className="font-bold text-lg text-slate-800 mb-3">🗂️ {isAdmin || isManager ? 'قائمة الإجازات' : 'إجازاتي'}</h2>
        {loading ? <div className="text-center text-slate-500 py-6">جاري التحميل...</div> : list.length === 0 ? <div className="text-center text-slate-500 py-6">لا توجد إجازات</div> : (
          <div className="space-y-3">
            {list.map(v => (
              <div key={v.id} className="border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-bold text-slate-800">{v.employeeName || '—'} <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[v.status] || ''}`}>{v.status}</span></div>
                  <div className="text-xs text-slate-500">
                    {v.vacationType === 'بدل سهرة' 
                      ? <>🌙 بدل سهرة - {v.vacationDays} يوم</>
                      : <>{v.workDays} يوم عمل → {v.vacationDays} أيام • النوع: {v.vacationType}</>
                    }
                  </div>
                  <div className="text-xs text-slate-400">{v.startDate} ← {v.endDate}</div>
                  <div className="mt-1 text-[11px] font-bold text-blue-600">🕒 {formatDateTime(v.createdAt)}</div>
                  {v.status === 'بانتظار الموافقة' && <div className="mt-1 text-[10px] text-amber-600 font-bold">⏳ لا تُحتسب إلا بعد الاعتماد من تبويب "الاعتمادات"</div>}
                </div>
                <div className="flex items-center gap-2">
                  {(isAdmin || isManager) && <button onClick={() => editVacation(v)} className="text-blue-500 hover:text-blue-700 text-lg" title="تعديل وإعادة مزامنة">✏️</button>}
                  {(isAdmin || isManager || v.employeeId === user.id) && <button onClick={() => remove(v.id)} className="text-red-500 hover:text-red-700 text-lg">🗑️</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
