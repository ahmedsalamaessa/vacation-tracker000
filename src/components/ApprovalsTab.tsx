import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getVacations,
  getEmployees,
  getEquipment,
  getEquipmentCheckouts,
  decideEquipmentReturnRequest,
  updateVacationAsync,
  addAuditLog,
  syncVacationToAttendanceAsync,
  clearVacationFromAttendanceAsync,
  addSystemNotification,
  refreshFromRemote,
} from '../lib/db';
import { getManagedEmployees } from '../lib/permissions';
import type { Employee, Vacation, EquipmentCheckout } from '../lib/types';
import { kindEmoji } from './equipmentKinds';

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

interface Props {
  user: Employee;
  onChanged?: () => void;
}

export default function ApprovalsTab({ user, onChanged }: Props) {
  const [allVacations, setAllVacations] = useState<
    (Vacation & { employeeName: string; jobTitle: string })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [syncingAll, setSyncingAll] = useState(false);
  // 📥 طلبات رجوع العدة المعلقة
  const [eqPending, setEqPending] = useState<(EquipmentCheckout & { eqName: string; eqSerial: string; eqKind: string })[]>([]);

  const load = useCallback(() => {
    setLoading(true);
    const vacs = getVacations();
    const managed = getManagedEmployees(user);
    const managedIds = new Set(managed.map(e => e.id));

    const emps = getEmployees();
    const vacsWithNames = vacs
      .filter(v => managedIds.has(v.employeeId))
      .map(v => {
        const emp = emps.find(e => e.id === v.employeeId);
        return {
          ...v,
          employeeName: emp?.name || 'موظف غير معروف',
          jobTitle: emp?.jobTitle || '—',
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    setAllVacations(vacsWithNames);

    // 📥 طلبات رجوع العدة (إدارة)
    if (user.role === 'admin' || user.role === 'manager') {
      const eqs = getEquipment();
      setEqPending(
        getEquipmentCheckouts()
          .filter(c => !c.returnDate && c.returnReqDate)
          .map(c => {
            const eq = eqs.find(e => e.id === c.equipmentId);
            return { ...c, eqName: eq?.name || `جهاز #${c.equipmentId}`, eqSerial: eq?.serialNumber || '—', eqKind: eq?.kind || '' };
          }),
      );
    } else {
      setEqPending([]);
    }
    setLoading(false);
  }, [user.id]);

  useEffect(() => {
    load();
  }, [load]);

  const pending = useMemo(
    () => allVacations.filter(r => r.status === 'بانتظار الموافقة'),
    [allVacations],
  );

  const approved = useMemo(
    () => allVacations.filter(r => ['مقبولة', 'مجدولة', 'جارية', 'منتهية'].includes(r.status)),
    [allVacations],
  );

  const recentDecisions = useMemo(
    () => allVacations.filter(r => r.status === 'مقبولة' || r.status === 'مرفوضة').slice(0, 5),
    [allVacations],
  );

  // 🆕 مزامنة كل الإجازات المقبولة القديمة
  async function syncAllApproved() {
    if (!confirm(`سيتم إعادة مزامنة ${approved.length} إجازة مقبولة/مجدولة مع شيت الحضور.\n\nالإجازات هتنزل تلقائي في التواريخ الصحيحة.\n\nهل تريد المتابعة؟`)) {
      return;
    }

    setSyncingAll(true);
    setMsg('⏳ جاري مزامنة كل الإجازات المقبولة مع شيت الحضور...');

    try {
      let totalSynced = 0;
      let totalSkipped = 0;
      let processed = 0;

      for (const vac of approved) {
        try {
          const result = await syncVacationToAttendanceAsync(vac as Vacation, { force: false });
          totalSynced += result?.synced ?? 0;
          totalSkipped += result?.skipped ?? 0;
          processed++;
          setMsg(`⏳ جاري المزامنة... (${processed}/${approved.length}) - نزل ${totalSynced} يوم حتى الآن`);
        } catch (err) {
          console.error('sync error for vacation', vac.id, err);
        }
      }

      await refreshFromRemote();

      addAuditLog({
        actorId: user.id,
        actorName: user.name,
        action: 'مزامنة يدوية لكل الإجازات المقبولة مع شيت الحضور',
        entityType: 'vacation',
        entityId: null,
        employeeId: null,
        employeeName: null,
        date: null,
        oldValue: null,
        newValue: `${totalSynced} يوم مزامن، ${totalSkipped} متخطى`,
        notes: `تمت معالجة ${processed} إجازة`,
      } as any);

      setMsg(`✅ تمت المزامنة! نزل ${totalSynced} يوم في شيت الحضور${totalSkipped > 0 ? ` (${totalSkipped} يوم متخطى لوجود حضور فعلي)` : ''}`);
      load();
      onChanged?.();
      setTimeout(() => setMsg(''), 8000);
    } catch (err: any) {
      setMsg(`❌ حصل خطأ: ${err?.message || 'مش عارف السبب'}`);
    } finally {
      setSyncingAll(false);
    }
  }

  async function updateStatus(id: number, status: 'مقبولة' | 'مرفوضة') {
    let rejectionNote: string | null = null;
    if (status === 'مرفوضة') {
      const note = window.prompt('اكتب سبب الرفض (اختياري):');
      if (note === null) return;
      rejectionNote = note;
    }

    const vac = allVacations.find(v => v.id === id);
    if (!vac) return;

    setMsg(status === 'مقبولة' ? '⏳ جاري الاعتماد وتنزيل الأيام في الشيت...' : '⏳ جاري الرفض...');

    const saved = await updateVacationAsync(id, {
      status,
      approvedBy: user.id,
      ...(rejectionNote ? { notes: rejectionNote } : {}),
    });

    let syncMsg = '';
    if (status === 'مقبولة') {
      const updatedVac = { ...(saved || vac), status, id: vac.id } as Vacation;
      const result = await syncVacationToAttendanceAsync(updatedVac, { force: false });
      const serverSync = (saved as any)?._sync;
      const synced = result?.synced ?? serverSync?.synced ?? 0;
      const skipped = result?.skipped ?? serverSync?.skipped ?? 0;

      syncMsg =
        synced > 0
          ? ` · تم تنزيل ${synced} يوم في شيت الحضور تلقائي`
          : ' · لم يتم تنزيل أيام (تحقق من التواريخ أو وجود حضور فعلي)';

      if (skipped > 0) {
        syncMsg += ` (${skipped} يوم متخطى لوجود حضور فعلي)`;
      }
    } else {
      await clearVacationFromAttendanceAsync(vac.id);
    }

    await refreshFromRemote();

    addAuditLog({
      actorId: user.id,
      actorName: user.name,
      action: status === 'مقبولة' ? 'اعتماد إجازة - تنزيل تلقائي في الحضور' : 'رفض إجازة - حذف من الحضور',
      entityType: 'vacation',
      entityId: id,
      employeeId: vac.employeeId || null,
      employeeName: vac.employeeName,
      date: null,
      oldValue: 'بانتظار الموافقة',
      newValue: status,
      notes: rejectionNote,
    } as any);

    addSystemNotification({
      type: 'vacation_decision',
      title: status === 'مقبولة' ? 'تم اعتماد إجازتك' : 'تم رفض إجازتك',
      body:
        status === 'مقبولة'
          ? `تم اعتماد إجازة ${vac.vacationType} لمدة ${vac.vacationDays} يوم${syncMsg}`
          : `تم رفض إجازة ${vac.vacationType} لمدة ${vac.vacationDays} يوم${rejectionNote ? ` - السبب: ${rejectionNote}` : ''}`,
      employeeId: vac.employeeId,
      targetUserIds: [vac.employeeId],
      entityType: 'vacation',
      entityId: id,
      severity: status === 'مقبولة' ? 'success' : 'danger',
    });

    setMsg(
      status === 'مقبولة'
        ? `✅ تم اعتماد الطلب${syncMsg}`
        : '❌ تم رفض الطلب وحذف أيامه من الشيت',
    );
    load();
    onChanged?.();
    setTimeout(() => setMsg(''), 5000);
  }

  /** 📥 استلام أو رفض طلب رجوع عدة */
  const decideEq = (co: EquipmentCheckout & { eqName: string }, approve: boolean, condition?: string) => {
    try {
      decideEquipmentReturnRequest(co.id, approve, condition);
      setMsg(approve
        ? `✅ استلمت ${co.eqName} — ${condition === 'يحتاج صيانة' ? 'اتحول للصيانة 🔧' : 'بقى متاح'}`
        : `❌ اترفض طلب رجوع ${co.eqName} — العدة لسه بره مع المساح`);
      load();
      onChanged?.();
    } catch (err: any) {
      setMsg('⛔ ' + (err?.message || 'حصل خطأ'));
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-slate-950">✅ اعتمادات الإجازات</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">
              {user.role === 'manager'
                ? `طلبات موظفي مواقعك فقط (${pending.length} معلق)`
                : `كل الطلبات المعلقة (${pending.length})`}{' '}
              · الموافقة تنزل تلقائي في الشيت · الرفض يحذف من الشيت
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {pending.length > 0 && (
              <span className="rounded-xl bg-red-100 px-4 py-2 text-xs font-black text-red-700 animate-pulse">
                🔴 {pending.length} طلب معلق
              </span>
            )}
            <button
              onClick={load}
              className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-200"
            >
              🔄 تحديث
            </button>
          </div>
        </div>

        {/* 🆕 كارت المزامنة العامة */}
        {approved.length > 0 && (
          <div className="mb-4 rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="text-3xl">🔄</div>
                <div>
                  <div className="font-black text-emerald-900 text-sm">
                    مزامنة الإجازات القديمة مع شيت الحضور
                  </div>
                  <div className="text-xs font-bold text-emerald-700 mt-1">
                    لو فيه إجازات مقبولة/مجدولة مش نازلة في شيت الحضور، اضغط الزر ده لإعادة مزامنتها
                  </div>
                  <div className="text-[11px] font-bold text-emerald-600 mt-1">
                    📊 عندك {approved.length} إجازة مقبولة/مجدولة
                  </div>
                </div>
              </div>
              <button
                onClick={syncAllApproved}
                disabled={syncingAll}
                className={`rounded-xl px-5 py-3 text-sm font-black text-white shadow-md transition ${
                  syncingAll
                    ? 'bg-slate-400 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700 active:scale-95'
                }`}
              >
                {syncingAll ? '⏳ جاري المزامنة...' : '🔄 مزامنة الكل الآن'}
              </button>
            </div>
          </div>
        )}

        {msg && (
          <div className="mb-4 rounded-xl bg-blue-50 px-4 py-3 text-center text-sm font-bold text-blue-700 border border-blue-200">
            {msg}
          </div>
        )}

        <div className="mb-4 rounded-xl bg-blue-50 border border-blue-200 p-3 text-xs font-bold text-blue-800">
          💡 <b>كيف تعمل:</b> عندما يوافق المدير على إجازة معلقة، أيامها بتنزل تلقائي في{' '}
          <b>شيت الحضور</b> بالحالة الصحيحة (اعتيادية/مرضية...). لو اترفضت بعد ما كانت معتمدة، أيامها
          بتتشال من الشيت فوراً.
        </div>

        {loading ? (
          <div className="py-10 text-center text-slate-500 font-bold">جاري التحميل...</div>
        ) : pending.length === 0 ? (
          <div className="rounded-2xl bg-green-50 p-8 text-center border border-green-100">
            <div className="text-5xl mb-3">✨</div>
            <div className="font-black text-green-700 text-xl">لا توجد طلبات معلقة</div>
            <div className="mt-2 text-sm font-bold text-green-600">
              عندما يطلب أي موظف إجازة، ستظهر هنا مباشرة مع العداد الأحمر 🔴
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            {pending.map(row => (
              <div key={row.id} className="rounded-2xl border-2 border-amber-200 bg-amber-50/60 p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-slate-950">{row.employeeName}</h3>
                    <p className="text-xs font-bold text-slate-500">{row.jobTitle}</p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-700 animate-pulse">
                    ⏳ {row.status} - جديد
                  </span>
                </div>
                <div className="mt-3 grid gap-2 text-sm font-bold text-slate-600 md:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl bg-white p-2 text-center border border-slate-100">
                    <div className="text-[10px] text-slate-400">النوع</div>
                    <div className="font-black">{row.vacationType || 'اعتيادية'}</div>
                  </div>
                  <div className="rounded-xl bg-white p-2 text-center border border-slate-100">
                    <div className="text-[10px] text-slate-400">أيام الإجازة</div>
                    <div className="font-black text-blue-700">{row.vacationDays} يوم</div>
                  </div>
                  <div className="rounded-xl bg-white p-2 text-center border border-slate-100">
                    <div className="text-[10px] text-slate-400">أيام العمل</div>
                    <div className="font-black">{row.workDays} يوم</div>
                  </div>
                  <div className="rounded-xl bg-white p-2 text-center border border-slate-100">
                    <div className="text-[10px] text-slate-400">وقت الطلب</div>
                    <div className="font-black text-xs">{formatDateTime(row.createdAt)}</div>
                  </div>
                </div>
                <div className="mt-3 text-xs font-bold text-slate-500">
                  📅 فترة الإجازة: {row.startDate || row.vacationStartDate || '—'} ←{' '}
                  {row.endDate || row.vacationEndDate || '—'}
                </div>
                {row.notes && (
                  <div className="mt-2 rounded-xl bg-white p-3 text-xs font-bold text-slate-600 border border-slate-100">
                    💬 ملاحظة الموظف: {row.notes}
                  </div>
                )}
                <div className="mt-3 flex gap-3">
                  <button
                    onClick={() => updateStatus(row.id, 'مقبولة')}
                    className="flex-1 rounded-xl bg-green-600 py-3 text-sm font-black text-white hover:bg-green-700 shadow-md active:scale-95"
                  >
                    ✅ موافقة وتنزيل في الشيت
                  </button>
                  <button
                    onClick={() => updateStatus(row.id, 'مرفوضة')}
                    className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-black text-white hover:bg-red-700 shadow-md active:scale-95"
                  >
                    ❌ رفض وحذف من الشيت
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ===== 📥 طلبات رجوع العدة ===== */}
      <section className="rounded-[2rem] border-2 border-amber-300 bg-amber-50 p-6 shadow-sm">
        <h3 className="mb-1 text-lg font-black text-amber-800">📥 طلبات رجوع العدة {eqPending.length > 0 ? `(${eqPending.length})` : ''}</h3>
        <p className="mb-4 text-xs font-bold text-amber-600">المساحين بلّغوا برجوع العدة — استلمها من هنا بضغطة (ونفس الطلبات موجودة في تبويب 🧰 العدة)</p>
        {eqPending.length === 0 ? (
          <div className="rounded-2xl bg-white p-4 text-center text-sm font-bold text-emerald-700">مفيش طلبات رجوع عدة معلقة ✅</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {eqPending.map(co => {
              const emp = getEmployees().find(e => e.id === co.surveyorId);
              return (
                <div key={co.id} className="rounded-2xl border-2 border-amber-200 bg-white p-4">
                  <div className="text-lg font-black text-slate-900">{kindEmoji(co.eqKind)} {co.eqName}</div>
                  <div className="text-xs font-bold text-slate-500">سيريال: {co.eqSerial}</div>
                  <div className="mt-2 space-y-1 text-sm font-bold text-slate-700">
                    <div>👷 {emp?.name || '—'}</div>
                    <div>📅 بلّغ بالرجوع: {co.returnReqDate}</div>
                    <div>🩺 الحالة المعلنة: {co.returnReqCondition || '—'}</div>
                    {co.returnReqNotes && <div className="text-xs text-slate-500">📝 {co.returnReqNotes}</div>}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => decideEq(co, true, 'سليم')} className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700">✅ استلمت — سليم</button>
                    <button onClick={() => decideEq(co, true, 'يحتاج صيانة')} className="flex-1 rounded-xl bg-amber-600 px-3 py-2 text-xs font-black text-white hover:bg-amber-700">🔧 استلمت — صيانة</button>
                    <button onClick={() => decideEq(co, false)} className="rounded-xl bg-red-100 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-200">❌ رفض</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {recentDecisions.length > 0 && (
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-black text-slate-900">📋 آخر القرارات (5)</h3>
          <div className="space-y-2">
            {recentDecisions.map(row => (
              <div
                key={row.id}
                className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-center justify-between gap-3"
              >
                <div>
                  <div className="font-bold text-slate-800">{row.employeeName}</div>
                  <div className="text-xs text-slate-500">
                    {row.vacationType} - {row.vacationDays} يوم · {formatDateTime(row.createdAt)}
                  </div>
                  {row.notes && <div className="text-xs text-slate-400 mt-1">💬 {row.notes}</div>}
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-black ${
                    row.status === 'مقبولة' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}
                >
                  {row.status === 'مقبولة' ? '✅' : '❌'} {row.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
