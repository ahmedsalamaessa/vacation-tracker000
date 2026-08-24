import { useEffect, useState } from 'react';
import {
  getEquipment, getEquipmentCheckouts, getEmployees, getLocations, getSettings,
  addEquipment, updateEquipment, deleteEquipment,
  checkoutEquipment, returnEquipmentCheckout, refreshEquipment,
} from '../lib/db';
import type { Employee, Equipment, EquipmentCheckout, EquipmentKind, WorkLocation } from '../lib/types';

const KINDS: EquipmentKind[] = [
  'تواتال ستايشن', 'ميزان',
  'قامة 5م', 'قامة 7م', 'حامل ميزان ألومنيوم',
  'حامل توتال ألومنيوم', 'حامل توتال خشب', 'بريزم', 'ميني بريزم',
  'أخرى',
];

// 🗂️ مجموعات الاختيار: الجهاز الرئيسي + ملحقاته جنب بعض
const KIND_GROUPS: { title: string; kinds: string[] }[] = [
  { title: 'الأجهزة الرئيسية', kinds: ['تواتال ستايشن', 'ميزان'] },
  { title: 'ملحقات الميزان', kinds: ['قامة 5م', 'قامة 7م', 'حامل ميزان ألومنيوم'] },
  { title: 'ملحقات التوتال', kinds: ['حامل توتال ألومنيوم', 'حامل توتال خشب', 'بريزم', 'ميني بريزم'] },
  { title: 'أخرى', kinds: ['أخرى'] },
];

