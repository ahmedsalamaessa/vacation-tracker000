import { useEffect, useState } from 'react';
import type { Employee, Machinery } from '../lib/types';
import {
  getMachinery,
  getMachineryHours,
  addMachinery,
  updateMachinery,
  deactivateMachinery,
  saveMachineryHours,
  refreshMachinery,
} from '../lib/db';
import { downloadCsv } from '../lib/exportCsv';

const KINDS = ['لودر', 'عربية قلاب', 'حفار', 'أخرى'];

/** المعدات العشرة بتاعتك — من رسالتك — زرار واحد يضيفهم */
const SEED: { kind: string; owner: string; size: string; driver: string }[] = [
  { kind: 'لودر', owner: 'زياد', size: '' , driver: '' },
  { kind: 'عربية قلاب', owner: 'سلومة', size: '10 متر' , driver: '' },
  { kind: 'لودر', owner: 'زياد', size: '66' , driver: '' },
  { kind: 'عربية قلاب', owner: 'حسني', size: '10 متر' , driver: '' },
  { kind: 'لودر', owner: 'احمد حمدي', size: '100' , driver: '' },
  { kind: 'لودر', owner: 'عمورة', size: '66' , driver: '' },
  { kind: 'لودر', owner: 'مساعد', size: '400' , driver: '' },
  { kind: 'حفار', owner: 'محمود', size: 'كاوتش' , driver: '' },
  { kind: 'عربية قلاب', owner: 'حسونة', size: '20 متر حمرا' , driver: '' },
  { kind: 'عربية قلاب', owner: 'قدورة', size: '20 متر' , driver: '' },
];

function mLabel(m: Machinery): string {
  // للإكسل: نوع مقاس مالك
  return `${m.kind}${m.size ? ` ${m.size}` : ''} ${m.owner}`.trim();
}

/** الاسم في الشاشة: عريض (النوع + المقاس + السواق) وتحته المالك */
function MName({ m }: { m: Machinery }) {
  const bold = [m.kind, m.size, m.driver].filter(Boolean).join(' ');
  return (
    <div>
      <div className="font-black text-slate-900">{bold}</div>
      <div className="text-[11px] font-bold text-slate-500">👤 {m.owner}</div>
    </div>
  );
}

/** يحرّك التاريخ كام يوم */
function shiftDate(d: string, delta: number): string {
  const dt = new Date(d + 'T00:00:00');
  dt.setDate(dt.getDate() + delta);
  return dt.toISOString().slice(0, 10);
}

interface Props {
  user: Employee;
}

