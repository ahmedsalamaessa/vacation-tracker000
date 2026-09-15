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
  getOvertimeRequests,
  refreshOvertimeRequests,
  decideOvertimeRequest,
} from '../lib/db';
import { getManagedEmployees } from '../lib/permissions';
import type { Employee, Vacation, EquipmentCheckout, OvertimeRequest } from '../lib/types';
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
  const [bulkBusy, setBulkBusy] = useState(false);

  // Selection state for Bulk Approval
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // 📥 طلبات رجوع العدة المعلقة
  const [eqPending, setEqPending] = useState<(EquipmentCheckout & { eqName: string; eqSerial: string; eqKind: string })[]>([]);
  // 🌙 طلبات السهر المعلقة
  const [otPending, setOtPending] = useState<(OvertimeRequest & { employeeName: string })[]>([]);
  const [otBusy, setOtBusy] = useState<number | null>(null);

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
    // 🌙 طلبات السهر المعلقة
    setOtPending(
      getOvertimeRequests()
        .filter(o => o.status === 'pending' && (user.role === 'admin' || user.role === 'manager' || managedIds.has(o.employeeId)))
        .map(o => ({ ...o, employeeName: emps.find(e => e.id === o.employeeId)?.name || `#${o.employeeId}` })),
    );
    setLoading(false);
  }, [user.id]);

  useEffect(() => {
    load();
    refreshOvertimeRequests();
    const t = setTimeout(load, 1500);
    return () => clearTimeout(t);
  }, [load]);

  const pending = useMemo(
    () => allVacations.filter(r => r.status === 'بانتظار الموافقة'),
    [allVacations],
  );

  const approved = useMemo(
    () => allVacations.filter(r => ['مقبولة', 'مجدولة', 'جارية', 'منتهية'].includes(r.status)),
    [allVacations],
  );

  // Group pending vacations by Employee
  const pendingByEmployee = useMemo(() => {
    const map = new Map<number, (Vacation & { employeeName: string; jobTitle: string })[]>();
    for (const v of pending) {
      const list = map.get(v.employeeId) || [];
      list.push(v);
      map.set(v.employeeId, list);
    }
    return Array.from(map.entries()).map(([empId, vacs]) => ({
      empId,
      empName: vacs[0]?.employeeName || 'موظف',
      jobTitle: vacs[0]?.jobTitle || '—',
      vacs,
    }));
  }, [pending]);

  // Toggle Single Selection
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Toggle Select All
  const toggleSelectAll = () => {
    if (selectedIds.length === pending.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(pending.map(p => p.id));
    }
  };

  // 🌟 الاعتماد الجماعي لجميع الإجازات المحددة أو لموظف معين
  async function approveMultipleVacations(vacationIds: number[], groupLabel?: string) {
    if (vacationIds.length === 0) return;
    if (bulkBusy) return;

    setBulkBusy(true);
    setMsg(`⏳ جاري اعتماد ${vacationIds.length} إجازة وتنزيل أيامها في شيت الحضور...`);

    let successCount = 0;
    let totalDaysSynced = 0;

    for (const id of vacationIds) {
      const vac = allVacations.find(v => v.id === id);
      if (!vac) continue;

      try {
        const saved = await updateVacationAsync(id, {
          status: 'مقبولة',
          approvedBy: user.id,
        });

        const updatedVac = { ...(saved || vac), status: 'مقبولة', id: vac.id } as Vacation;
        const result = await syncVacationToAttendanceAsync(updatedVac, { force: false });
        totalDaysSynced += (result?.synced ?? 0);

        addAuditLog({
          actorId: user.id,
          actorName: user.name,
          action: 'اعتماد إجازة دفعة واحدة (Bulk Approve)',
          entityType: 'vacation',
          entityId: id,
          employeeId: vac.employeeId || null,
          employeeName: vac.employeeName,
          date: null,
          oldValue: 'بانتظار الموافقة',
          newValue: 'مقبولة',
          notes: groupLabel || 'اعتماد جماعي بضغطة زر واحدة',
        } as any);

        addSystemNotification({
          type: 'vacation_decision',
          title: 'تم اعتماد إجازتك ✅',
          body: `تم اعتماد إجازة ${vac.vacationType} (${vac.vacationDays} يوم) ونزولها في شيت الحضور`,
          employeeId: vac.employeeId,
          targetUserIds: [vac.employeeId],
          entityType: 'vacation',
          entityId: id,
          severity: 'success',
        });

        successCount++;
      } catch (err) {
        console.error('Error approving vacation', id, err);
      }
    }

    await refreshFromRemote();
    load();
    onChanged?.();
    setBulkBusy(false);
    setSelectedIds([]);

    setMsg(`🎉 تم اعتماد ${successCount} إجازة بنجاح وتنزيل ${totalDaysSynced} يوم في شيت الحضور!`);
    setTimeout(() => setMsg(''), 6000);
  }

  // Reject Multiple
  async function rejectMultipleVacations(vacationIds: number[]) {
    if (vacationIds.length === 0) return;
    const note = window.prompt(`اكتب سبب رفض ${vacationIds.length} إجازة:`);
    if (note === null) return;

    setBulkBusy(true);
    setMsg(`⏳ جاري رفض ${vacationIds.length} إجازة...`);

    for (const id of vacationIds) {
      const vac = allVacations.find(v => v.id === id);
      if (!vac) continue;

      try {
        await updateVacationAsync(id, {
          status: 'مرفوضة',
          approvedBy: user.id,
          notes: note,
        });
        await clearVacationFromAttendanceAsync(vac.id);
      } catch (err) {
        console.error('Error rejecting vacation', id, err);
      }
    }

    await refreshFromRemote();
    load();
    onChanged?.();
    setBulkBusy(false);
    setSelectedIds([]);
    setMsg(`❌ تم رفض ${vacationIds.length} إجازة وحذف أي أيام معلقة من الشيت`);
    setTimeout(() => setMsg(''), 5000);
  }

  // Individual Status Decision
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

  // Sync All Old Approved Vacations
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

  return (
    <div className="space-y-5" dir="rtl">
      
      {/* ============================================================== */}
      {/* MAIN VACATION APPROVALS SECTION */}
      {/* ============================================================== */}
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-2xl font-black text-slate-950 flex items-center gap-2">
              <span>✅</span>
              <span>اعتمادات الإجازات والطلبات المجمعة</span>
            </h2>
            <p className="mt-1 text-xs font-bold text-slate-500">
              {user.role === 'manager'
                ? `طلبات موظفي مواقعك فقط (${pending.length} معلق)`
                : `كل الطلبات المعلقة (${pending.length} طلب معلق)`} · اعتماد فوري بضغطة زر واحدة وتنزيل مباشر في شيت الحضور
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {pending.length > 0 && (
              <span className="rounded-xl bg-red-100 px-3.5 py-1.5 text-xs font-black text-red-700 animate-pulse">
                🔴 {pending.length} طلب معلق
              </span>
            )}

            <button
              onClick={load}
              className="rounded-xl bg-slate-100 px-3.5 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-200 cursor-pointer"
            >
              🔄 تحديث
            </button>
          </div>
        </div>

        {/* 🌟 BULK APPROVAL TOOLBAR (إذا كان هناك طلبات معلقة) */}
        {pending.length > 0 && (
          <div className="rounded-2xl border-2 border-emerald-300 bg-gradient-to-l from-emerald-50 via-teal-50 to-blue-50 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
            
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 font-black text-xs text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.length === pending.length && pending.length > 0}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded text-emerald-600 cursor-pointer"
                />
                <span>تحديد الكل ({pending.length} طلب)</span>
              </label>

              {selectedIds.length > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-200 text-emerald-900 text-[11px] font-black">
                  تم تحديد {selectedIds.length} طلب
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Button: Approve All or Selected */}
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => {
                  const idsToApprove = selectedIds.length > 0 ? selectedIds : pending.map(p => p.id);
                  approveMultipleVacations(idsToApprove, `اعتماد جماعي (${idsToApprove.length} طلب)`);
                }}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-60"
              >
                <span>⚡</span>
                <span>
                  {selectedIds.length > 0
                    ? `اعتماد الطلبات المحددة (${selectedIds.length}) دفعة واحدة`
                    : `اعتماد جميع الطلبات المعلقة (${pending.length}) دفعة واحدة`}
                </span>
              </button>

              {selectedIds.length > 0 && (
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => rejectMultipleVacations(selectedIds)}
                  className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs shadow-md transition-all cursor-pointer active:scale-95 disabled:opacity-60"
                >
                  <span>✕</span> رفض المحددة
                </button>
              )}
            </div>

          </div>
        )}

        {/* Notice Message */}
        {msg && (
          <div className="rounded-xl bg-blue-50 px-4 py-3 text-center text-sm font-bold text-blue-700 border border-blue-200 animate-fade-in">
            {msg}
          </div>
        )}

        {/* Sync Old Vacations Banner */}
        {approved.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 flex items-center justify-between gap-3 flex-wrap text-xs">
            <div className="flex items-center gap-2 font-bold text-slate-700">
              <span>🔄</span>
              <span>مزامنة الإجازات المقبولة ({approved.length} إجازة) مع شيت الحضور في التواريخ المحددة</span>
            </div>
            <button
              onClick={syncAllApproved}
              disabled={syncingAll}
              className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs cursor-pointer disabled:opacity-60"
            >
              {syncingAll ? 'جاري المزامنة...' : 'مزامنة مع الشيت'}
            </button>
          </div>
        )}

        {/* PENDING VACATIONS LIST */}
        {loading ? (
          <div className="py-10 text-center text-slate-500 font-bold">جاري التحميل...</div>
        ) : pending.length === 0 ? (
          <div className="rounded-2xl bg-emerald-50 p-8 text-center border border-emerald-100">
            <div className="text-4xl mb-2">✨</div>
            <div className="font-black text-emerald-800 text-lg">لا توجد طلبات إجازات معلقة</div>
            <div className="mt-1 text-xs font-bold text-emerald-600">
              عندما يطلب أي موظف إجازة أو عدة إجازات معاً، ستظهر هنا فوراً للاعتماد الفردي أو الجماعي
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            
            {/* 🌟 GROUP BY EMPLOYEE: لو موظف طالب كذا إجازة يظهرله زر اعتماد لكل إجازاته معاً */}
            {pendingByEmployee.map(group => {
              const groupIds = group.vacs.map(v => v.id);
              const totalDays = group.vacs.reduce((s, v) => s + v.vacationDays, 0);

              return (
                <div
                  key={group.empId}
                  className="rounded-2xl border-2 border-slate-200 bg-slate-50/70 p-4 space-y-3"
                >
                  {/* Group Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-sm">
                        {group.empName.slice(0, 1)}
                      </span>
                      <div>
                        <h3 className="font-black text-slate-900 text-sm">{group.empName}</h3>
                        <p className="text-[11px] text-slate-500 font-bold">{group.jobTitle} • {group.vacs.length} طلبات إجازة معلقة ({totalDays} يوم إجمالي)</p>
                      </div>
                    </div>

                    {/* Group One-Click Approve All Button */}
                    {group.vacs.length > 1 && (
                      <button
                        type="button"
                        disabled={bulkBusy}
                        onClick={() => approveMultipleVacations(groupIds, `اعتماد كافة إجازات ${group.empName} (${group.vacs.length} طلبات)`)}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-60"
                      >
                        <span>✅</span>
                        <span>اعتماد كافة إجازات {group.empName} دفعة واحدة ({group.vacs.length} طلبات)</span>
                      </button>
                    )}
                  </div>

                  {/* Vacations Cards under this employee */}
                  <div className="grid gap-2.5">
                    {group.vacs.map(row => {
                      const isSelected = selectedIds.includes(row.id);

                      return (
                        <div
                          key={row.id}
                          className={`rounded-xl border p-3.5 transition-all ${
                            isSelected
                              ? 'border-emerald-500 bg-emerald-50/50 shadow-sm'
                              : 'border-slate-200 bg-white'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            
                            {/* Checkbox & Basic info */}
                            <div className="flex items-center gap-2.5">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelect(row.id)}
                                className="w-4 h-4 rounded text-emerald-600 cursor-pointer"
                              />

                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-black text-xs text-slate-900">
                                    {row.vacationType || 'اعتيادية'}
                                  </span>
                                  <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-black">
                                    {row.vacationDays} يوم إجازة
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    ({row.workDays} يوم عمل)
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-600 font-mono mt-0.5">
                                  📅 من <b>{row.startDate || row.vacationStartDate}</b> إلى <b>{row.endDate || row.vacationEndDate}</b>
                                </div>
                              </div>
                            </div>

                            {/* Actions Buttons for this single row */}
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => updateStatus(row.id, 'مقبولة')}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-xs cursor-pointer active:scale-95"
                              >
                                ✅ موافقة
                              </button>
                              <button
                                type="button"
                                onClick={() => updateStatus(row.id, 'مرفوضة')}
                                className="px-2.5 py-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 font-black text-xs cursor-pointer active:scale-95"
                              >
                                ✕ رفض
                              </button>
                            </div>

                          </div>

                          {row.notes && (
                            <div className="mt-2 text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
                              💬 ملاحظة الموظف: {row.notes}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                </div>
              );
            })}

          </div>
        )}

      </section>

      {/* ===== 📥 طلبات رجوع العدة ===== */}
      {eqPending.length > 0 && (
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm space-y-3">
          <h2 className="text-xl font-black text-slate-950 flex items-center gap-2">
            <span>📥</span>
            <span>طلبات رجوع العدة والأجهزة ({eqPending.length})</span>
          </h2>
          <div className="grid gap-3">
            {eqPending.map(co => (
              <div key={co.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
                <div>
                  <div className="font-black text-xs text-slate-900">{co.eqName} ({co.eqSerial})</div>
                  <div className="text-[11px] text-slate-500">المستلم: {co.employeeName}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => decideEq(co, true, 'سليم ✅')}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold"
                  >
                    استلام سليم ✅
                  </button>
                  <button
                    onClick={() => decideEq(co, false)}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold"
                  >
                    رفض
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ===== 🌙 طلبات السهر المعلقة ===== */}
      {otPending.length > 0 && (
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm space-y-3">
          <h2 className="text-xl font-black text-slate-950 flex items-center gap-2">
            <span>🌙</span>
            <span>طلبات السهر الإضافي المعلقة ({otPending.length})</span>
          </h2>
          <div className="grid gap-3">
            {otPending.map(ot => (
              <div key={ot.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
                <div>
                  <div className="font-black text-xs text-slate-900">{ot.employeeName} — يوم {ot.date}</div>
                  <div className="text-[11px] text-slate-500">ساعات السهر: {ot.hours} ساعة • {ot.workReport || ot.notes || '—'}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => decideOt(ot, true)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold"
                  >
                    اعتماد السهر ✅
                  </button>
                  <button
                    onClick={() => decideOt(ot, false)}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold"
                  >
                    رفض
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
