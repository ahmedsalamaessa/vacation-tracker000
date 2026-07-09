import { useCallback, useEffect, useState } from 'react';
import { WORK_DAY_PRESETS, VACATION_TYPES } from '../lib/constants';
import { earnedVacationDaysForWorkDays } from '../lib/vacation';
import { getVacations, getEmployees, addVacation, updateVacation, deleteVacation, addAuditLog, addSystemNotification, clearVacationFromAttendance, syncVacationToAttendance } from '../lib/db';
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

    // لو موظف بيطلب لنفسه دائما pending، لو مدير فرعي يطلب لموظفين مواقعه أيضا pending، لو admin يجدول مباشرة
    const status = isAdmin ? 'مجدولة' : 'بانتظار الموافقة';

    const created = addVacation({
      employeeId: empId,
      workDays,
      vacationDays,
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
      actorId: user.id, actorName: user.name,
      action: isAdmin ? 'إضافة إجازة مجدولة' : 'طلب إجازة جديد - بانتظار الموافقة',
      entityType: 'vacation', entityId: null,
      employeeId: empId, employeeName: employees.find(e => e.id === empId)?.name,
      date: null, oldValue: null, newValue: status,
      notes: `${vacationType} - ${vacationDays} يوم من ${vacStart} إلى ${vacEnd}`,
    } as any);

    if (!isAdmin) {
      const targetManagers = getEmployees().filter(e =>
        e.active &&
        (e.role === 'admin' || (e.role === 'manager' && (employees.find(emp => emp.id === empId)?.locationIds || []).some(id => e.locationIds.includes(id))))
      );
      addSystemNotification({
        type: 'vacation_request',
        title: 'طلب إجازة جديد',
        body: `${employees.find(e => e.id === empId)?.name || 'موظف'} طلب إجازة ${vacationType} لمدة ${vacationDays} يوم`,
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

    // لو الإجازة معتمدة/مجدولة، امسح القديم من الشيت ونزل الجديد فوراً.
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
          <p className="mt-1 text-[11px] text-slate-400">الاعتيادية والعارضة تخصم من الرصيد بعد الاعتماد، وستنزل تلقائياً في شيت الحضور عند الموافقة.</p>
        </div>
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
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-sm font-medium text-slate-700 mb-1">بداية الإجازة *</label><input type="date" value={vacStart} onChange={(e) => setVacStart(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2" required /></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">نهاية الإجازة *</label><input type="date" value={vacEnd} onChange={(e) => setVacEnd(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2" required /></div>
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
                  <div className="text-xs text-slate-500">{v.workDays} يوم عمل → {v.vacationDays} أيام • النوع: {v.vacationType}</div>
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