export default function MachineryTab({ user }: Props) {
  const canManage = user.role === 'admin' || user.role === 'manager' || Boolean((user as any).canEditAttendance);
  const today = new Date().toISOString().slice(0, 10);
  const monthNow = today.slice(0, 7);

  const [machinery, setMachinery] = useState<Machinery[]>([]);
  const [dayDate, setDayDate] = useState(today);
  const [month, setMonth] = useState(monthNow);
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState<{ id: number | null; kind: string; owner: string; size: string; driver: string; notes: string }>({ id: null, kind: 'لودر', owner: '', size: '', driver: '', notes: '' });

  function flash(text: string) {
    setMsg(text);
    window.setTimeout(() => setMsg(''), 4000);
  }

  function load() {
    setMachinery(getMachinery());
  }

  /** الساعات المحفوظة لليوم المختار */
  function draftFor(date: string): Record<number, string> {
    const d: Record<number, string> = {};
    for (const h of getMachineryHours()) {
      if (h.date === date && h.hours > 0) d[h.machineryId] = String(h.hours);
    }
    return d;
  }

  useEffect(() => {
    load();
    setDraft(draftFor(dayDate));
    refreshMachinery();
    const t1 = window.setTimeout(() => { load(); setDraft(draftFor(dayDate)); }, 1500);
    const t2 = window.setTimeout(() => { load(); setDraft(draftFor(dayDate)); }, 4000);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setDraft(draftFor(dayDate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayDate]);

  const active = machinery.filter(m => m.active);
  const daySum = active.reduce((s, m) => s + (parseFloat(draft[m.id] || '') || 0), 0);

  function saveDay() {
    try {
      const entries = active.map(m => ({ machineryId: m.id, hours: parseFloat(draft[m.id] || '') || 0 }));
      const filled = entries.filter(e => e.hours > 0).length;
      const r = saveMachineryHours(dayDate, entries);
      flash(`💾 اتحفظت ساعات ${r.saved > 0 ? r.saved : filled} معدة بتاريخ ${dayDate}`);
      window.setTimeout(() => { load(); setDraft(draftFor(dayDate)); }, 800);
    } catch (err: any) {
      flash('⛔ ' + (err?.message || 'حصل خطأ'));
    }
  }

  function seedAll() {
    for (const m of SEED) addMachinery({ ...m, notes: null, active: true });
    flash('🚜 اتضافت المعدات العشرة — ظبط أي حاجة من ✏️');
    window.setTimeout(() => { load(); refreshMachinery(); }, 600);
  }

  function submitMachinery(e: React.FormEvent) {
    e.preventDefault();
    if (!form.owner.trim()) { flash('⚠️ اكتب اسم المالك (زي: زياد، سلومة)'); return; }
    try {
      if (form.id) {
        updateMachinery(form.id, { kind: form.kind, owner: form.owner.trim(), size: form.size.trim(), driver: form.driver.trim(), notes: form.notes || null });
        flash('✏️ اتعدلت المعدة');
      } else {
        addMachinery({ kind: form.kind, owner: form.owner.trim(), size: form.size.trim(), driver: form.driver.trim(), notes: form.notes || null, active: true });
        flash('🚜 اتضافت المعدة');
      }
      setForm({ id: null, kind: 'لودر', owner: '', size: '', driver: '', notes: '' });
      window.setTimeout(() => { load(); }, 600);
    } catch (err: any) {
      flash('⛔ ' + (err?.message || 'حصل خطأ'));
    }
  }

  /** التراكمي لكل معدة */
  function totalsFor(m: Machinery) {
    const all = getMachineryHours().filter(h => h.machineryId === m.id);
    const day = all.filter(h => h.date === dayDate).reduce((s, h) => s + h.hours, 0);
    const mon = all.filter(h => h.date.startsWith(month)).reduce((s, h) => s + h.hours, 0);
    const total = all.reduce((s, h) => s + h.hours, 0);
    return { day, mon, total };
  }

  function exportDay() {
    const rows = active.map(m => [mLabel(m), m.driver || '', parseFloat(draft[m.id] || '') || 0]);
    downloadCsv(`ساعات_معدات_${dayDate}.csv`, ['المعدة', 'السواق', 'الساعات'], rows);
  }

  function exportMonth() {
    const [y, mo] = month.split('-').map(Number);
    const days = new Date(y, mo, 0).getDate();
    const headers = ['المعدة', 'السواق', ...Array.from({ length: days }, (_, i) => String(i + 1)), 'الإجمالي'];
    const all = getMachineryHours();
    const rows = active.map(m => {
      const mine = all.filter(h => h.machineryId === m.id && h.date.startsWith(month));
      const perDay = Array.from({ length: days }, (_, i) => {
        const d = `${month}-${String(i + 1).padStart(2, '0')}`;
        const hit = mine.find(h => h.date === d);
        return hit ? hit.hours : '';
      });
      const total = mine.reduce((s, h) => s + h.hours, 0);
      return [mLabel(m), m.driver || '', ...perDay, total];
    });
    const sumRow = ['الإجمالي', '', ...Array.from({ length: days }, (_, i) => {
      const d = `${month}-${String(i + 1).padStart(2, '0')}`;
      return all.filter(h => h.date === d).reduce((s, h) => s + h.hours, 0) || '';
    }), all.filter(h => h.date.startsWith(month)).reduce((s, h) => s + h.hours, 0)];
    downloadCsv(`كشف_ساعات_${month}.csv`, headers, [...rows, sumRow]);
  }

  return (
    <div className="space-y-5">
      {msg && (
        <div className="fixed bottom-4 left-1/2 z-[500] -translate-x-1/2 rounded-2xl bg-slate-900 px-6 py-3 text-sm font-black text-white shadow-2xl">
          {msg}
        </div>
      )}

      {/* ===== ورقة اليوم ===== */}
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-xl font-black text-slate-900">🚜 ساعات المعدات — ورقة اليوم</h3>
            <p className="mt-1 text-xs font-bold text-slate-500">اكتب ساعات شغل كل معدة وسيب الفاضي لو مش شغالة — وحفظ مرة واحدة · المعدة المسجلة بتفضل موجودة: أي يوم شغل جديد اختار اليوم واكتب ساعاته — وساعات باقي الأيام محفوظة زي ما هي</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setDayDate(shiftDate(dayDate, -1))} title="اليوم اللي قبله"
              className="rounded-xl border-2 border-slate-300 bg-white px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-100">◀</button>
            <input type="date" value={dayDate} onChange={e => setDayDate(e.target.value)}
              className="rounded-xl border-2 border-slate-300 px-3 py-2 text-sm font-black outline-none focus:border-slate-900" />
            <button type="button" onClick={() => setDayDate(shiftDate(dayDate, 1))} title="اليوم اللي بعده"
              className="rounded-xl border-2 border-slate-300 bg-white px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-100">▶</button>
            {dayDate !== today && (
              <button type="button" onClick={() => setDayDate(today)} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white hover:bg-slate-700">النهارده</button>
            )}
            <button type="button" onClick={exportDay} className="rounded-xl border-2 border-emerald-500 bg-white px-3 py-1.5 text-xs font-black text-emerald-700 hover:bg-emerald-50">📤 Excel يوم</button>
          </div>
        </div>

        {canManage && active.length === 0 && (
          <div className="mb-4 rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50 p-4 text-center">
            <div className="mb-2 text-sm font-black text-blue-800">مفيش معدات مسجلة — تحب تحط العشر بتاعتك بضغطة؟</div>
            <button type="button" onClick={seedAll} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-black text-white hover:bg-blue-700">🚜 أضف المعدات العشرة (زياد، سلومة، حسني، احمد حمدي، عمورة، مساعد، محمود، حسونة، قدورة)</button>
          </div>
        )}

        {active.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 p-6 text-center font-bold text-slate-500">{canManage ? 'ابدأ بإضافة أول معدة من تحت 👇' : 'لسه مفيش معدات مسجلة — الإدارة هتضيفها'}</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-200 text-xs font-black text-slate-500">
                    <th className="p-3">المعدة</th>
                    <th className="p-3 w-40">⏱️ الساعات</th>
                    <th className="p-3">ملاحظات</th>
                  </tr>
                </thead>
                <tbody>
                  {active.map(m => (
                    <tr key={m.id} className="border-b border-slate-100 font-bold text-slate-800">
                      <td className="p-3"><MName m={m} /></td>
                      <td className="p-3">
                        <input type="number" step="0.5" min="0" value={draft[m.id] ?? ''} onChange={e => setDraft(d => ({ ...d, [m.id]: e.target.value }))}
                          placeholder="—" className="w-full rounded-xl border-2 border-slate-300 px-3 py-2 text-center text-sm font-black outline-none focus:border-slate-900" />
                      </td>
                      <td className="p-3 text-xs text-slate-500">{m.notes || ''}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 font-black text-slate-900">
                    <td className="p-3">الإجمالي</td>
                    <td className="p-3">{active.length} معدة</td>
                    <td className="p-3 text-center">{daySum}</td>
                    <td className="p-3 text-xs text-slate-500">{active.filter(m => parseFloat(draft[m.id] || '') > 0).length} شغالة النهارده</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <button type="button" onClick={saveDay} className="mt-4 w-full rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white hover:bg-emerald-700">
              💾 حفظ ساعات اليوم ({dayDate})
            </button>
          </>
        )}
      </section>

      {/* ===== التراكمي ===== */}
      {active.length > 0 && (
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xl font-black text-slate-900">📊 التراكمي</h3>
            <div className="flex flex-wrap items-center gap-2">
              <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                className="rounded-xl border-2 border-slate-300 px-3 py-2 text-sm font-black outline-none focus:border-slate-900" />
              <button type="button" onClick={exportMonth} className="rounded-xl border-2 border-emerald-500 bg-white px-3 py-1.5 text-xs font-black text-emerald-700 hover:bg-emerald-50">📤 كشف الشهر Excel</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200 text-xs font-black text-slate-500">
                  <th className="p-3">المعدة</th>
                  <th className="p-3">يوم {dayDate}</th>
                  <th className="p-3">شهر {month}</th>
                  <th className="p-3">الإجمالي الكلي</th>
                </tr>
              </thead>
              <tbody>
                {active.map(m => {
                  const t = totalsFor(m);
                  return (
                    <tr key={m.id} className="border-b border-slate-100 font-bold text-slate-800">
                      <td className="p-3"><MName m={m} /></td>
                      <td className="p-3">{t.day || '—'}</td>
                      <td className="p-3">{t.mon || '—'}</td>
                      <td className="p-3 font-black text-blue-700">{t.total || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 font-black text-slate-900">
                  <td className="p-3">الإجمالي</td>
                  <td className="p-3">{active.reduce((s, m) => s + totalsFor(m).day, 0) || '—'}</td>
                  <td className="p-3">{active.reduce((s, m) => s + totalsFor(m).mon, 0) || '—'}</td>
                  <td className="p-3">{active.reduce((s, m) => s + totalsFor(m).total, 0) || '—'}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {/* ===== إدارة المعدات (إدارة) ===== */}
      {canManage && (
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-1 text-xl font-black text-slate-900">⚙️ إدارة المعدات ({machinery.filter(m => m.active).length})</h3>
          <p className="mb-4 text-xs font-bold text-slate-500">النوع + المقاس + المالك + السواق — الاسم بيتكون تلقائي زي: لودر 66 زياد</p>
          <form onSubmit={submitMachinery} className="mb-4 grid gap-3 md:grid-cols-6">
            <label className="text-sm font-black text-slate-700">
              النوع
              <select value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value }))}
                className="mt-1 w-full rounded-xl border-2 border-blue-400 px-3 py-3 text-sm font-bold outline-none focus:border-blue-600">
                {KINDS.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
            <label className="text-sm font-black text-slate-700">
              المالك
              <input value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} placeholder="زياد، سلومة..." list="vsys-owners"
                className="mt-1 w-full rounded-xl border-2 border-blue-400 px-3 py-3 text-sm font-bold outline-none focus:border-blue-600" />
              <datalist id="vsys-owners">
                {[...new Set(machinery.filter(m => m.owner.trim()).map(m => m.owner.trim()))].map(o => <option key={o} value={o} />)}
              </datalist>
            </label>
            <label className="text-sm font-black text-slate-700">
              المقاس/الوصف
              <input value={form.size} onChange={e => setForm(f => ({ ...f, size: e.target.value }))} placeholder="10 متر، 66، 100..."
                className="mt-1 w-full rounded-xl border-2 border-blue-400 px-3 py-3 text-sm font-bold outline-none focus:border-blue-600" />
            </label>
            <label className="text-sm font-black text-slate-700">
              🚛 السواق
              <input value={form.driver} onChange={e => setForm(f => ({ ...f, driver: e.target.value }))} placeholder="اسم السواق (اختياري)" list="vsys-drivers"
                className="mt-1 w-full rounded-xl border-2 border-blue-400 px-3 py-3 text-sm font-bold outline-none focus:border-blue-600" />
              <datalist id="vsys-drivers">
                {[...new Set(machinery.filter(m => m.driver.trim()).map(m => m.driver.trim()))].map(d => <option key={d} value={d} />)}
              </datalist>
            </label>
            <label className="text-sm font-black text-slate-700">
              ملاحظات
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="اختياري"
                className="mt-1 w-full rounded-xl border-2 border-blue-400 px-3 py-3 text-sm font-bold outline-none focus:border-blue-600" />
            </label>
            <button type="submit" className="mt-6 rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700">
              {form.id ? '✏️ حفظ التعديل' : '➕ إضافة معدة'}
            </button>
          </form>

          {machinery.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 p-4 text-center text-sm font-bold text-slate-500">مفيش معدات — ضيف من الفورم أو زرار العشر الجاهزين فوق</div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {machinery.map(m => (
                <div key={m.id} className={`flex items-center justify-between gap-2 rounded-xl border-2 p-3 ${m.active ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-60'}`}>
                  <div>
                    <div className="text-sm font-black text-slate-800">{mLabel(m)} {!m.active && <span className="text-[10px] text-slate-400">(متوقفة)</span>}</div>
                    {(m.driver || m.owner) && <div className="text-[11px] font-bold text-slate-400">👤 مالك: {m.owner}{m.driver ? ` · 🚛 سواق: ${m.driver}` : ''}</div>}
                    {m.notes && <div className="text-[11px] font-bold text-slate-400">{m.notes}</div>}
                  </div>
                  {m.active && (
                    <div className="flex gap-1">
                      <button type="button" onClick={() => setForm({ id: m.id, kind: m.kind, owner: m.owner, size: m.size, driver: m.driver || '', notes: m.notes || '' })}
                        className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-200">✏️</button>
                      <button type="button" onClick={() => { if (window.confirm(`توقف ${mLabel(m)}؟ الساعات المسجلة هتفضل محسوبة`)) { deactivateMachinery(m.id); flash('⛔ اتوقفت المعدة — ساعاتها القديمة محفوظة'); window.setTimeout(load, 500); } }}
                        className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-black text-red-600 hover:bg-red-100">🗑️</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
