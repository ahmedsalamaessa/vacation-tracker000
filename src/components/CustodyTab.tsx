import { useEffect, useState } from 'react';
import {
  getEquipment, getEmployees, updateEquipment, refreshEquipment,
} from '../lib/db';
import type { Employee, Equipment } from '../lib/types';
import { kindEmoji } from './equipmentKinds';

function daysSince(dateStr?: string | null): number {
  if (!dateStr) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000));
}
function isHalak(notes?: string | null): boolean {
  return Boolean(notes && notes.includes('هالك'));
}

export default function CustodyTab({ user }: { user: Employee }) {
  const canManage = user.role === 'admin' || user.role === 'manager' || Boolean((user as any).canEditAttendance);
  const today = new Date().toISOString().slice(0, 10);

  const [equipment, setEquipmentState] = useState<Equipment[]>([]);
  const [employees, setEmployeesState] = useState<Employee[]>([]);
  const [msg, setMsg] = useState('');

  // فورم تسليم عهدة
  const [form, setForm] = useState({ equipmentId: 0, employeeId: 0, since: today, notes: '' });
  // 🖨️ طباعة كشف عهدة لمساح
  const [printEmp, setPrintEmp] = useState<Employee | null>(null);

  function reload() {
    setEquipmentState(getEquipment());
    setEmployeesState(getEmployees());
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

  function empName(id?: number | null): string {
    if (!id) return '—';
    return employees.find(e => e.id === id)?.name || `موظف #${id}`;
  }

  // ============ تسليم / فك عهدة ============
  function submitCustody(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (!form.equipmentId) { flash('⚠️ اختار الجهاز'); return; }
      if (!form.employeeId) { flash('⚠️ اختار المساح'); return; }
      updateEquipment(form.equipmentId, {
        custodyEmployeeId: form.employeeId,
        custodySince: form.since,
        custodyNotes: form.notes || null,
      });
      flash(`✅ اتسلّم ${kindEmoji(getEquipment().find(x => x.id === form.equipmentId)?.kind || '')} ${getEquipment().find(x => x.id === form.equipmentId)?.name} في عهدة ${empName(form.employeeId)}`);
      setForm({ equipmentId: 0, employeeId: 0, since: today, notes: '' });
      reload();
    } catch (err: any) {
      flash('⛔ ' + (err?.message || 'حصل خطأ'));
    }
  }

  function releaseCustody(eq: Equipment) {
    if (!window.confirm(`فك عهدة ${eq.name} (${eq.serialNumber}) من ${empName(eq.custodyEmployeeId)}؟`)) return;
    updateEquipment(eq.id, { custodyEmployeeId: null, custodySince: null, custodyNotes: null });
    flash('🔓 اتفكت العهدة — الجهاز رجع للمخزن');
    reload();
  }

  // الموظف العادي يشوف عهدته هو بس
  const custodied = equipment.filter(e => e.custodyEmployeeId && (canManage || e.custodyEmployeeId === user.id));
  const unassigned = equipment.filter(e => !e.custodyEmployeeId);
  const myHalakCount = custodied.filter(e => isHalak(e.custodyNotes)).length;

  const byEmployee = employees
    .map(emp => ({ emp, items: custodied.filter(e => e.custodyEmployeeId === emp.id) }))
    .filter(g => g.items.length > 0);

  return (
    <div className="w-full space-y-6">
      {msg && <div className="sticky top-2 z-20 rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-black text-white shadow-lg">{msg}</div>}

      {/* ===== عدادات ===== */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-center">
          <div className="text-2xl font-black text-blue-700">{byEmployee.length}</div>
          <div className="text-xs font-bold text-blue-600">مساح عنده عهدة 👥</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
          <div className="text-2xl font-black text-slate-700">{custodied.length}</div>
          <div className="text-xs font-bold text-slate-600">قطعة في العهدة 🧰</div>
        </div>
        <div className={`rounded-2xl border p-4 text-center ${myHalakCount > 0 ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}`}>
          <div className={`text-2xl font-black ${myHalakCount > 0 ? 'text-red-700' : 'text-emerald-700'}`}>{myHalakCount}</div>
          <div className={`text-xs font-bold ${myHalakCount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{myHalakCount > 0 ? 'هالك ☠️' : 'مفيش هالك ✅'}</div>
        </div>
      </div>

      {/* ===== تسليم عهدة (إداري) ===== */}
      {canManage && (
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-1 text-xl font-black text-slate-900">📦 تسليم عهدة جديدة</h3>
          <p className="mb-4 text-xs font-bold text-slate-500">سجّل إن الجهاز بقى في عهدة مساح بشكل دايم (غير المأموريات المؤقتة)</p>
          <form onSubmit={submitCustody} className="grid gap-3 md:grid-cols-5">
            <label className="text-sm font-black text-slate-700 md:col-span-2">
              🧰 الجهاز
              <select value={form.equipmentId} onChange={e => setForm(f => ({ ...f, equipmentId: Number(e.target.value) }))}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm font-bold outline-none focus:border-blue-500">
                <option value={0}>— اختار الجهاز —</option>
                {equipment.filter(e => e.active).map(eq => (
                  <option key={eq.id} value={eq.id}>{kindEmoji(eq.kind)} {eq.name} · {eq.serialNumber}{eq.custodyEmployeeId ? ` (مع ${empName(eq.custodyEmployeeId)})` : ''}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-black text-slate-700">
              👷 المساح
              <select value={form.employeeId} onChange={e => setForm(f => ({ ...f, employeeId: Number(e.target.value) }))}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm font-bold outline-none focus:border-blue-500">
                <option value={0}>— اختار —</option>
                {employees.filter(e => e.active).map(e => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-black text-slate-700">
              📅 من تاريخ
              <input type="date" value={form.since} onChange={e => setForm(f => ({ ...f, since: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-sm font-bold outline-none focus:border-blue-500" />
            </label>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="ملاحظات (اكتب: هالك لو تالف)"
              className="mt-6 rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold outline-none focus:border-blue-500" />
            <button className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white hover:bg-blue-700 md:col-span-5">📦 تسليم العهدة</button>
          </form>
        </section>
      )}

      {/* ===== عهدة كل مساح ===== */}
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-xl font-black text-slate-900">👥 عهدة المساحين</h3>
        {byEmployee.length === 0 ? (
          <div className="rounded-2xl bg-amber-50 p-6 text-center font-bold text-amber-700">
            {equipment.length === 0
              ? 'لسه مفيش معدات مسجلة — سجّل الأجهزة من تبويب "استلام وتسليم العدة" الأول'
              : 'لسه مفيش عهدة مسجلة — استخدم فورم "تسليم عهدة" فوق'}
          </div>
        ) : (
          <div className="space-y-4">
            {byEmployee.map(({ emp, items }) => {
              const halak = items.filter(e => isHalak(e.custodyNotes)).length;
              return (
                <div key={emp.id} className={`rounded-2xl border-2 p-4 ${halak > 0 ? 'border-red-200 bg-red-50/40' : 'border-slate-200 bg-slate-50'}`}>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-black text-slate-900">👷 {emp.name}</span>
                      <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black text-slate-600 border border-slate-200">{items.length} قطعة</span>
                      {halak > 0 && <span className="rounded-full bg-red-600 px-3 py-1 text-[10px] font-black text-white">☠️ {halak} هالك</span>}
                    </div>
                    {canManage && (
                      <button type="button" onClick={() => setPrintEmp(emp)} className="rounded-xl border-2 border-slate-900 bg-white px-3 py-1.5 text-xs font-black text-slate-900 hover:bg-slate-100">🖨️ كشف عهدة</button>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-sm">
                      <thead>
                        <tr className="border-b-2 border-slate-200 text-[11px] font-black text-slate-500">
                          <th className="p-2">الجهاز</th>
                          <th className="p-2">النوع</th>
                          <th className="p-2">السيريال</th>
                          <th className="p-2">في عهدته من</th>
                          <th className="p-2">المدة</th>
                          <th className="p-2">الحالة</th>
                          {canManage && <th className="p-2"></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map(eq => (
                          <tr key={eq.id} className="border-b border-slate-100 font-bold text-slate-800">
                            <td className="p-2 font-black">{kindEmoji(eq.kind)} {eq.name}</td>
                            <td className="p-2">{eq.kind}</td>
                            <td className="p-2 font-mono">{eq.serialNumber}</td>
                            <td className="p-2">{eq.custodySince || '—'}</td>
                            <td className="p-2">{daysSince(eq.custodySince)} يوم</td>
                            <td className="p-2">
                              {isHalak(eq.custodyNotes)
                                ? <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black text-white">☠️ هالك</span>
                                : eq.custodyNotes
                                  ? <span className="text-xs text-slate-500">{eq.custodyNotes}</span>
                                  : <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">سليم</span>}
                            </td>
                            {canManage && (
                              <td className="p-2">
                                <button type="button" onClick={() => releaseCustody(eq)} className="rounded-lg bg-slate-200 px-3 py-1 text-xs font-black text-slate-700 hover:bg-slate-300">🔓 فك</button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ===== من غير عهدة (إداري) ===== */}
      {canManage && unassigned.length > 0 && (
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-xl font-black text-slate-900">🏬 عدة من غير عهدة ({unassigned.length})</h3>
          <div className="flex flex-wrap gap-2">
            {unassigned.map(eq => (
              <span key={eq.id} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-black text-slate-600">
                {kindEmoji(eq.kind)} {eq.name} · {eq.serialNumber}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* ===== 🖨️ كشف العهدة الورقي ===== */}
      {printEmp && (
        <div className="fixed inset-0 z-[400] overflow-y-auto bg-slate-950/70 p-4" onClick={() => setPrintEmp(null)}>
          <div className="mx-auto max-w-2xl" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex gap-2 print:hidden">
              <button type="button" onClick={() => window.print()} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700">🖨️ طباعة / حفظ PDF</button>
              <button type="button" onClick={() => setPrintEmp(null)} className="rounded-xl bg-white px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-100">إغلاق</button>
            </div>
            <div className="print-sheet rounded-2xl bg-white p-8 text-slate-900 shadow-2xl" dir="rtl">
              <div className="border-b-4 border-double border-slate-900 pb-3 text-center">
                <div className="text-lg font-black">قسم المساحة</div>
                <div className="mt-1 text-2xl font-black">كشف عهدة عدة مساحة</div>
              </div>
              <div className="mt-4 space-y-2 text-base font-bold">
                <div className="flex justify-between border-b border-dashed border-slate-300 pb-1">
                  <span>الاسم: {printEmp.name}</span>
                  <span>التاريخ: {today}</span>
                </div>
              </div>
              <table className="mt-4 w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-400 p-2">م</th>
                    <th className="border border-slate-400 p-2">النوع</th>
                    <th className="border border-slate-400 p-2">الجهاز / الملحق</th>
                    <th className="border border-slate-400 p-2">الرقم التسلسلي</th>
                    <th className="border border-slate-400 p-2">في العهدة من</th>
                    <th className="border border-slate-400 p-2">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {(custodied.filter(e => e.custodyEmployeeId === printEmp.id)).map((eq, i) => (
                    <tr key={eq.id}>
                      <td className="border border-slate-400 p-2 text-center font-black">{i + 1}</td>
                      <td className="border border-slate-400 p-2 font-bold">{eq.kind}</td>
                      <td className="border border-slate-400 p-2 font-black">{eq.name}</td>
                      <td className="border border-slate-400 p-2 text-center font-mono font-bold">{eq.serialNumber}</td>
                      <td className="border border-slate-400 p-2 text-center font-bold">{eq.custodySince || '—'}</td>
                      <td className="border border-slate-400 p-2 text-center font-bold">{isHalak(eq.custodyNotes) ? '☠️ هالك' : eq.custodyNotes || 'سليم'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 text-xs font-bold text-slate-600">
                أقر أنا الموقير أدناه باستلام العدة المبينة أعلاه جميعها كاملة وبالحالة المذكورة، وأتعهد بردّها عند الطلب وبنفس الحالة.
              </div>
              <div className="mt-10 grid grid-cols-2 gap-4 text-center text-sm font-black">
                <div>توقيع صاحب العهدة<br /><br />..............................</div>
                <div>أمين العدة<br /><br />..............................</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
