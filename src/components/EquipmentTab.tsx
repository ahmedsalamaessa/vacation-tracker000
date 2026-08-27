import { useEffect, useState } from 'react';
import {
  getEquipment, getEquipmentCheckouts, getPeople, getLocations, getSettings,
  addEquipment, updateEquipment, deleteEquipment,
  checkoutEquipment, returnEquipmentCheckout, decideEquipmentReturnRequest, refreshEquipment,
  getEquipmentMaintenance, addEquipmentMaintenance, deleteEquipmentMaintenance, refreshMaintenance,
} from '../lib/db';
import type { Employee, Equipment, EquipmentCheckout, EquipmentKind, WorkLocation, EquipmentMaintenance } from '../lib/types';
import { KINDS, KIND_GROUPS, kindEmoji } from './equipmentKinds';
import { downloadCsv } from '../lib/exportCsv';

const CONDITIONS = ['سليم ✅', 'به خدوش ⚠️', 'يحتاج صيانة 🔧'];
const STATUS_STYLE: Record<string, string> = {
  'متاحة': 'bg-emerald-100 text-emerald-700',
  'خارجة': 'bg-red-100 text-red-700',
  'صيانة': 'bg-amber-100 text-amber-700',
};

function daysSince(dateStr: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000));
}

export default function EquipmentTab({ user }: { user: Employee }) {
  const canManage = user.role === 'admin' || user.role === 'manager' || Boolean((user as any).canEditAttendance);
  const today = new Date().toISOString().slice(0, 10);

  const [equipment, setEquipmentState] = useState<Equipment[]>([]);
  const [checkouts, setCheckoutsState] = useState<EquipmentCheckout[]>([]);
  const [employees, setEmployeesState] = useState<Employee[]>([]);
  const [locations, setLocationsState] = useState<WorkLocation[]>([]);
  const [deptName, setDeptName] = useState('');
  const [msg, setMsg] = useState('');

  // فورم إضافة/تعديل جهاز
  const [eqForm, setEqForm] = useState({ id: 0, name: '', kind: 'توتال استيشن' as EquipmentKind, serialNumber: '', notes: '' });
  // 🔧 الصيانة
  const [maintenance, setMaintenanceState] = useState<EquipmentMaintenance[]>([]);
  const [maintForm, setMaintForm] = useState({ equipmentId: 0, issue: '', cost: '', maintDate: today, resolution: '' });
  // 🔍 سجل حياة الجهاز
  const [viewEq, setViewEq] = useState<Equipment | null>(null);
  // 🧾 الجرد
  const [invMode, setInvMode] = useState(false);
  const [invMarks, setInvMarks] = useState<Record<number, 'ok' | 'missing'>>({});
  // فورم خروج عدة — المساح بيسجل لنفسه، والمأمورية (وجهة) للإدارة بس
  const [coForm, setCoForm] = useState<{ surveyorId: number; assistantId: number; checkoutDate: string; notes: string; ids: number[] }>({
    surveyorId: canManage ? 0 : user.id,
    assistantId: 0,
    checkoutDate: today,
    notes: '',
    ids: [],
  });
  // 🆕 وجهة المأمورية: موقع مسجل أو "موقع آخر" نص حر
  const [destSite, setDestSite] = useState('');
  const [destOther, setDestOther] = useState('');
  // 📅 المأمورية لفترة معينة: حتى تاريخ
  const [untilDate, setUntilDate] = useState('');
  // 🔎 بحث في سجل الحركة
  const [coSearch, setCoSearch] = useState('');
  // 🆕 المساعد: موظف مسجل أو اسم حر
  const [assistantIsOther, setAssistantIsOther] = useState(false);
  const [assistantOther, setAssistantOther] = useState('');
  // ⬅️ فورم الرجوع السريع
  const [qReturn, setQReturn] = useState({ surveyorId: 0, condition: CONDITIONS[0], notes: '', ids: [] as number[] });
  // 🖨️ طباعة المأمورية
  const [printGroup, setPrintGroup] = useState<EquipmentCheckout[] | null>(null);
  // الرجوع (نموذج داخلي)

  function reload() {
    setEquipmentState(getEquipment());
    setCheckoutsState(getEquipmentCheckouts());
    setEmployeesState(getPeople<Employee>());
    setLocationsState(getLocations());
    setDeptName(getSettings().department_name || 'قسم المساحة');
    setMaintenanceState(getEquipmentMaintenance());
  }

  useEffect(() => {
    reload();
    refreshEquipment();
    refreshMaintenance();
    const t1 = setTimeout(reload, 1200);
    const t2 = setTimeout(reload, 3500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // للمساح: عدته تتعلّم تلقائي أول ما تظهر (الـ effect نفسه تحت بعد إعلان openCheckouts)
  const [autoFilled, setAutoFilled] = useState(false);

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(''), 4000);
  }

  function empName(id: number | null | undefined): string {
    if (!id) return '—';
    return employees.find(e => e.id === id)?.name || `موظف #${id}`;
  }
  function assistantLabel(co: EquipmentCheckout): string {
    if (co.assistantName) return co.assistantName;
    return empName(co.assistantId);
  }
  function eqOf(id: number): Equipment | undefined {
    return equipment.find(e => e.id === id);
  }

  // ============ المعدات ============
  function submitDevice(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (!eqForm.name.trim() || !eqForm.serialNumber.trim()) { flash('⚠️ الاسم والسيريال نمبر مطلوبين'); return; }
      if (eqForm.id) {
        updateEquipment(eqForm.id, { name: eqForm.name.trim(), kind: eqForm.kind, serialNumber: eqForm.serialNumber.trim(), notes: eqForm.notes });
        flash('✅ تم تعديل الجهاز');
      } else {
        addEquipment({ name: eqForm.name.trim(), kind: eqForm.kind, serialNumber: eqForm.serialNumber.trim(), status: 'متاحة', notes: eqForm.notes, active: true });
        flash('✅ تم تسجيل الجهاز');
      }
      setEqForm({ id: 0, name: '', kind: 'توتال استيشن', serialNumber: '', notes: '' });
      reload();
    } catch (err: any) {
      flash('⛔ ' + (err?.message || 'حصل خطأ'));
    }
  }

  function removeDevice(eq: Equipment) {
    if (!window.confirm(`حذف ${eq.name} (${eq.serialNumber}) نهائيًا؟`)) return;
    try {
      deleteEquipment(eq.id);
      flash('🗑️ تم حذف الجهاز');
      reload();
    } catch (err: any) {
      flash('⛔ ' + (err?.message || 'حصل خطأ'));
    }
  }

  // ============ خروج ورجوع ============
  function submitCheckout(e: React.FormEvent) {
    e.preventDefault();
    try {
      const surveyorId = coForm.surveyorId;
      if (!surveyorId) { flash('⚠️ اختار المساح اللي نازل بالعدة (انت لو المساح: اختار نفسك)'); return; }
      if (coForm.ids.length === 0) { flash('⚠️ اختار جهاز واحد على الأقل'); return; }
      const destination = destSite === '__other__' ? destOther.trim() : (destSite || '');
      if (destSite === '__other__' && !destination) { flash('⚠️ اكتب اسم موقع المأمورية'); return; }
      if (destination && !untilDate) { flash('⚠️ حدد حتى تاريخ — المأمورية لفترة معينة'); return; }
      const assistantName = assistantIsOther ? assistantOther.trim() : '';
      if (assistantIsOther && !assistantName) { flash('⚠️ اكتب اسم المساعد'); return; }
      const r = checkoutEquipment({
        equipmentIds: coForm.ids,
        surveyorId,
        assistantId: assistantIsOther ? null : (coForm.assistantId || null),
        assistantName: assistantName || null,
        checkoutDate: coForm.checkoutDate,
        untilDate: destination ? untilDate : null,
        destination: destination || null,
        notes: coForm.notes || undefined,
        createdBy: user.id,
      });
      flash(`✅ تم تسجيل خروج ${r.created} جهاز${destination ? ` لمأمورية: ${destination}` : ''}${r.blocked.length ? ' — (واتشالت: ' + r.blocked.join('، ') + ')' : ''}`);
      setCoForm({ surveyorId: canManage ? 0 : user.id, assistantId: 0, checkoutDate: today, notes: '', ids: [] });
      setDestSite(''); setDestOther(''); setUntilDate('');
      setAssistantIsOther(false); setAssistantOther('');
      reload();
    } catch (err: any) {
      flash('⛔ ' + (err?.message || 'حصل خطأ'));
    }
  }

  function toggleDevice(id: number) {
    setCoForm(f => ({ ...f, ids: f.ids.includes(id) ? f.ids.filter(x => x !== id) : [...f.ids, id] }));
  }

  /** 🆕 الإدارة تستلم أو ترفض طلب الرجوع */
  function decideReturn(co: EquipmentCheckout, approve: boolean, condition?: string) {
    try {
      decideEquipmentReturnRequest(co.id, approve, condition);
      flash(approve
        ? `✅ استلمت ${eqOf(co.equipmentId)?.name ?? 'الجهاز'} — ${condition === 'يحتاج صيانة' ? 'اتحول للصيانة 🔧' : 'بقى متاح'}`
        : '❌ اترفض طلب الرجوع — العدة لسه بره مع المساح');
      reload();
    } catch (err: any) {
      flash('⛔ ' + (err?.message || 'حصل خطأ'));
    }
  }

  /** رجوع/إبلاغ بضغطة واحدة — حالة سليم مباشرة (لو عايز صيانة: من طلبات الرجوع أو سجل الصيانة) */
  function submitReturn(co: EquipmentCheckout) {
    try {
      returnEquipmentCheckout(co.id, 'سليم');
      flash(canManage
        ? '↩️ استلمت العدة بضغطة — الجهاز بقى متاح ✅'
        : '📤 اتسجل طلب رجوع العدة — الإدارة هي اللي هتستلمها وتأكد');
      reload();
    } catch (err: any) {
      flash('⛔ ' + (err?.message || 'حصل خطأ'));
    }
  }

  /** مجموعة المأمورية: نفس المساح + نفس اليوم + نفس الوجهة = ورقة واحدة بعدة أجهزة */
  function missionGroup(co: EquipmentCheckout): EquipmentCheckout[] {
    const pool = co.returnDate ? checkouts.filter(c => c.returnDate) : checkouts.filter(c => !c.returnDate);
    return pool.filter(c =>
      c.surveyorId === co.surveyorId &&
      c.checkoutDate === co.checkoutDate &&
      (c.destination || '') === (co.destination || '')
    );
  }

  // 🔧 الصيانة
  function submitMaintenance(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (!maintForm.equipmentId) { flash('⚠️ اختار الجهاز'); return; }
      if (!maintForm.issue.trim()) { flash('⚠️ اكتب وصف العطل'); return; }
      addEquipmentMaintenance({
        equipmentId: maintForm.equipmentId,
        issue: maintForm.issue.trim(),
        cost: Number(maintForm.cost) || 0,
        maintDate: maintForm.maintDate,
        resolution: maintForm.resolution || null,
        createdBy: user.id,
      });
      updateEquipment(maintForm.equipmentId, { status: 'صيانة' });
      flash('🔧 اتسجل عطل جديد والجهاز اتحول للصيانة');
      setMaintForm({ equipmentId: 0, issue: '', cost: '', maintDate: today, resolution: '' });
      reload();
    } catch (err: any) {
      flash('⛔ ' + (err?.message || 'حصل خطأ'));
    }
  }

  function fixFromMaintenance(eq: Equipment) {
    updateEquipment(eq.id, { status: 'متاحة' });
    flash('✅ الجهاز رجع متاح من الصيانة');
    reload();
  }

  function removeMaintenance(m: EquipmentMaintenance) {
    if (!window.confirm('حذف سجل الصيانة ده؟')) return;
    deleteEquipmentMaintenance(m.id);
    reload();
  }

  // 📤 تصدير Excel
  function exportDevices() {
    downloadCsv(`سجل_المعدات_${today}.csv`,
      ['النوع', 'الجهاز', 'السيريال', 'الحالة', 'العهدة عند', 'خارجة مع', 'ملاحظات'],
      equipment.map(eq => {
        const openCo = openCheckouts.find(c => c.equipmentId === eq.id);
        return [
          eq.kind, eq.name, eq.serialNumber,
          eq.status + (eq.active ? '' : ' · موقوف'),
          eq.custodyEmployeeId ? empName(eq.custodyEmployeeId) : '',
          openCo ? empName(openCo.surveyorId) : '',
          eq.custodyNotes || eq.notes || '',
        ];
      }));
  }

  function exportCheckouts(list: EquipmentCheckout[], fname: string) {
    downloadCsv(fname,
      ['التاريخ', 'الجهاز', 'النوع', 'السيريال', 'المساح', 'المساعد', 'الوجهة/المأمورية', 'رجعت', 'حالة الرجوع', 'ملاحظات'],
      list.map(co => {
        const eq = eqOf(co.equipmentId);
        return [
          co.checkoutDate, eq?.name ?? `#${co.equipmentId}`, eq?.kind ?? '', eq?.serialNumber ?? '',
          empName(co.surveyorId), assistantLabel(co), co.destination || '',
          co.returnDate || (co.returnDate === null ? 'لسه خارجة' : ''),
          co.conditionReturn || '', co.notes || '',
        ];
      }));
  }

  // 🧾 الجرد
  function expectedPlace(eq: Equipment): string {
    if (eq.status === 'صيانة') return '🔧 في الصيانة';
    const openCo = checkouts.find(c => c.equipmentId === eq.id && !c.returnDate);
    if (openCo) return `🔴 خارجة مع ${empName(openCo.surveyorId)}${openCo.destination ? ` (مأمورية ${openCo.destination})` : ''}`;
    if (eq.custodyEmployeeId) return `📦 عهدة: ${empName(eq.custodyEmployeeId)}`;
    return '🏬 في المخزن';
  }

  function startInventory() {
    setInvMode(true);
    setInvMarks({});
  }

  // ⬅️ رجوع جماعي: كل عدته مرة واحدة
  function pickReturnSurveyor(empId: number) {
    const hisOpen = openCheckouts.filter(c => c.surveyorId === empId).map(c => c.id);
    setQReturn(f => ({ ...f, surveyorId: empId, ids: hisOpen }));
  }

  function toggleReturnId(id: number) {
    setQReturn(f => ({ ...f, ids: f.ids.includes(id) ? f.ids.filter(x => x !== id) : [...f.ids, id] }));
  }

  function submitQuickReturn(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (checkedReturnIds.length === 0) { flash('⚠️ علّم العدة اللي رجعت'); return; }
      const condition = qReturn.condition.replace(/ [✅⚠️🔧]$/, '').trim();
      let done = 0;
      for (const id of checkedReturnIds) {
        try { returnEquipmentCheckout(id, condition, qReturn.notes || undefined); done++; } catch { /* عدّي اللي رجع خلاص */ }
      }
      flash(canManage
        ? `↩️ رجعت ${done} جهاز مرة واحدة — ${condition === 'يحتاج صيانة' ? 'اتحولت للصيانة 🔧' : 'كلها متاحة ✅'}`
        : `📤 اتسجل طلب رجوع ${done} جهاز — في انتظار استلام الإدارة`);
      setQReturn({ surveyorId: 0, condition: CONDITIONS[0], notes: '', ids: [] });
      reload();
    } catch (err: any) {
      flash('⛔ ' + (err?.message || 'حصل خطأ'));
    }
  }

  const available = equipment.filter(e => e.active && e.status === 'متاحة');
  const openCheckouts = checkouts.filter(c => !c.returnDate);
  const myOpenList = canManage ? openCheckouts : openCheckouts.filter(c => c.surveyorId === user.id || c.assistantId === user.id);
  const surveyorsWithOpen = canManage
    ? employees.filter(emp => openCheckouts.some(c => c.surveyorId === emp.id))
    : [];
  const returnList = ((canManage ? qReturn.surveyorId : user.id)
    ? openCheckouts.filter(c => canManage
      ? c.surveyorId === qReturn.surveyorId
      : (c.surveyorId === user.id || c.assistantId === user.id))
    : []).filter(c => canManage || !c.returnReqDate);
  const checkedReturnIds = qReturn.ids.filter(id => returnList.some(c => c.id === id));


  // للمساح: عدته تتعلّم تلقائي أول ما تظهر
  useEffect(() => {
    if (!canManage && !autoFilled && openCheckouts.length > 0) {
      setQReturn(f => (f.ids.length === 0 ? { ...f, ids: openCheckouts.map(c => c.id) } : f));
      setAutoFilled(true);
    }
  }, [openCheckouts, autoFilled, canManage]);
  const history = checkouts.filter(c => c.returnDate).slice(0, 40);
  // 📥 طلبات الرجوع المعلقة (إدارة)
  const pendingReqs = canManage ? checkouts.filter(c => !c.returnDate && c.returnReqDate) : [];
  // 🔎 نتائج البحث: كل الحركة (فتوح + مرجع) — الأحدث الأول
  const coQuery = coSearch.trim().toLowerCase();
  const searchedCheckouts = coQuery
    ? checkouts.filter(co => {
        const eq = eqOf(co.equipmentId);
        return [eq?.name, eq?.serialNumber, empName(co.surveyorId), assistantLabel(co), co.destination, co.notes, co.conditionReturn, co.checkoutDate, co.untilDate, co.returnDate, co.returnReqNotes, co.returnReqCondition]
          .some(v => v && String(v).toLowerCase().includes(coQuery));
      }).slice().reverse()
    : history;

  return (
    <div className="w-full space-y-6">
      {msg && <div className="sticky top-2 z-20 rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-black text-white shadow-lg">{msg}</div>}

      {/* 🔔 تنبيه العدة المتأخرة */}
      {(() => {
        const lateDays = Number((getSettings() as any)?.equipment_late_days) || 7;
        const isLate = (co: EquipmentCheckout) => co.untilDate ? today > co.untilDate : daysSince(co.checkoutDate) >= lateDays;
        const late = openCheckouts.filter(isLate);
        if (late.length === 0) return null;
        return (
          <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-4">
            <div className="mb-2 text-lg font-black text-red-800">🔔 عدة متأخرة بره أكتر من {lateDays} يوم ({late.length})</div>
            <div className="space-y-1">
              {late.map(co => {
                const eq = eqOf(co.equipmentId);
                return (
                  <div key={co.id} className="text-sm font-bold text-red-700">
                    ⚠️ {eq ? `${eq.name} (${eq.serialNumber})` : `#${co.equipmentId}`} — مع {empName(co.surveyorId)} — {co.untilDate ? `مأمورية كان لازم ترجع ${co.untilDate}` : `خارج من ${co.checkoutDate} (${daysSince(co.checkoutDate)} يوم)`}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ===== العدد ===== */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center">
          <div className="text-2xl font-black text-emerald-700">{available.length}</div>
          <div className="text-xs font-bold text-emerald-600">متاحة ✅</div>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-center">
          <div className="text-2xl font-black text-red-700">{openCheckouts.length}</div>
          <div className="text-xs font-bold text-red-600">خارجة 🔴</div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center">
          <div className="text-2xl font-black text-amber-700">{equipment.filter(e => e.status === 'صيانة').length}</div>
          <div className="text-xs font-bold text-amber-600">صيانة 🔧</div>
        </div>
      </div>

      {/* ===== 📅 نزول عدة النهارده ===== */}
      {(() => {
        const todayList = checkouts.filter(c => c.checkoutDate === today);
        return (
          <section className="rounded-[2rem] border-2 border-blue-200 bg-blue-50/60 p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="text-xl font-black text-slate-900">📅 نزول عدة النهارده ({todayList.length})</h3>
              {canManage && todayList.length > 0 && (
                <button type="button" onClick={() => exportCheckouts(todayList, `نزول_النهارده_${today}.csv`)} className="rounded-xl border-2 border-emerald-500 bg-white px-3 py-1.5 text-xs font-black text-emerald-700 hover:bg-emerald-50">📤 Excel</button>
              )}
            </div>
            {todayList.length === 0 ? (
              <div className="rounded-2xl bg-white p-4 text-center text-sm font-bold text-slate-500">لسه محدش نزل بعدة النهارده</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead>
                    <tr className="border-b-2 border-blue-200 text-xs font-black text-blue-700">
                      <th className="p-2">الجهاز</th><th className="p-2">السيريال</th><th className="p-2">المساح</th><th className="p-2">المساعد</th><th className="p-2">الوجهة</th><th className="p-2">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todayList.map(co => {
                      const eq = eqOf(co.equipmentId);
                      return (
                        <tr key={co.id} className="border-b border-blue-100 bg-white/60 font-bold text-slate-800">
                          <td className="p-2 font-black">{eq ? `${kindEmoji(eq.kind)} ${eq.name}` : `#${co.equipmentId}`}</td>
                          <td className="p-2 font-mono">{eq?.serialNumber ?? '—'}</td>
                          <td className="p-2">{empName(co.surveyorId)}</td>
                          <td className="p-2">{assistantLabel(co)}</td>
                          <td className="p-2 text-blue-700">{co.destination || '—'}</td>
                          <td className="p-2">{co.returnDate ? <span className="text-emerald-600">رجعت ✅</span> : <span className="text-red-600">خارجة 🔴</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })()}

      {/* ===== 📥 طلبات رجوع معلقة (إدارة) ===== */}
      {canManage && pendingReqs.length > 0 && (
        <section className="rounded-[2rem] border-2 border-amber-300 bg-amber-50 p-6 shadow-sm">
          <h3 className="mb-1 text-xl font-black text-amber-800">📥 طلبات رجوع معلقة ({pendingReqs.length})</h3>
          <p className="mb-4 text-xs font-bold text-amber-600">المساحين بلّغوا برجوع العدة — استلم بضغطة وحدد حالة الجهاز الفعلية</p>
          <div className="grid gap-3 md:grid-cols-2">
            {pendingReqs.map(co => {
              const eq = eqOf(co.equipmentId);
              return (
                <div key={co.id} className="rounded-2xl border-2 border-amber-200 bg-white p-4">
                  <div className="text-lg font-black text-slate-900">{eq ? `${kindEmoji(eq.kind)} ${eq.name}` : `جهاز #${co.equipmentId}`}</div>
                  <div className="text-xs font-bold text-slate-500">سيريال: {eq?.serialNumber ?? '—'}</div>
                  <div className="mt-2 space-y-1 text-sm font-bold text-slate-700">
                    <div>👷 {empName(co.surveyorId)}{assistantLabel(co) ? ` + ${assistantLabel(co)}` : ''}</div>
                    <div>📅 بلّغ بالرجوع: {co.returnReqDate}</div>
                    <div>🩺 الحالة المعلنة: {co.returnReqCondition || '—'}</div>
                    {co.returnReqNotes && <div className="text-xs text-slate-500">📝 {co.returnReqNotes}</div>}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => decideReturn(co, true, 'سليم')} className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700">✅ استلمت — سليم</button>
                    <button type="button" onClick={() => decideReturn(co, true, 'يحتاج صيانة')} className="flex-1 rounded-xl bg-amber-600 px-3 py-2 text-xs font-black text-white hover:bg-amber-700">🔧 استلمت — صيانة</button>
                    <button type="button" onClick={() => decideReturn(co, false)} className="rounded-xl bg-red-100 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-200">❌ رفض</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ===== العدة الخارجة دلوقتي ===== */}
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-xl font-black text-slate-900">🔴 العدة الخارجة دلوقتي ({openCheckouts.length})</h3>
        {openCheckouts.length === 0 ? (
          <div className="rounded-2xl bg-emerald-50 p-6 text-center font-bold text-emerald-700">كل العدة في المخزن ✅</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {openCheckouts.map(co => {
              const eq = eqOf(co.equipmentId);
              return (
                <div key={co.id} className="rounded-2xl border-2 border-red-200 bg-red-50 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-lg font-black text-slate-900">{eq ? `${eq.name}` : `جهاز #${co.equipmentId}`}</div>
                      <div className="text-xs font-bold text-slate-500">سيريال: {eq?.serialNumber ?? '—'} · {eq?.kind ?? ''}</div>
                    </div>
                    <span className="rounded-full bg-red-600 px-3 py-1 text-[10px] font-black text-white">خارجة {daysSince(co.checkoutDate)} يوم</span>
                  </div>
                  <div className="mt-2 space-y-1 text-sm font-bold text-slate-700">
                    <div>👷 المساح: {empName(co.surveyorId)}</div>
                    <div>🤝 المساعد: {assistantLabel(co)}</div>
                    {co.destination && <div className="text-blue-700">📍 مأمورية: {co.destination}</div>}
                    <div className="text-xs text-slate-500">📅 من: {co.checkoutDate}{co.untilDate ? ` ← حتى: ${co.untilDate}` : ''}{co.notes ? ` · 📝 ${co.notes}` : ''}</div>
                    {co.untilDate && today > co.untilDate && <div className="text-xs font-black text-red-700">⏰ عدّى موعد رجوع المأمورية ({co.untilDate})</div>}
                    {co.returnReqDate && <div className="text-xs font-black text-amber-700">⏳ بلّغ بالرجوع {co.returnReqDate} — في انتظار استلام الإدارة{co.returnReqCondition ? ` (قال: ${co.returnReqCondition})` : ''}</div>}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => setPrintGroup(missionGroup(co))} className="flex-1 rounded-xl border-2 border-slate-900 bg-white px-3 py-2 text-sm font-black text-slate-900 hover:bg-slate-100">🖨️ طباعة</button>
                    {(canManage || ((co.surveyorId === user.id || co.assistantId === user.id) && !co.destination)) && (
                      co.returnReqDate && !canManage ? (
                        <div className="flex-1 rounded-xl bg-amber-100 px-3 py-2 text-center text-[11px] font-black text-amber-700">⏳ بلّغت بالرجوع — في انتظار الإدارة</div>
                      ) : (
                        <button type="button" onClick={() => submitReturn(co)} className="flex-1 rounded-xl bg-slate-900 px-3 py-2 text-sm font-black text-white hover:bg-emerald-700">{canManage ? '↩️ استلام فوري' : '📤 بلّغ برجوعه'}</button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ===== خروج عدة ===== */}
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-1 text-xl font-black text-slate-900">➕ خروج عدة / مأمورية جديدة</h3>
        <p className="mb-4 text-xs font-bold text-slate-500">
          {canManage
            ? 'الإدارة تسجل لأي مساح — والمأمورية يعني جهاز من العهدة يشتغل في موقع تاني لفترة معينة (من ← حتى)'
            : 'سجّل العدة اللي نازل بيها — لو انت مساعد: اختار المساح اللي نازل معاه واختار نفسك مساعد — المأموريات الإدارة بس'}
        </p>
        <form onSubmit={submitCheckout} className="grid gap-3 md:grid-cols-3">
          <label className="text-sm font-black text-slate-700">
            👷 المساح
            <select value={coForm.surveyorId} onChange={e => setCoForm(f => ({ ...f, surveyorId: Number(e.target.value) }))}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm font-bold outline-none focus:border-blue-500">
              <option value={0}>— اختار المساح —</option>
              {employees.filter(e => e.active).map(e => (
                <option key={e.id} value={e.id}>{e.name}{e.jobTitle ? ` (${e.jobTitle})` : ''}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-black text-slate-700">
            🤝 المساعد
            <select value={assistantIsOther ? '__other__' : String(coForm.assistantId)}
              onChange={e => {
                const v = e.target.value;
                if (v === '__other__') { setAssistantIsOther(true); setCoForm(f => ({ ...f, assistantId: 0 })); }
                else { setAssistantIsOther(false); setCoForm(f => ({ ...f, assistantId: Number(v) })); }
              }}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm font-bold outline-none focus:border-blue-500">
              <option value={0}>— بدون مساعد —</option>
              {(() => {
                const active = employees.filter(e => e.active && e.id !== coForm.surveyorId);
                const helpers = active.filter(e => (e.jobTitle || '').includes('مساعد'));
                const rest = active.filter(e => !(e.jobTitle || '').includes('مساعد'));
                return (
                  <>
                    {helpers.length > 0 && (
                      <optgroup label="🤝 مساعدي المساحة">
                        {helpers.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </optgroup>
                    )}
                    {rest.length > 0 && (
                      <optgroup label={helpers.length > 0 ? '👷 باقي الموظفين' : '👷 الموظفين'}>
                        {rest.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </optgroup>
                    )}
                  </>
                );
              })()}
              <option value="__other__">✍️ اسم حر (مش موظف بالنظام)...</option>
            </select>
          </label>
          {assistantIsOther && (
            <>
              <input value={assistantOther} onChange={e => setAssistantOther(e.target.value)} placeholder="اسم المساعد (مثال: سيد عبد الرحمن)" list="vsys-free-assistants"
                className="mt-6 rounded-xl border-2 border-blue-400 px-4 py-3 text-sm font-bold outline-none focus:border-blue-600" />
              <datalist id="vsys-free-assistants">
                {[...new Set(checkouts.map(c => (c.assistantName || '').trim()).filter(Boolean))].map(a => <option key={a} value={a} />)}
              </datalist>
            </>
          )}
          <label className="text-sm font-black text-slate-700">
            📅 تاريخ النزول
            <input type="date" value={coForm.checkoutDate} onChange={e => setCoForm(f => ({ ...f, checkoutDate: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm font-bold outline-none focus:border-blue-500" />
          </label>
          {canManage && (
          <label className="text-sm font-black text-slate-700 md:col-span-2">
            📍 الوجهة / موقع تاني (إداري)
            <select value={destSite} onChange={e => setDestSite(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm font-bold outline-none focus:border-blue-500">
              <option value="">— من غير مأمورية / الموقع الأساسي —</option>
              {locations.filter(l => l.active).map(l => (
                <option key={l.id} value={l.name}>{l.name}</option>
              ))}
              <option value="__other__">➕ موقع آخر (اكتب الاسم)...</option>
            </select>
          </label>
          )}
          {canManage && destSite === '__other__' && (
            <>
              <input value={destOther} onChange={e => setDestOther(e.target.value)} list="vsys-dest-sites" placeholder="اسم موقع المأمورية (مثال: مأمورية العاصمة الإدارية)"
                className="rounded-xl border-2 border-blue-400 px-4 py-3 text-sm font-bold outline-none focus:border-blue-600" />
              <datalist id="vsys-dest-sites">
                {[...new Set(checkouts.map(c => (c.destination || '').trim()).filter(Boolean))].map(d => <option key={d} value={d} />)}
              </datalist>
            </>
          )}
          {canManage && destSite !== '' && (
            <label className="text-sm font-black text-slate-700">
              📅 حتى تاريخ (نهاية المأمورية)
              <input type="date" value={untilDate} onChange={e => setUntilDate(e.target.value)}
                className="mt-1 w-full rounded-xl border-2 border-blue-400 px-3 py-3 text-sm font-bold outline-none focus:border-blue-600" />
            </label>
          )}
          <div className="md:col-span-3">
            <div className="mb-2 text-sm font-black text-slate-700">🧰 العدة المتاحة ({available.length}) — علّم على الجهاز وملحقاته اللي نازلة معاه:</div>
            {available.length === 0 ? (
              <div className="rounded-xl bg-amber-50 p-4 text-center text-sm font-bold text-amber-700">مفيش عدة متاحة — سجّل المعدات الأول أو استنّى الرجوع</div>
            ) : (
              <div className="space-y-3">
                {KIND_GROUPS.map(g => {
                  const items = available.filter(eq => g.kinds.includes(eq.kind));
                  if (items.length === 0) return null;
                  return (
                    <div key={g.title}>
                      <div className="mb-1 text-xs font-black text-slate-400">{g.title}</div>
                      <div className="grid gap-2 md:grid-cols-3">
                        {items.map(eq => (
                          <button key={eq.id} type="button" onClick={() => toggleDevice(eq.id)}
                            className={`rounded-xl border-2 p-3 text-right text-sm font-black transition ${coForm.ids.includes(eq.id) ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-300'}`}>
                            <div className="flex items-center gap-2">
                              <span>{coForm.ids.includes(eq.id) ? '☑️' : '⬜'}</span>
                              <span>{kindEmoji(eq.kind)} {eq.name}</span>
                            </div>
                            <div className="mt-1 text-[11px] font-bold text-slate-500">{eq.kind} · رقم: {eq.serialNumber}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <input value={coForm.notes} onChange={e => setCoForm(f => ({ ...f, notes: e.target.value }))} placeholder="ملاحظات (الموقع رايح فين؟)" className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 md:col-span-3" />
          <button className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-black text-white hover:bg-blue-700 md:col-span-3">🚪 تسجيل خروج العدة ({coForm.ids.length} جهاز)</button>
        </form>
      </section>

      {/* ===== رجوع عدة ===== */}
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-1 text-xl font-black text-slate-900">↩️ رجوع عدة</h3>
        <p className="mb-4 text-xs font-bold text-slate-500">
          {canManage
            ? 'الجهاز رجع من الشغل؟ اختار من تحت وحدد حالته واستلمه فورًا — وطلبات المساحين المعلقة فوق قسم خاص'
            : 'الجهاز رجع من الشغل؟ علّم عدتك وبلّغ الإدارة — الاستلام الفعلي لما الإدارة توافق ✅'}
        </p>
        {myOpenList.length === 0 ? (
          <div className="rounded-2xl bg-emerald-50 p-4 text-center text-sm font-bold text-emerald-700">مفيش عدة خارجة دلوقتي — كله في المخزن ✅</div>
        ) : (
          <form onSubmit={submitQuickReturn} className="space-y-3">
            {canManage && (
              <label className="block text-sm font-black text-slate-700 md:w-1/2">
                👷 المساح اللي رجع
                <select value={qReturn.surveyorId} onChange={e => pickReturnSurveyor(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm font-bold outline-none focus:border-blue-500">
                  <option value={0}>— اختار المساح —</option>
                  {surveyorsWithOpen.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name} ({openCheckouts.filter(c => c.surveyorId === emp.id).length} جهاز خارجة)</option>
                  ))}
                </select>
              </label>
            )}
            {(canManage ? qReturn.surveyorId : true) && returnList.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <div className="text-xs font-black text-slate-500">{canManage ? 'عدته الخارجة — علّم اللي رجع (متعلّمة كلها افتراضيًا):' : 'العدة اللي معاك/مع مساحك — علّم اللي رجع:'}</div>
                  <button type="button" onClick={() => setQReturn(f => ({ ...f, ids: returnList.map(c => c.id) }))} className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">✅ الكل</button>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {returnList.map(co => {
                    const eq = eqOf(co.equipmentId);
                    const checked = checkedReturnIds.includes(co.id);
                    return (
                      <button key={co.id} type="button" onClick={() => toggleReturnId(co.id)}
                        className={`rounded-xl border-2 p-3 text-right text-sm font-black transition ${checked ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                        <div className="flex items-center gap-2">
                          <span>{checked ? '☑️' : '⬜'}</span>
                          <span>{eq ? `${kindEmoji(eq.kind)} ${eq.name}` : `#${co.equipmentId}`}</span>
                        </div>
                        <div className="mt-1 text-[11px] font-bold text-slate-500">سيريال: {eq?.serialNumber ?? '—'} · نزلت {co.checkoutDate}{co.destination ? ` · 📍 ${co.destination}` : ''}</div>
                      </button>
                    );
                  })}
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="text-sm font-black text-slate-700">
                    🩺 حالة العدة الراجعة
                    <select value={qReturn.condition} onChange={e => setQReturn(f => ({ ...f, condition: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm font-bold outline-none focus:border-blue-500">
                      {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                  <input value={qReturn.notes} onChange={e => setQReturn(f => ({ ...f, notes: e.target.value }))} placeholder="ملاحظات (اختياري)" className="mt-6 rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 md:col-span-2" />
                </div>
                <button className="w-full rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white hover:bg-emerald-700">
                  {canManage ? `↩️ تسجيل رجوع ${checkedReturnIds.length} جهاز مرة واحدة` : `📤 بلّغ برجوع ${checkedReturnIds.length} جهاز — الإدارة تستلم`}
                </button>
              </>
            )}
          </form>
        )}
      </section>

      {/* ===== سجل المعدات ===== */}
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="text-xl font-black text-slate-900">🧰 سجل المعدات ({equipment.length})</h3>
          {canManage && equipment.length > 0 && (
            <button type="button" onClick={exportDevices} className="rounded-xl border-2 border-emerald-500 bg-white px-3 py-1.5 text-xs font-black text-emerald-700 hover:bg-emerald-50">📤 Excel</button>
          )}
        </div>

        {(
          <form onSubmit={submitDevice} className="mb-5 grid gap-3 md:grid-cols-5">
            <select value={eqForm.kind} onChange={e => setEqForm(f => ({ ...f, kind: e.target.value as EquipmentKind }))}
              className="rounded-xl border border-slate-300 px-3 py-3 text-sm font-bold outline-none focus:border-blue-500">
              {KINDS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            <input value={eqForm.name} onChange={e => setEqForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم الجهاز (مثال: توتال نيكون)" className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold outline-none focus:border-blue-500" required />
            <input value={eqForm.serialNumber} onChange={e => setEqForm(f => ({ ...f, serialNumber: e.target.value }))} placeholder="السيريال نمبر" className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold outline-none focus:border-blue-500" required />
            <input value={eqForm.notes} onChange={e => setEqForm(f => ({ ...f, notes: e.target.value }))} placeholder="ملاحظات (اختياري)" className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold outline-none focus:border-blue-500" />
            <button className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white hover:bg-blue-700">{eqForm.id ? '💾 حفظ التعديل' : '➕ إضافة جهاز'}</button>
          </form>
        )}

        {equipment.length === 0 ? (
          <div className="rounded-2xl bg-amber-50 p-6 text-center font-bold text-amber-700">
            مفيش معدات مسجلة. {canManage ? 'ابدأ بتسجيل التووتال والميزان بالسيريال نمبر من الفورم فوق.' : 'المدير لسه مسجلش المعدات.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200 text-xs font-black text-slate-500">
                  <th className="p-3">الجهاز</th>
                  <th className="p-3">النوع</th>
                  <th className="p-3">السيريال نمبر</th>
                  <th className="p-3">الحالة</th>
                  <th className="p-3">مع مين</th>
                  <th className="p-3">ملاحظات</th>
                  <th className="p-3">السجل</th>
                  {canManage && <th className="p-3">إجراءات</th>}
                </tr>
              </thead>
              <tbody>
                {equipment.map(eq => {
                  const openCo = openCheckouts.find(c => c.equipmentId === eq.id);
                  return (
                    <tr key={eq.id} className="border-b border-slate-100 font-bold text-slate-800">
                      <td className="p-3 font-black">{kindEmoji(eq.kind)} {eq.name}</td>
                      <td className="p-3">{eq.kind}</td>
                      <td className="p-3 font-mono">{eq.serialNumber}</td>
                      <td className="p-3">
                        <span className={`rounded-full px-3 py-1 text-[10px] font-black ${STATUS_STYLE[eq.status] || 'bg-slate-100 text-slate-600'}`}>{eq.status}{!eq.active ? ' · موقوف' : ''}</span>
                      </td>
                      <td className="p-3">{openCo ? `${empName(openCo.surveyorId)}${openCo.assistantId ? ` (مساعد: ${empName(openCo.assistantId)})` : ''}` : '—'}</td>
                      <td className="p-3 text-xs text-slate-500">{eq.notes || '—'}</td>
                      <td className="p-3">
                        <button type="button" onClick={() => setViewEq(eq)} className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-black text-slate-700 hover:bg-slate-200" title="سجل الجهاز كامل">📜</button>
                      </td>
                      {canManage && (
                        <td className="p-3">
                          <div className="flex gap-1">
                            {eq.status === 'صيانة' && (
                              <button type="button" onClick={() => fixFromMaintenance(eq)} className="rounded-lg bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700 hover:bg-emerald-200">✅ خلصت</button>
                            )}
                            <button type="button" onClick={() => setEqForm({ id: eq.id, name: eq.name, kind: eq.kind, serialNumber: eq.serialNumber, notes: eq.notes || '' })}
                              className="rounded-lg bg-blue-100 px-3 py-1 text-xs font-black text-blue-700 hover:bg-blue-200">تعديل</button>
                            <button type="button" onClick={() => removeDevice(eq)} disabled={eq.status === 'خارجة'}
                              className="rounded-lg bg-red-100 px-3 py-1 text-xs font-black text-red-700 hover:bg-red-200 disabled:opacity-40">حذف</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ===== سجل الحركة ===== */}
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="text-xl font-black text-slate-900">📜 {coQuery ? `نتائج البحث (${searchedCheckouts.length})` : `آخر حركات العدة (${history.length})`}</h3>
          {canManage && checkouts.length > 0 && (
            <button type="button" onClick={() => exportCheckouts(searchedCheckouts, `حركة_العدة_${today}.csv`)} className="rounded-xl border-2 border-emerald-500 bg-white px-3 py-1.5 text-xs font-black text-emerald-700 hover:bg-emerald-50">📤 Excel</button>
          )}
        </div>
        <div className="mb-4 flex items-center gap-2">
          <input value={coSearch} onChange={e => setCoSearch(e.target.value)} placeholder="🔎 ابحث بالسيريال أو اسم المساح أو المساعد أو الموقع أو الملاحظة أو التاريخ..."
            className="w-full rounded-xl border-2 border-slate-300 px-4 py-2.5 text-sm font-bold outline-none focus:border-slate-900" />
          {coSearch && <button type="button" onClick={() => setCoSearch('')} className="rounded-xl bg-slate-100 px-3 py-2.5 text-sm font-black text-slate-600 hover:bg-slate-200">✕</button>}
        </div>
        {searchedCheckouts.length === 0 ? (
          coQuery ? (
            <div className="rounded-2xl bg-slate-50 p-6 text-center font-bold text-slate-500">مفيش نتيجة لـ "{coSearch}" — جرب سيريال أو اسم أو موقع تاني</div>
          ) : (
            <div className="rounded-2xl bg-slate-50 p-6 text-center font-bold text-slate-500">لسه مفيش حركة رجوع مسجلة</div>
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200 text-xs font-black text-slate-500">
                  <th className="p-3">الجهاز</th>
                  <th className="p-3">المساح</th>
                  <th className="p-3">المساعد</th>
                  <th className="p-3">الوجهة</th>
                  <th className="p-3">نزلت</th>
                  <th className="p-3">رجعت</th>
                  <th className="p-3">الحالة عند الرجوع</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {searchedCheckouts.map(co => {
                  const eq = eqOf(co.equipmentId);
                  return (
                    <tr key={co.id} className="border-b border-slate-100 font-bold text-slate-800">
                      <td className="p-3 font-black">{eq ? `${kindEmoji(eq.kind)} ${eq.name}` : `#${co.equipmentId}`} <span className="font-mono text-xs text-slate-400">{eq?.serialNumber}</span></td>
                      <td className="p-3">{empName(co.surveyorId)}</td>
                      <td className="p-3">{assistantLabel(co)}</td>
                      <td className="p-3 text-blue-700">{co.destination ? `${co.destination}${co.untilDate ? ` (حتى ${co.untilDate})` : ''}` : '—'}</td>
                      <td className="p-3">{co.checkoutDate}</td>
                      <td className="p-3">{co.returnDate || (co.returnReqDate ? <span className="text-amber-700">⏳ بلّغ بالرجوع</span> : <span className="text-red-600">🔴 لسه بره</span>)}</td>
                      <td className="p-3">{!co.returnDate ? '—' : co.conditionReturn === 'يحتاج صيانة' ? '🔧 يحتاج صيانة' : co.conditionReturn === 'به خدوش' ? '⚠️ به خدوش' : '✅ سليم'}</td>
                      <td className="p-3">
                        <button type="button" onClick={() => setPrintGroup(missionGroup(co))} className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-black text-slate-700 hover:bg-slate-200" title="طباعة الورقة">🖨️</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {/* ===== 🔧 سجل الصيانة ===== */}
      {canManage && (
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-1 text-xl font-black text-slate-900">🔧 الصيانة والأعطال</h3>
          <p className="mb-4 text-xs font-bold text-slate-500">سجّل العطل وتكلفته — الجهاز يتحول تلقائي لصيانة، ولما يخلص دوس "✅ خلصت" في جدول المعدات</p>
          <form onSubmit={submitMaintenance} className="mb-5 grid gap-3 md:grid-cols-5">
            <label className="text-sm font-black text-slate-700 md:col-span-2">
              🧰 الجهاز
              <select value={maintForm.equipmentId} onChange={e => setMaintForm(f => ({ ...f, equipmentId: Number(e.target.value) }))}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm font-bold outline-none focus:border-blue-500">
                <option value={0}>— اختار الجهاز —</option>
                {equipment.map(eq => (
                  <option key={eq.id} value={eq.id}>{kindEmoji(eq.kind)} {eq.name} · {eq.serialNumber}{eq.status === 'صيانة' ? ' (في الصيانة)' : ''}</option>
                ))}
              </select>
            </label>
            <input value={maintForm.issue} onChange={e => setMaintForm(f => ({ ...f, issue: e.target.value }))} placeholder="وصف العطل (مثال: محور الميل واقف)" className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold outline-none focus:border-blue-500" required />
            <input type="number" value={maintForm.cost} onChange={e => setMaintForm(f => ({ ...f, cost: e.target.value }))} placeholder="التكلفة (جنيه)" className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold outline-none focus:border-blue-500" />
            <label className="text-xs font-black text-slate-500">
              📅 تاريخ الصيانة
              <input type="date" value={maintForm.maintDate} onChange={e => setMaintForm(f => ({ ...f, maintDate: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-bold outline-none focus:border-blue-500" />
            </label>
            <input value={maintForm.resolution} onChange={e => setMaintForm(f => ({ ...f, resolution: e.target.value }))} placeholder="الإصلاح تم إزاي؟ (اختياري)" className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 md:col-span-4" />
            <button className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white hover:bg-amber-600">🔧 تسجيل عطل</button>
          </form>
          {maintenance.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 p-5 text-center font-bold text-slate-500">مفيش أعطال مسجلة ✅</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-200 text-xs font-black text-slate-500">
                    <th className="p-2">الجهاز</th><th className="p-2">العطل</th><th className="p-2">التكلفة</th><th className="p-2">التاريخ</th><th className="p-2">الإصلاح</th><th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {maintenance.map(m => {
                    const eq = equipment.find(x => x.id === m.equipmentId);
                    return (
                      <tr key={m.id} className="border-b border-slate-100 font-bold text-slate-800">
                        <td className="p-2 font-black">{eq ? `${kindEmoji(eq.kind)} ${eq.name}` : `#${m.equipmentId}`}</td>
                        <td className="p-2">{m.issue}</td>
                        <td className="p-2">{m.cost ? `${m.cost} ج` : '—'}</td>
                        <td className="p-2">{m.maintDate}</td>
                        <td className="p-2 text-xs text-slate-500">{m.resolution || '—'}</td>
                        <td className="p-2">
                          <button type="button" onClick={() => removeMaintenance(m)} className="rounded-lg bg-red-50 px-2 py-1 text-xs font-black text-red-600 hover:bg-red-100">🗑️</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ===== 📊 إحصائيات العدة ===== */}
      {canManage && checkouts.length > 0 && (
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="text-xl font-black text-slate-900">📊 إحصائيات العدة</h3>
            {canManage && (() => {
              const stats = equipment.map(eq => ({ eq, count: checkouts.filter(c => c.equipmentId === eq.id).length })).filter(st => st.count > 0);
              if (stats.length === 0) return null;
              return (
                <button type="button" onClick={() => downloadCsv(`إحصائيات_العدة_${today}.csv`,
                  ['الجهاز', 'النوع', 'السيريال', 'عدد الخروجات', 'إجمالي الأيام بره', 'متوسط المدة (يوم)', 'أعطال', 'تكاليف الصيانة (ج)'],
                  stats.map(st => {
                    const cos = checkouts.filter(c => c.equipmentId === st.eq.id);
                    const done = cos.filter(c => c.returnDate);
                    const totalDays = done.reduce((sum, c) => sum + Math.max(1, Math.round((new Date(c.returnDate!).getTime() - new Date(c.checkoutDate).getTime()) / 86400000)), 0);
                    const maints = maintenance.filter(m => m.equipmentId === st.eq.id);
                    return [st.eq.name, st.eq.kind, st.eq.serialNumber, st.count, totalDays, done.length ? Math.round(totalDays / done.length) : 0, maints.length, maints.reduce((sum, m) => sum + (m.cost || 0), 0)];
                  }))} className="rounded-xl border-2 border-emerald-500 bg-white px-3 py-1.5 text-xs font-black text-emerald-700 hover:bg-emerald-50">📤 Excel</button>
              );
            })()}
          </div>
          {(() => {
            const stats = equipment.map(eq => {
              const cos = checkouts.filter(c => c.equipmentId === eq.id);
              const done = cos.filter(c => c.returnDate);
              const totalDays = done.reduce((sum, c) => sum + Math.max(1, Math.round((new Date(c.returnDate!).getTime() - new Date(c.checkoutDate).getTime()) / 86400000)), 0);
              return { eq, count: cos.length, totalDays, avg: done.length ? Math.round(totalDays / done.length) : 0 };
            }).filter(st => st.count > 0).sort((a, b) => b.count - a.count);
            const totalOut = stats.reduce((s2, st) => s2 + st.count, 0);
            const totalCost = maintenance.reduce((s2, m) => s2 + (m.cost || 0), 0);
            return (
              <>
                <div className="mb-4 grid grid-cols-3 gap-3">
                  <div className="rounded-2xl bg-blue-50 border border-blue-200 p-3 text-center">
                    <div className="text-xl font-black text-blue-700">{totalOut}</div>
                    <div className="text-[10px] font-bold text-blue-600">إجمالي الخروجات</div>
                  </div>
                  <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-center">
                    <div className="text-xl font-black text-amber-700">{maintenance.length}</div>
                    <div className="text-[10px] font-bold text-amber-600">أعطال مسجلة</div>
                  </div>
                  <div className="rounded-2xl bg-red-50 border border-red-200 p-3 text-center">
                    <div className="text-xl font-black text-red-700">{totalCost} ج</div>
                    <div className="text-[10px] font-bold text-red-600">تكاليف الصيانة</div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-sm">
                    <thead>
                      <tr className="border-b-2 border-slate-200 text-xs font-black text-slate-500">
                        <th className="p-2">الجهاز</th><th className="p-2">عدد الخروجات</th><th className="p-2">إجمالي الأيام بره</th><th className="p-2">متوسط المدة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.map(st => (
                        <tr key={st.eq.id} className="border-b border-slate-100 font-bold text-slate-800">
                          <td className="p-2 font-black">{kindEmoji(st.eq.kind)} {st.eq.name} <span className="font-mono text-xs text-slate-400">{st.eq.serialNumber}</span></td>
                          <td className="p-2">{st.count}</td>
                          <td className="p-2">{st.totalDays} يوم</td>
                          <td className="p-2">{st.avg} يوم</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}
        </section>
      )}

      {/* ===== 🧾 جرد العدة ===== */}
      {canManage && (
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-black text-slate-900">🧾 جرد العدة</h3>
              <p className="text-xs font-bold text-slate-500">تأكد إن كل قطعة في مكانها — واطبع تقرير الجرد بالتواقيع</p>
            </div>
            <button type="button" onClick={() => (invMode ? setInvMode(false) : startInventory())} className={`rounded-xl px-4 py-2.5 text-sm font-black text-white ${invMode ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-900 hover:bg-blue-700'}`}>
              {invMode ? 'إلغاء الجرد' : '🧾 ابدأ جرد'}
            </button>
          </div>
          {invMode && (
            <div>
              <div className="mb-3 rounded-xl bg-blue-50 border border-blue-200 px-4 py-2 text-sm font-black text-blue-700">
                اتأكد على {Object.keys(invMarks).length} من {equipment.filter(e => e.active).length} قطعة
                {Object.values(invMarks).filter(v => v === 'missing').length > 0 && ` — ⚠️ ناقص: ${Object.values(invMarks).filter(v => v === 'missing').length}`}
              </div>
              <div className="space-y-2">
                {equipment.filter(e => e.active).map(eq => (
                  <div key={eq.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 p-3 ${invMarks[eq.id] === 'missing' ? 'border-red-300 bg-red-50' : invMarks[eq.id] === 'ok' ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                    <div className="text-sm font-black text-slate-800">
                      {kindEmoji(eq.kind)} {eq.name} <span className="font-mono text-xs text-slate-400">{eq.serialNumber}</span>
                      <div className="mt-0.5 text-[11px] font-bold text-slate-500">المتوقع: {expectedPlace(eq)}</div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setInvMarks(m => ({ ...m, [eq.id]: 'ok' }))} className={`rounded-lg px-3 py-1.5 text-xs font-black ${invMarks[eq.id] === 'ok' ? 'bg-emerald-600 text-white' : 'bg-white border border-emerald-300 text-emerald-700'}`}>✅ موجود</button>
                      <button type="button" onClick={() => setInvMarks(m => ({ ...m, [eq.id]: 'missing' }))} className={`rounded-lg px-3 py-1.5 text-xs font-black ${invMarks[eq.id] === 'missing' ? 'bg-red-600 text-white' : 'bg-white border border-red-300 text-red-700'}`}>❌ ناقص</button>
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => window.print()} className="mt-4 w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700">🖨️ طباعة تقرير الجرد (بعد ما تخلص التأكيد)</button>
              <div className="print-sheet mt-6 hidden print:block rounded-2xl bg-white p-6" dir="rtl">
                <div className="border-b-4 border-double border-slate-900 pb-2 text-center">
                  <div className="text-lg font-black">{deptName}</div>
                  <div className="text-xl font-black">تقرير جرد عدة المساحة — {today}</div>
                </div>
                <table className="mt-3 w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-400 p-1">م</th>
                      <th className="border border-slate-400 p-1">الجهاز</th>
                      <th className="border border-slate-400 p-1">السيريال</th>
                      <th className="border border-slate-400 p-1">المتوقع</th>
                      <th className="border border-slate-400 p-1">النتيجة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {equipment.filter(e => e.active).map((eq, i) => (
                      <tr key={eq.id}>
                        <td className="border border-slate-400 p-1 text-center">{i + 1}</td>
                        <td className="border border-slate-400 p-1 font-bold">{eq.name}</td>
                        <td className="border border-slate-400 p-1 text-center font-mono">{eq.serialNumber}</td>
                        <td className="border border-slate-400 p-1">{expectedPlace(eq)}</td>
                        <td className="border border-slate-400 p-1 text-center font-black">{invMarks[eq.id] === 'missing' ? '❌ ناقص' : invMarks[eq.id] === 'ok' ? '✅ موجود' : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-8 grid grid-cols-2 gap-4 text-center text-xs font-black">
                  <div>أمين العدة<br /><br />..............................</div>
                  <div>مدير القسم<br /><br />..............................</div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ===== 🔍 سجل حياة الجهاز ===== */}
      {viewEq && (
        <div className="fixed inset-0 z-[400] overflow-y-auto bg-slate-950/70 p-4" onClick={() => setViewEq(null)}>
          <div className="mx-auto max-w-3xl rounded-[2rem] bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3 border-b-2 border-slate-100 pb-3">
              <div>
                <div className="text-2xl font-black text-slate-900">{kindEmoji(viewEq.kind)} {viewEq.name}</div>
                <div className="mt-1 flex flex-wrap gap-2 text-xs font-bold">
                  <span className="rounded-full bg-slate-100 px-3 py-1">سيريال: {viewEq.serialNumber}</span>
                  <span className={`rounded-full px-3 py-1 ${STATUS_STYLE[viewEq.status]}`}>{viewEq.status}</span>
                  {viewEq.custodyEmployeeId && <span className="rounded-full bg-blue-100 px-3 py-1 text-blue-700">📦 عهدة: {empName(viewEq.custodyEmployeeId)}{viewEq.custodySince ? ` من ${viewEq.custodySince}` : ''}</span>}
                  {viewEq.custodyNotes && <span className="rounded-full bg-slate-100 px-3 py-1">{viewEq.custodyNotes}</span>}
                </div>
              </div>
              <button type="button" onClick={() => setViewEq(null)} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-600 hover:bg-slate-200">إغلاق ✕</button>
            </div>

            {(() => {
              const mine = checkouts.filter(c => c.equipmentId === viewEq.id).slice().reverse();
              const done = mine.filter(c => c.returnDate);
              const dd = (a: string, b: string) => Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000));
              const totalDays = done.reduce((s2, c) => s2 + dd(c.checkoutDate, c.returnDate as string), 0);
              const maints = maintenance.filter(m => m.equipmentId === viewEq.id);
              const cost = maints.reduce((s2, m) => s2 + (m.cost || 0), 0);
              const cur = mine.find(c => !c.returnDate);
              return (
                <>
                  {cur && (
                    <div className="mb-4 rounded-2xl border-2 border-amber-300 bg-amber-50 p-3 text-sm font-black text-amber-800">
                      📤 دلوقتي مع: {empName(cur.surveyorId)}{assistantLabel(cur) ? ` + ${assistantLabel(cur)}` : ''}{cur.destination ? ` — 📍 ${cur.destination}` : ''} — من {cur.checkoutDate}{cur.untilDate ? ` ← حتى ${cur.untilDate}` : ''} ({daysSince(cur.checkoutDate)} يوم){cur.untilDate && today > cur.untilDate ? ' ⏰ عدّى موعد الرجوع!' : ''}
                    </div>
                  )}
                  <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <div className="rounded-2xl bg-blue-50 p-3 text-center"><div className="text-xl font-black text-blue-700">{mine.length}</div><div className="text-[11px] font-black text-blue-600">📤 خروجات</div></div>
                    <div className="rounded-2xl bg-indigo-50 p-3 text-center"><div className="text-xl font-black text-indigo-700">{totalDays}</div><div className="text-[11px] font-black text-indigo-600">📅 أيام بره</div></div>
                    <div className="rounded-2xl bg-violet-50 p-3 text-center"><div className="text-xl font-black text-violet-700">{done.length ? Math.round(totalDays / done.length) : 0}</div><div className="text-[11px] font-black text-violet-600">⏱️ متوسط المدة</div></div>
                    <div className="rounded-2xl bg-amber-50 p-3 text-center"><div className="text-xl font-black text-amber-700">{maints.length}</div><div className="text-[11px] font-black text-amber-600">🔧 أعطال</div></div>
                    <div className="rounded-2xl bg-rose-50 p-3 text-center"><div className="text-xl font-black text-rose-700">{cost ? `${cost} ج` : 0}</div><div className="text-[11px] font-black text-rose-600">💸 تكلفة صيانة</div></div>
                  </div>
                </>
              );
            })()}

            <h4 className="mb-2 text-lg font-black text-slate-800">📜 الخروجات ({checkouts.filter(c => c.equipmentId === viewEq.id).length}) — الأحدث الأول</h4>
            <div className="max-h-56 overflow-y-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b-2 border-slate-200 font-black text-slate-500">
                    <th className="p-2">نزلت</th><th className="p-2">المساح</th><th className="p-2">المساعد</th><th className="p-2">الوجهة</th><th className="p-2">رجعت</th><th className="p-2">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {checkouts.filter(c => c.equipmentId === viewEq.id).slice().reverse().map(co => (
                    <tr key={co.id} className="border-b border-slate-100 font-bold text-slate-700">
                      <td className="p-2">{co.checkoutDate}</td>
                      <td className="p-2">{empName(co.surveyorId)}</td>
                      <td className="p-2">{assistantLabel(co)}</td>
                      <td className="p-2">{co.destination ? `${co.destination}${co.untilDate ? ` (حتى ${co.untilDate})` : ''}` : '—'}</td>
                      <td className="p-2">{co.returnDate || <span className="text-red-600">لسه خارجة</span>}</td>
                      <td className="p-2">{co.conditionReturn || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h4 className="mb-2 mt-4 text-lg font-black text-slate-800">🔧 الصيانة ({maintenance.filter(m => m.equipmentId === viewEq.id).length})</h4>
            <div className="max-h-40 overflow-y-auto">
              {maintenance.filter(m => m.equipmentId === viewEq.id).length === 0 ? (
                <div className="rounded-xl bg-slate-50 p-3 text-center text-sm font-bold text-slate-500">مفيش أعطال مسجلة للجهاز ده ✅</div>
              ) : (
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="border-b-2 border-slate-200 font-black text-slate-500">
                      <th className="p-2">التاريخ</th><th className="p-2">العطل</th><th className="p-2">التكلفة</th><th className="p-2">الإصلاح</th>
                    </tr>
                  </thead>
                  <tbody>
                    {maintenance.filter(m => m.equipmentId === viewEq.id).map(m => (
                      <tr key={m.id} className="border-b border-slate-100 font-bold text-slate-700">
                        <td className="p-2">{m.maintDate}</td>
                        <td className="p-2">{m.issue}</td>
                        <td className="p-2">{m.cost ? `${m.cost} ج` : '—'}</td>
                        <td className="p-2">{m.resolution || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== 🖨️ ورقة الطباعة ===== */}
      {printGroup && printGroup.length > 0 && (
        <div className="fixed inset-0 z-[400] overflow-y-auto bg-slate-950/70 p-4" onClick={() => setPrintGroup(null)}>
          <div className="mx-auto max-w-2xl" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex gap-2 print:hidden">
              <button type="button" onClick={() => window.print()} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700">🖨️ طباعة / حفظ PDF</button>
              <button type="button" onClick={() => setPrintGroup(null)} className="rounded-xl bg-white px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-100">إغلاق</button>
            </div>
            <div className="print-sheet rounded-2xl bg-white p-8 text-slate-900 shadow-2xl" dir="rtl">
              <div className="border-b-4 border-double border-slate-900 pb-3 text-center">
                <div className="text-lg font-black">{deptName}</div>
                <div className="mt-1 text-2xl font-black">استلام عدة مساحة</div>
              </div>
              <div className="mt-4 space-y-2 text-base font-bold">
                <div className="flex justify-between border-b border-dashed border-slate-300 pb-1">
                  <span>التاريخ: {printGroup[0].checkoutDate}</span>
                  <span>م رقم: {printGroup[0].id}</span>
                </div>
                <div>👷 المساح: <b className="text-lg">{empName(printGroup[0].surveyorId)}</b></div>
                <div>🤝 المساعد: <b>{assistantLabel(printGroup[0])}</b></div>
                {printGroup[0].untilDate && <div>📅 الفترة: من <b>{printGroup[0].checkoutDate}</b> حتى <b>{printGroup[0].untilDate}</b></div>}
                {printGroup[0].returnDate && <div>↩️ تاريخ رجوع العدة: <b>{printGroup[0].returnDate}</b></div>}
                {printGroup[0].notes && <div>📝 ملاحظات: {printGroup[0].notes}</div>}
              </div>
              <table className="mt-4 w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-400 p-2">م</th>
                    <th className="border border-slate-400 p-2">النوع</th>
                    <th className="border border-slate-400 p-2">الجهاز / الملحق</th>
                    <th className="border border-slate-400 p-2">الرقم التسلسلي</th>
                    {printGroup[0].returnDate && <th className="border border-slate-400 p-2">الحالة عند الرجوع</th>}
                  </tr>
                </thead>
                <tbody>
                  {printGroup.map((co, i) => {
                    const eq = eqOf(co.equipmentId);
                    return (
                      <tr key={co.id}>
                        <td className="border border-slate-400 p-2 text-center font-black">{i + 1}</td>
                        <td className="border border-slate-400 p-2 font-bold">{eq?.kind ?? '—'}</td>
                        <td className="border border-slate-400 p-2 font-black">{eq ? `${kindEmoji(eq.kind)} ${eq.name}` : `#${co.equipmentId}`}</td>
                        <td className="border border-slate-400 p-2 text-center font-mono font-bold">{eq?.serialNumber ?? '—'}</td>
                        {printGroup[0].returnDate && <td className="border border-slate-400 p-2 text-center font-bold">{co.conditionReturn || '—'}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="mt-10 grid grid-cols-3 gap-4 text-center text-sm font-black">
                <div>توقيع المساح<br /><br />..............................</div>
                <div>أمين العدة<br /><br />..............................</div>
                <div>مدير القسم<br /><br />..............................</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