function kindEmoji(kind: string): string {
  switch (kind) {
    case 'تواتال ستايشن': return '🔭';
    case 'ميزان': return '📏';
    case 'قامة 5م': case 'قامة 7م': return '📐';
    case 'حامل ميزان ألومنيوم': case 'حامل توتال ألومنيوم': case 'حامل توتال خشب': return '🛠️';
    case 'بريزم': return '💎';
    case 'ميني بريزم': return '🔹';
    default: return '📦';
  }
}

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
  const [eqForm, setEqForm] = useState({ id: 0, name: '', kind: 'تواتال ستايشن' as EquipmentKind, serialNumber: '', notes: '' });
  // فورم خروج عدة
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
  // 🖨️ طباعة المأمورية
  const [printGroup, setPrintGroup] = useState<EquipmentCheckout[] | null>(null);
  // الرجوع (نموذج داخلي)
  const [returningId, setReturningId] = useState<number | null>(null);
  const [returnForm, setReturnForm] = useState({ condition: CONDITIONS[0], notes: '' });

  function reload() {
    setEquipmentState(getEquipment());
    setCheckoutsState(getEquipmentCheckouts());
    setEmployeesState(getEmployees());
    setLocationsState(getLocations());
    setDeptName(getSettings().department_name || 'قسم المساحة');
  }

  useEffect(() => {
    reload();
    refreshEquipment();
    const t1 = setTimeout(reload, 1200);
    const t2 = setTimeout(reload, 3500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(''), 4000);
  }

  function empName(id: number | null | undefined): string {
    if (!id) return '—';
    return employees.find(e => e.id === id)?.name || `موظف #${id}`;
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
      setEqForm({ id: 0, name: '', kind: 'تواتال ستايشن', serialNumber: '', notes: '' });
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
      const surveyorId = canManage ? coForm.surveyorId : user.id;
      if (!surveyorId) { flash('⚠️ اختار المساح'); return; }
      if (coForm.ids.length === 0) { flash('⚠️ اختار جهاز واحد على الأقل'); return; }
      const destination = destSite === '__other__' ? destOther.trim() : (destSite || '');
      if (destSite === '__other__' && !destination) { flash('⚠️ اكتب اسم موقع المأمورية'); return; }
      const r = checkoutEquipment({
        equipmentIds: coForm.ids,
        surveyorId,
        assistantId: coForm.assistantId || null,
        checkoutDate: coForm.checkoutDate,
        destination: destination || null,
        notes: coForm.notes || undefined,
        createdBy: user.id,
      });
      flash(`✅ تم تسجيل خروج ${r.created} جهاز${destination ? ` لمأمورية: ${destination}` : ''}${r.blocked.length ? ' — (واتشالت: ' + r.blocked.join('، ') + ')' : ''}`);
      setCoForm({ surveyorId: canManage ? 0 : user.id, assistantId: 0, checkoutDate: today, notes: '', ids: [] });
      setDestSite(''); setDestOther('');
      reload();
    } catch (err: any) {
      flash('⛔ ' + (err?.message || 'حصل خطأ'));
    }
  }

  function toggleDevice(id: number) {
    setCoForm(f => ({ ...f, ids: f.ids.includes(id) ? f.ids.filter(x => x !== id) : [...f.ids, id] }));
  }

  function submitReturn(co: EquipmentCheckout) {
    try {
      const condition = returnForm.condition.replace(/ [✅⚠️🔧]$/, '').trim();
      returnEquipmentCheckout(co.id, condition, returnForm.notes || undefined);
      flash('↩️ تم تسجيل رجوع العدة — الجهاز بقي ' + (condition === 'يحتاج صيانة' ? 'في الصيانة 🔧' : 'متاح ✅'));
      setReturningId(null);
      setReturnForm({ condition: CONDITIONS[0], notes: '' });
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

  const available = equipment.filter(e => e.active && e.status === 'متاحة');
  const openCheckouts = checkouts.filter(c => !c.returnDate);
  const history = checkouts.filter(c => c.returnDate).slice(0, 40);

  return (
    <div className="w-full space-y-6">
      {msg && <div className="sticky top-2 z-20 rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-black text-white shadow-lg">{msg}</div>}

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

      {/* ===== العدة الخارجة دلوقتي ===== */}
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-xl font-black text-slate-900">🔴 العدة الخارجة دلوقتي ({openCheckouts.length})</h3>
        {openCheckouts.length === 0 ? (
          <div className="rounded-2xl bg-emerald-50 p-6 text-center font-bold text-emerald-700">كل العدة في المخزن ✅</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {openCheckouts.map(co => {
              const eq = eqOf(co.equipmentId);
              const mine = co.surveyorId === user.id;
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
                    <div>🤝 المساعد: {empName(co.assistantId)}</div>
                    {co.destination && <div className="text-blue-700">📍 مأمورية: {co.destination}</div>}
                    <div className="text-xs text-slate-500">📅 نزلت: {co.checkoutDate}{co.notes ? ` · 📝 ${co.notes}` : ''}</div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => setPrintGroup(missionGroup(co))} className="flex-1 rounded-xl border-2 border-slate-900 bg-white px-3 py-2 text-sm font-black text-slate-900 hover:bg-slate-100">🖨️ مأمورية</button>
                    {(canManage || mine) && (
                      <button type="button" onClick={() => setReturningId(co.id)} className="flex-1 rounded-xl bg-slate-900 px-3 py-2 text-sm font-black text-white hover:bg-emerald-700">↩️ رجوع</button>
                    )}
                  </div>
                  {(canManage || mine) && returningId === co.id && (
                      <div className="mt-3 space-y-2 rounded-xl bg-white p-3">
                        <div className="text-xs font-black text-slate-700">حالة الجهاز عند الرجوع:</div>
                        <div className="flex flex-wrap gap-2">
                          {CONDITIONS.map(c => (
                            <button key={c} type="button" onClick={() => setReturnForm(f => ({ ...f, condition: c }))}
                              className={`rounded-lg px-3 py-1 text-xs font-black ${returnForm.condition === c ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>{c}</button>
                          ))}
                        </div>
                        <input value={returnForm.notes} onChange={e => setReturnForm(f => ({ ...f, notes: e.target.value }))} placeholder="ملاحظات (اختياري)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold outline-none focus:border-blue-500" />
                        <div className="flex gap-2">
                          <button type="button" onClick={() => submitReturn(co)} className="flex-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700">تأكيد الرجوع ↩️</button>
                          <button type="button" onClick={() => setReturningId(null)} className="rounded-xl bg-slate-200 px-4 py-2 text-sm font-black text-slate-600">إلغاء</button>
                        </div>
                      </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ===== خروج عدة ===== */}
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-xl font-black text-slate-900">➕ خروج عدة جديد</h3>
        <form onSubmit={submitCheckout} className="grid gap-3 md:grid-cols-3">
          <label className="text-sm font-black text-slate-700">
            👷 المساح
            <select value={coForm.surveyorId} onChange={e => setCoForm(f => ({ ...f, surveyorId: Number(e.target.value) }))}
              disabled={!canManage}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm font-bold outline-none focus:border-blue-500 disabled:bg-slate-100">
              {canManage && <option value={0}>— اختار المساح —</option>}
              {employees.filter(e => e.active).map(e => (
                <option key={e.id} value={e.id}>{e.name}{e.jobTitle ? ` (${e.jobTitle})` : ''}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-black text-slate-700">
            🤝 المساعد
            <select value={coForm.assistantId} onChange={e => setCoForm(f => ({ ...f, assistantId: Number(e.target.value) }))}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm font-bold outline-none focus:border-blue-500">
              <option value={0}>— بدون مساعد —</option>
              {employees.filter(e => e.active && e.id !== coForm.surveyorId).map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-black text-slate-700">
            📅 تاريخ النزول
            <input type="date" value={coForm.checkoutDate} onChange={e => setCoForm(f => ({ ...f, checkoutDate: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm font-bold outline-none focus:border-blue-500" />
          </label>
          <label className="text-sm font-black text-slate-700 md:col-span-2">
            📍 وجهة المأمورية
            <select value={destSite} onChange={e => setDestSite(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm font-bold outline-none focus:border-blue-500">
              <option value="">— من غير مأمورية / المخزن —</option>
              {locations.filter(l => l.active).map(l => (
                <option key={l.id} value={l.name}>{l.name}</option>
              ))}
              <option value="__other__">➕ موقع آخر (اكتب الاسم)...</option>
            </select>
          </label>
          {destSite === '__other__' && (
            <input value={destOther} onChange={e => setDestOther(e.target.value)} placeholder="اسم موقع المأمورية (مثال: مأمورية العاصمة الإدارية)"
              className="rounded-xl border-2 border-blue-400 px-4 py-3 text-sm font-bold outline-none focus:border-blue-600" />
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

      {/* ===== سجل المعدات ===== */}
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-xl font-black text-slate-900">🧰 سجل المعدات ({equipment.length})</h3>

        {canManage && (
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
                  {canManage && <th className="p-3">إجراءات</th>}
                </tr>
              </thead>
              <tbody>
                {equipment.map(eq => {
                  const openCo = openCheckouts.find(c => c.equipmentId === eq.id);
                  return (
                    <tr key={eq.id} className="border-b border-slate-100 font-bold text-slate-800">
                      <td className="p-3 font-black">{eq.kind === 'تواتال ستايشن' ? '🔭' : eq.kind === 'ميزان' ? '📏' : '🔧'} {eq.name}</td>
                      <td className="p-3">{eq.kind}</td>
                      <td className="p-3 font-mono">{eq.serialNumber}</td>
                      <td className="p-3">
                        <span className={`rounded-full px-3 py-1 text-[10px] font-black ${STATUS_STYLE[eq.status] || 'bg-slate-100 text-slate-600'}`}>{eq.status}{!eq.active ? ' · موقوف' : ''}</span>
                      </td>
                      <td className="p-3">{openCo ? `${empName(openCo.surveyorId)}${openCo.assistantId ? ` (مساعد: ${empName(openCo.assistantId)})` : ''}` : '—'}</td>
                      <td className="p-3 text-xs text-slate-500">{eq.notes || '—'}</td>
                      {canManage && (
                        <td className="p-3">
                          <div className="flex gap-1">
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
        <h3 className="mb-4 text-xl font-black text-slate-900">📜 آخر حركات العدة ({history.length})</h3>
        {history.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 p-6 text-center font-bold text-slate-500">لسه مفيش حركة رجوع مسجلة</div>
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
                {history.map(co => {
                  const eq = eqOf(co.equipmentId);
                  return (
                    <tr key={co.id} className="border-b border-slate-100 font-bold text-slate-800">
                      <td className="p-3 font-black">{eq ? `${kindEmoji(eq.kind)} ${eq.name}` : `#${co.equipmentId}`} <span className="font-mono text-xs text-slate-400">{eq?.serialNumber}</span></td>
                      <td className="p-3">{empName(co.surveyorId)}</td>
                      <td className="p-3">{empName(co.assistantId)}</td>
                      <td className="p-3 text-blue-700">{co.destination || '—'}</td>
                      <td className="p-3">{co.checkoutDate}</td>
                      <td className="p-3">{co.returnDate}</td>
                      <td className="p-3">{co.conditionReturn === 'يحتاج صيانة' ? '🔧 يحتاج صيانة' : co.conditionReturn === 'به خدوش' ? '⚠️ به خدوش' : '✅ سليم'}</td>
                      <td className="p-3">
                        <button type="button" onClick={() => setPrintGroup(missionGroup(co))} className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-black text-slate-700 hover:bg-slate-200" title="طباعة مأمورية">🖨️</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {/* ===== 🖨️ ورقة المأمورية ===== */}
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
                <div className="mt-1 text-2xl font-black">مأمورية عمل — استلام عدة مساحة</div>
              </div>
              <div className="mt-4 space-y-2 text-base font-bold">
                <div className="flex justify-between border-b border-dashed border-slate-300 pb-1">
                  <span>التاريخ: {printGroup[0].checkoutDate}</span>
                  <span>م رقم: {printGroup[0].id}</span>
                </div>
                <div>👷 المساح: <b className="text-lg">{empName(printGroup[0].surveyorId)}</b></div>
                <div>🤝 المساعد: <b>{empName(printGroup[0].assistantId)}</b></div>
                <div>📍 وجهة المأمورية: <b>{printGroup[0].destination || '—'}</b></div>
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
