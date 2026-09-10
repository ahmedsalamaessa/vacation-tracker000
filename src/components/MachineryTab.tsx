import React, { useEffect, useState } from 'react';
import type { Employee, Machinery } from '../lib/types';
import {
  getMachinery,
  getMachineryHours,
  getEmployees,
  updateEmployee,
  addMachinery,
  updateMachinery,
  deactivateMachinery,
  deleteMachineryHard,
  clearAllMachinery,
  saveMachineryHours,
  refreshMachinery,
  getSettings,
} from '../lib/db';
import { downloadCsv } from '../lib/exportCsv';

const KINDS = ['لودر', 'عربية قلاب', 'عربية مية', 'حفار', 'أخرى'];

// 📊 التجميع: اللودرات تحت بعض، ثم العربيات، ثم الحفارات — وأي إضافة جديدة تقع في مجموعتها تلقائيًا
const GROUP_ORDER = ['لودر', 'عربية قلاب', 'عربية مية', 'حفار', 'أخرى'];
const GROUP_LABEL: Record<string, string> = {
  'لودر': '🚜 اللودرات',
  'عربية قلاب': '🚚 العربيات',
  'عربية مية': '🚰 عربيات المية',
  'حفار': '⛏️ الحفارات',
  'أخرى': '🔧 أخرى',
};
function groupOf(m: Machinery): string {
  return GROUP_ORDER.includes(m.kind) ? m.kind : 'أخرى';
}
function byGroup(ms: Machinery[]): { label: string; items: Machinery[] }[] {
  return GROUP_ORDER
    .map(k => ({ label: GROUP_LABEL[k], items: ms.filter(m => groupOf(m) === k) }))
    .filter(g => g.items.length > 0);
}

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
  // 👑 إدارة المعدات الثقيلة (تعديل/إيقاف/مسح/تفريغ): المالك بس — المساح يسجل الساعات بس
  const isOwnerUser = Boolean((user as any).isOwner);
  // ➕ إضافة معدة جديدة: المالك + الأدمن/المدير
  const canAddMach = isOwnerUser || user.role === 'admin' || user.role === 'manager';
  // 🔒 قفل الأيام القديمة: التعديل من المالك + المديرين + أي موظف فك له المالك القفل صراحة
  const canEditLockedDays = isOwnerUser || user.role === 'manager' || Boolean((user as any).canEditPastMachinery);
  const today = new Date().toISOString().slice(0, 10);
  const monthNow = today.slice(0, 7);

  const [machinery, setMachinery] = useState<Machinery[]>([]);
  const [employeesList, setEmployeesList] = useState<Employee[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState<number | null>(null);
  const [empToggling, setEmpToggling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dayDate, setDayDate] = useState(today);
  const [month, setMonth] = useState(monthNow);
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [draftTrips, setDraftTrips] = useState<Record<number, string>>({});
  const [draftNotes, setDraftNotes] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState<{ id: number | null; kind: string; custom: string; owner: string; size: string; driver: string; notes: string }>({ id: null, kind: 'لودر', custom: '', owner: '', size: '', driver: '', notes: '' });
  const [deptName, setDeptName] = useState('قسم المساحة');
  const [printOwner, setPrintOwner] = useState<string | null>(null);
  const [printGrid, setPrintGrid] = useState(false);

  function flash(text: string) {
    setMsg(text);
    window.setTimeout(() => setMsg(''), 4000);
  }

  function load() {
    setMachinery(getMachinery());
    setDeptName(getSettings().department_name || 'قسم المساحة');
    const emps = getEmployees().filter(e => e.active && !e.isOwner);
    setEmployeesList(emps);
    if (emps.length > 0) {
      setSelectedEmpId(prev => (prev && emps.some(e => e.id === prev) ? prev : emps[0].id));
    }
  }

  async function togglePastMachineryPermission(empId: number, currentVal: boolean) {
    if (!isOwnerUser) return;
    const target = employeesList.find(e => e.id === empId);
    if (!target) return;
    setEmpToggling(true);
    try {
      const newVal = !currentVal;
      await updateEmployee(empId, { canEditPastMachinery: newVal });
      setEmployeesList(prev => prev.map(e => e.id === empId ? { ...e, canEditPastMachinery: newVal } : e));
      flash(newVal ? `🔓 تم فتح تسجيل الأيام السابقة لـ (${target.name}) بنجاح` : `🔒 تم قفل تسجيل الأيام السابقة لـ (${target.name})`);
    } catch (err: any) {
      flash('❌ فشل تغيير الإذن: ' + (err?.message || 'خطأ غير معروف'));
    } finally {
      setEmpToggling(false);
    }
  }

  /** الساعات المحفوظة لليوم المختار */
  function draftFor(date: string): Record<number, string> {
    const d: Record<number, string> = {};
    for (const h of getMachineryHours()) {
      if (h.date === date && h.hours > 0) d[h.machineryId] = String(h.hours);
    }
    return d;
  }

  /** النقلات المحفوظة لليوم المختار */
  function draftTripsFor(date: string): Record<number, string> {
    const d: Record<number, string> = {};
    for (const h of getMachineryHours()) {
      if (h.date === date && (h.trips ?? 0) > 0) d[h.machineryId] = String(h.trips);
    }
    return d;
  }

  /** تقارير الشغل المحفوظة لليوم المختار */
  function notesFor(date: string): Record<number, string> {
    const d: Record<number, string> = {};
    for (const h of getMachineryHours()) {
      if (h.date === date && h.notes) d[h.machineryId] = h.notes || '';
    }
    return d;
  }

  /** 👑 تفاصيل من سجّل الساعات والنقلات ومن سجّل التوجيه (تظهر للمالك فقط) */
  function getLogInfo(mId: number, day: string) {
    const h = getMachineryHours().find(x => x.machineryId === mId && x.date === day);
    if (!h) return null;
    const hoursUser = h.hoursByName || (h.hoursBy ? getEmployees().find(e => e.id === h.hoursBy)?.name : null);
    const tripsUser = h.tripsByName || (h.tripsBy ? getEmployees().find(e => e.id === h.tripsBy)?.name : null);
    const notesUser = h.notesByName || (h.notesBy ? getEmployees().find(e => e.id === h.notesBy)?.name : null);
    const createdUser = h.createdBy ? getEmployees().find(e => e.id === h.createdBy)?.name : null;
    const hUser = hoursUser || (h.hours > 0 ? createdUser : null);
    const tUser = tripsUser || ((h.trips ?? 0) > 0 ? createdUser : null);
    const nUser = notesUser || (h.notes ? createdUser : null);
    if (!hUser && !tUser && !nUser) return null;
    const users = [hUser, tUser, nUser].filter(Boolean);
    const allSame = users.length > 0 && users.every(u => u === users[0]);
    return {
      hoursUser: hUser,
      tripsUser: tUser,
      notesUser: nUser,
      allSame: Boolean(allSame),
      mainUser: users[0] || null,
    };
  }

  useEffect(() => {
    load();
    setDraft(draftFor(dayDate));
    setDraftTrips(draftTripsFor(dayDate));
    setDraftNotes(notesFor(dayDate));
    refreshMachinery();
    const t1 = window.setTimeout(() => { load(); setDraft(draftFor(dayDate)); setDraftTrips(draftTripsFor(dayDate)); setDraftNotes(notesFor(dayDate)); }, 1500);
    const t2 = window.setTimeout(() => { load(); setDraft(draftFor(dayDate)); setDraftTrips(draftTripsFor(dayDate)); setDraftNotes(notesFor(dayDate)); }, 4000);
    const syncNow = () => { if (document.visibilityState === 'visible') { refreshMachinery(); window.setTimeout(() => { load(); }, 900); } };
    const live = window.setInterval(syncNow, 900000);
    const onVisible = () => { if (document.visibilityState === 'visible') syncNow(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); window.clearInterval(live); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', onVisible); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 🔄 تحديث يدوي: بيجيب آخر بيانات من السيرفر فورًا — وبيحمي ساعات ونقلات اليوم اللي انت كتبها لسه من التمسح */
  function manualRefresh() {
    flash('🔄 بجيب آخر بيانات من السيرفر...');
    const userHadEdits = JSON.stringify(draft) !== JSON.stringify(draftFor(dayDate)) ||
                         JSON.stringify(draftTrips) !== JSON.stringify(draftTripsFor(dayDate)) ||
                         JSON.stringify(draftNotes) !== JSON.stringify(notesFor(dayDate));
    refreshMachinery();
    window.setTimeout(() => {
      load();
      if (!userHadEdits) {
        setDraft(draftFor(dayDate));
        setDraftTrips(draftTripsFor(dayDate));
        setDraftNotes(notesFor(dayDate));
      }
      flash(userHadEdits ? '🔄 اتحطّت آخر بيانات — والساعات والنقلات اللي كتبتها للنهارده محفوظة زي ما هي' : '✅ اتحطّت آخر بيانات من السيرفر');
    }, 1200);
  }

  useEffect(() => {
    setDraft(draftFor(dayDate));
    setDraftTrips(draftTripsFor(dayDate));
    setDraftNotes(notesFor(dayDate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayDate]);

  const active = machinery.filter(m => m.active);
  const dayLocked = dayDate < today && !canEditLockedDays;
  const dayFuture = dayDate > today;
  // التراكمي: كل غير الممسوح + الممسوح اللي عنده ساعات أو نقلات قديمة (شغله محفوظ)
  const histList = machinery.filter(m => !m.deleted || getMachineryHours().some(h => h.machineryId === m.id));
  const daySum = active.reduce((s, m) => s + (parseFloat(draft[m.id] || '') || 0), 0);
  const dayTripsSum = active.reduce((s, m) => s + (parseFloat(draftTrips[m.id] || '') || 0), 0);

  async function saveDay() {
    if (dayFuture) { flash('⏳ مينفعش تسجل ساعات أو نقلات ليوم لسه جاي'); return; }
    if (dayLocked) { flash(`🔒 يوم ${dayDate} مقفول — التعديل من الإدارة بس`); return; }
    try {
      const entries = active.map(m => ({
        machineryId: m.id,
        hours: parseFloat(draft[m.id] || '') || 0,
        trips: parseFloat(draftTrips[m.id] || '') || 0,
        notes: (draftNotes[m.id] || '').trim(),
      }));
      const filled = entries.filter(e => e.hours > 0 || e.trips > 0 || e.notes).length;
      const r = await saveMachineryHours(dayDate, entries);
      flash(`💾 اتحفظت على السيرفر بيانات ${r.saved > 0 ? r.saved : filled} معدة بتاريخ ${dayDate}`);
      load();
    } catch (err: any) {
      flash('⛔ ماتحفظتش على السيرفر: ' + (err?.message || 'حصل خطأ'));
    }
  }

  async function submitMachinery(e: React.FormEvent) {
    e.preventDefault();
    if (!form.owner.trim()) { flash('⚠️ اكتب اسم المالك (زي: زياد، سلومة)'); return; }
    if (form.kind === 'أخرى' && !form.custom.trim()) { flash('⚠️ اكتب اسم المعدة (مثال: عربية مية، جرار)'); return; }
    const kind = form.kind === 'أخرى' ? form.custom.trim() : form.kind;
    try {
      setBusy(true);
      if (form.id) {
        await updateMachinery(form.id, { kind, owner: form.owner.trim(), size: form.size.trim(), driver: form.driver.trim(), notes: form.notes || null });
        flash('✏️ اتعدلت المعدة واتحفظت على السيرفر');
      } else {
        await addMachinery({ kind, owner: form.owner.trim(), size: form.size.trim(), driver: form.driver.trim(), notes: form.notes || null, active: true });
        flash('🚜 اتضافت المعدة على السيرفر — هيظهر للكل');
      }
      setForm({ id: null, kind: 'لودر', custom: '', owner: '', size: '', driver: '', notes: '' });
      load();
    } catch (err: any) {
      flash('⛔ ماتحفظتش على السيرفر: ' + (err?.message || 'حصل خطأ'));
    } finally {
      setBusy(false);
    }
  }

  /** 🗓️ أيام الشهر المختار + خريطة ساعات ونقلات: معدة → يوم → ساعات / نقلات */
  const monthDaysCount = (() => { const [y, mo] = month.split('-').map(Number); return y && mo ? new Date(y, mo, 0).getDate() : 30; })();
  const monthDays = Array.from({ length: monthDaysCount }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
  const hoursGrid = new Map<number, Map<string, number>>();
  const tripsGrid = new Map<number, Map<string, number>>();
  for (const h of getMachineryHours()) {
    if (!h.date.startsWith(month)) continue;
    if (h.hours > 0) {
      if (!hoursGrid.has(h.machineryId)) hoursGrid.set(h.machineryId, new Map());
      const g = hoursGrid.get(h.machineryId)!;
      g.set(h.date, (g.get(h.date) || 0) + h.hours);
    }
    if ((h.trips ?? 0) > 0) {
      if (!tripsGrid.has(h.machineryId)) tripsGrid.set(h.machineryId, new Map());
      const tg = tripsGrid.get(h.machineryId)!;
      tg.set(h.date, (tg.get(h.date) || 0) + (h.trips || 0));
    }
  }
  const hoursOf = (mid: number, d: string) => hoursGrid.get(mid)?.get(d) || 0;
  const tripsOf = (mid: number, d: string) => tripsGrid.get(mid)?.get(d) || 0;
  const monthGridTotal = (mid: number) => { let t = 0; hoursGrid.get(mid)?.forEach(v => t += v); return t; };
  const monthGridTotalTrips = (mid: number) => { let t = 0; tripsGrid.get(mid)?.forEach(v => t += v); return t; };
  const dayGridTotal = (d: string) => { let t = 0; hoursGrid.forEach(gm => t += gm.get(d) || 0); return t; };
  const dayGridTotalTrips = (d: string) => { let t = 0; tripsGrid.forEach(gm => t += gm.get(d) || 0); return t; };
  const monthGridGrand = histList.reduce((s, m) => s + monthGridTotal(m.id), 0);
  const monthGridGrandTrips = histList.reduce((s, m) => s + monthGridTotalTrips(m.id), 0);

  // 📝 خريطة تقارير الشغل: معدة → يوم → التقرير (وصف إيه اللي اتعمل النهارده)
  const notesGrid = new Map<number, Map<string, string>>();
  for (const h of getMachineryHours()) {
    if (!h.date.startsWith(month)) continue;
    if (!h.notes) continue;
    if (!notesGrid.has(h.machineryId)) notesGrid.set(h.machineryId, new Map());
    const g = notesGrid.get(h.machineryId)!;
    g.set(h.date, h.notes || '');
  }
  const notesOf = (mid: number, d: string) => notesGrid.get(mid)?.get(d) || '';

  /** التراكمي لكل معدة */
  function totalsFor(m: Machinery) {
    const all = getMachineryHours().filter(h => h.machineryId === m.id);
    const day = all.filter(h => h.date === dayDate).reduce((s, h) => s + h.hours, 0);
    const dayTrips = all.filter(h => h.date === dayDate).reduce((s, h) => s + (h.trips || 0), 0);
    const mon = all.filter(h => h.date.startsWith(month)).reduce((s, h) => s + h.hours, 0);
    const monTrips = all.filter(h => h.date.startsWith(month)).reduce((s, h) => s + (h.trips || 0), 0);
    const total = all.reduce((s, h) => s + h.hours, 0);
    const totalTrips = all.reduce((s, h) => s + (h.trips || 0), 0);
    return { day, dayTrips, mon, monTrips, total, totalTrips };
  }

  /** أيام الشغل في الشهر للمعدة */
  function workDays(m: Machinery): number {
    return getMachineryHours().filter(h => h.machineryId === m.id && h.date.startsWith(month) && (h.hours > 0 || (h.trips ?? 0) > 0)).length;
  }

  /** 👤 كشف الملاك: كل مالك ومعداته وإجمالي شهره */
  const ownersList = [...new Set(histList.map(m => m.owner.trim()).filter(Boolean))]
    .map(owner => {
      const machines = histList.filter(m => m.owner.trim() === owner);
      const mon = machines.reduce((s2, m) => s2 + totalsFor(m).mon, 0);
      const monTrips = machines.reduce((s2, m) => s2 + totalsFor(m).monTrips, 0);
      const total = machines.reduce((s2, m) => s2 + totalsFor(m).total, 0);
      const totalTrips = machines.reduce((s2, m) => s2 + totalsFor(m).totalTrips, 0);
      return { owner, machines, mon, monTrips, total, totalTrips };
    })
    .sort((a, b) => b.mon - a.mon || b.monTrips - a.monTrips || a.owner.localeCompare(b.owner, 'ar'));

  function exportOwners() {
    const rows = ownersList.map(o => [o.owner, o.machines.length, o.mon, o.monTrips, o.total, o.totalTrips]);
    downloadCsv(`كشف_الملاك_${month}.csv`, ['المالك', 'عدد المعدات', `ساعات ${month}`, `نقلات ${month}`, 'إجمالي الساعات', 'إجمالي النقلات'], [...rows, ['الإجمالي', '', ownersList.reduce((s2, o) => s2 + o.mon, 0), ownersList.reduce((s2, o) => s2 + o.monTrips, 0), ownersList.reduce((s2, o) => s2 + o.total, 0), ownersList.reduce((s2, o) => s2 + o.totalTrips, 0)]]);
  }

  function exportDay() {
    const rows = active.map(m => [mLabel(m), m.driver || '', parseFloat(draft[m.id] || '') || 0, parseFloat(draftTrips[m.id] || '') || 0, (draftNotes[m.id] || '').trim()]);
    downloadCsv(`ساعات_ونقلات_معدات_${dayDate}.csv`, ['المعدة', 'السواق', 'الساعات', 'النقلات', 'تقرير الشغل'], rows);
  }

  /** 📤 كشف الشهر Excel — أيام صفوف × (ساعة + نقلة + تقرير الشغل) لكل معدة + إجمالي تحت */
  function exportMonth() {
    const wd = ['أحد', 'اتنين', 'تلات', 'أربع', 'خميس', 'جمعة', 'سبت'];
    const mHeader = (m: Machinery) => [m.kind, m.size].filter(Boolean).join(' ') + (m.owner ? ` (${m.owner})` : '');
    // سطر العنوان: اليوم | لكل معدة 3 أعمدة (الساعة + النقلة + تقرير الشغل) | إجمالي ساعات اليوم | إجمالي نقلات اليوم
    const headers = ['📅 اليوم', ...histList.flatMap(m => [`${mHeader(m)} — الساعة`, `${mHeader(m)} — النقلة`, `${mHeader(m)} — تقرير الشغل`]), 'إجمالي ساعات اليوم', 'إجمالي نقلات اليوم'];
    // صف لكل يوم في الشهر
    const dayRows = monthDays.map(d => {
      const dayNum = d.slice(8);
      const dayWd = wd[new Date(d + 'T00:00:00').getDay()];
      const dayT = dayGridTotal(d);
      const dayTripsT = dayGridTotalTrips(d);
      return [
        `${dayNum} — ${dayWd}`,
        ...histList.flatMap(m => [hoursOf(m.id, d) || '', tripsOf(m.id, d) || '', notesOf(m.id, d) || '']),
        dayT || '',
        dayTripsT || '',
      ];
    });
    // سطر الإجمالي في الآخر
    const totalRow = ['إجمالي الشهر', ...histList.flatMap(m => [monthGridTotal(m.id) || '', monthGridTotalTrips(m.id) || '', '']), monthGridGrand || '', monthGridGrandTrips || ''];
    downloadCsv(`شيت_ساعات_ونقلات_${month}.csv`, headers, [...dayRows, totalRow]);
  }

  return (
    <div className="space-y-5">
      {msg && (
        <div className="fixed bottom-4 left-1/2 z-[500] -translate-x-1/2 rounded-2xl bg-slate-900 px-6 py-3 text-sm font-black text-white shadow-2xl">
          {msg}
        </div>
      )}

      {/* ===== 👑 تحكم المالك في فتح/قفل التعديل للمساحين ===== */}
      {isOwnerUser && (
        <section className="rounded-[2rem] border-2 border-indigo-200 bg-gradient-to-br from-indigo-50/90 via-white to-blue-50/80 p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-600 text-xl text-white shadow-md">
                👑
              </span>
              <div>
                <h4 className="text-base font-black text-indigo-950">تحكم المالك: فك / قفل تسجيل الأيام السابقة</h4>
                <p className="text-xs font-bold text-indigo-700">تحكم فوري في مين مسموح له يعدل الأيام اللي فاتت ومين مقفول عليه (النهارده بس)</p>
              </div>
            </div>
            {/* مؤشر عدد المفتوح لهم */}
            {(() => {
              const unlockedCount = employeesList.filter(e => e.canEditPastMachinery).length;
              return (
                <span className={`rounded-xl px-3 py-1.5 text-xs font-black shadow-sm ${
                  unlockedCount > 0 ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-slate-100 text-slate-700 border border-slate-200'
                }`}>
                  {unlockedCount > 0 ? `⚠️ مفتوح حالياً لـ ${unlockedCount} موظف` : '🔒 الكل مقفول (الوضع الطبيعي: النهارده بس)'}
                </span>
              );
            })()}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center bg-white p-4 rounded-2xl border border-indigo-100 shadow-sm">
            <div className="md:col-span-6">
              <label className="block text-xs font-black text-slate-700 mb-1">اختر المساح أو المساعد:</label>
              <select
                value={selectedEmpId ?? ''}
                onChange={e => setSelectedEmpId(Number(e.target.value))}
                className="w-full rounded-xl border-2 border-indigo-200 bg-indigo-50/30 px-3 py-2 text-sm font-black text-slate-800 outline-none focus:border-indigo-600"
              >
                {employeesList.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.canEditPastMachinery ? '🔓 ' : '🔒 '} {e.name} ({e.jobTitle || 'موظف'}) {e.canEditPastMachinery ? '— مفتوح' : '— مقفول'}
                  </option>
                ))}
              </select>
            </div>

            {(() => {
              const currentEmp = employeesList.find(e => e.id === selectedEmpId);
              if (!currentEmp) return null;
              const isUnlocked = Boolean(currentEmp.canEditPastMachinery);
              return (
                <div className="md:col-span-6 flex flex-wrap items-center justify-between gap-3 pt-2 md:pt-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-500">الحالة:</span>
                    <span className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-black ${
                      isUnlocked ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-100 text-slate-700 border border-slate-300'
                    }`}>
                      {isUnlocked ? '🔓 مسموح بتعديل الأيام السابقة' : '🔒 مقفول (النهارده بس)'}
                    </span>
                  </div>

                  <button
                    type="button"
                    disabled={empToggling}
                    onClick={() => togglePastMachineryPermission(currentEmp.id, isUnlocked)}
                    className={`rounded-xl px-4 py-2 text-xs font-black text-white shadow-md transition-all active:scale-95 disabled:opacity-50 ${
                      isUnlocked ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'
                    }`}
                  >
                    {empToggling ? 'جاري التعديل...' : isUnlocked ? '🔒 إعادة القفل (النهارده بس)' : '🔓 فتح التعديل للأيام السابقة'}
                  </button>
                </div>
              );
            })()}
          </div>

          {/* قائمة المفتوح لهم حالياً مع زر إلغاء فوري */}
          {(() => {
            const unlockedList = employeesList.filter(e => e.canEditPastMachinery);
            if (unlockedList.length === 0) return null;
            return (
              <div className="mt-3 flex flex-wrap items-center gap-2 pt-2 border-t border-indigo-100 text-xs font-bold text-slate-700">
                <span className="text-amber-800 font-black">المسموح لهم حالياً:</span>
                {unlockedList.map(e => (
                  <span key={e.id} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-50 border border-amber-300 px-2.5 py-1 text-xs font-black text-amber-900 shadow-sm">
                    <span>🔓 {e.name}</span>
                    <button
                      type="button"
                      title="قفل التعديل فوراً"
                      onClick={() => togglePastMachineryPermission(e.id, true)}
                      className="text-red-600 hover:text-red-800 font-black px-1 text-sm leading-none"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            );
          })()}
        </section>
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
            <button type="button" onClick={manualRefresh} title="تحديث فوري من السيرفر" className="rounded-xl border-2 border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50">🔄 تحديث</button>
            <button type="button" onClick={exportDay} className="rounded-xl border-2 border-emerald-500 bg-white px-3 py-1.5 text-xs font-black text-emerald-700 hover:bg-emerald-50">📤 Excel يوم</button>
          </div>
        </div>

        {dayLocked && (
          <div className="mb-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-center">
            <span className="text-2xl">🔒</span>
            <div className="text-sm font-black text-amber-800">يوم {dayDate} اتقفل — تسجيل/تعديل ساعات الأيام اللي فاتت من المالك أو المدير بس</div>
          </div>
        )}
        {dayDate < today && !isOwnerUser && Boolean((user as any).canEditPastMachinery) && (
          <div className="mb-3 rounded-2xl border-2 border-blue-300 bg-blue-50 p-3 text-center">
            <span className="text-xl">🔓</span>
            <div className="text-xs font-black text-blue-900">مسموح لك بتسجيل وتعديل ساعات الأيام السابقة (إذن خاص من الإدارة)</div>
          </div>
        )}
        {dayFuture && (
          <div className="mb-3 rounded-2xl border-2 border-slate-300 bg-slate-50 p-4 text-center">
            <span className="text-2xl">⏳</span>
            <div className="text-sm font-black text-slate-600">مينفعش تسجل ساعات ليوم لسه جاي — استنى لما ييجي اليوم</div>
          </div>
        )}
        {active.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 p-6 text-center font-bold text-slate-500">لسه مفيش معدات — ضيف أول معدة من قسم ⚙️ المعدات تحت 👇</div>
        ) : (
          <>
            {/* على الكومبيوتر: جدول الأربع أعمدة: المعدة | ⏱️ الساعات | 🚛 النقلات | 📝 تقرير الشغل */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-200 text-xs font-black text-slate-500">
                    <th className="p-3">المعدة</th>
                    <th className="p-3 w-32">⏱️ الساعات</th>
                    <th className="p-3 w-32">🚛 النقلات</th>
                    <th className="p-3">📝 تقرير الشغل</th>
                  </tr>
                </thead>
                <tbody>
                  {byGroup(active).map(g => (
                    <React.Fragment key={g.label}>
                      <tr className="bg-slate-50/80">
                        <td colSpan={4} className="p-2 text-xs font-black text-slate-500">{g.label} ({g.items.length})</td>
                      </tr>
                      {g.items.map(m => (
                        <tr key={m.id} className="border-b border-slate-100 font-bold text-slate-800">
                          <td className="p-3">
                            <MName m={m} />
                            {isOwnerUser && (() => {
                              const log = getLogInfo(m.id, dayDate);
                              if (!log) return null;
                              return (
                                <div className="mt-1.5 inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/90 px-2 py-0.5 text-[11px] font-bold text-indigo-950 shadow-xs">
                                  {log.allSame ? (
                                    <span>✍️ المسجل: <b className="font-black text-indigo-900">{log.mainUser}</b></span>
                                  ) : (
                                    <>
                                      {log.hoursUser && <span>⏱️ الساعات: <b className="font-black text-indigo-900">{log.hoursUser}</b></span>}
                                      {log.hoursUser && (log.tripsUser || log.notesUser) && <span className="text-indigo-300">|</span>}
                                      {log.tripsUser && <span>🚛 النقلات: <b className="font-black text-indigo-900">{log.tripsUser}</b></span>}
                                      {log.tripsUser && log.notesUser && <span className="text-indigo-300">|</span>}
                                      {log.notesUser && <span>📝 التقرير: <b className="font-black text-indigo-900">{log.notesUser}</b></span>}
                                    </>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                          <td className="p-3">
                            <input type="number" step="0.5" min="0" value={draft[m.id] ?? ''} onChange={e => setDraft(d => ({ ...d, [m.id]: e.target.value }))}
                              readOnly={dayLocked || dayFuture} disabled={dayLocked || dayFuture}
                              placeholder="—" className="w-full rounded-xl border-2 border-slate-300 px-3 py-2 text-center text-sm font-black outline-none focus:border-slate-900 disabled:bg-slate-100 disabled:text-slate-400" />
                          </td>
                          <td className="p-3">
                            <input type="number" step="0.5" min="0" value={draftTrips[m.id] ?? ''} onChange={e => setDraftTrips(d => ({ ...d, [m.id]: e.target.value }))}
                              readOnly={dayLocked || dayFuture} disabled={dayLocked || dayFuture}
                              placeholder="—" className="w-full rounded-xl border-2 border-amber-300 bg-amber-50/30 px-3 py-2 text-center text-sm font-black outline-none focus:border-amber-600 disabled:bg-slate-100 disabled:text-slate-400" />
                          </td>
                          <td className="p-3">
                            <input type="text" value={draftNotes[m.id] ?? ''} onChange={e => setDraftNotes(d => ({ ...d, [m.id]: e.target.value }))}
                              readOnly={dayLocked || dayFuture} disabled={dayLocked || dayFuture}
                              placeholder="اتعمل إيه؟ (حفر، نقل ردم...)" className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold outline-none focus:border-slate-900 disabled:bg-slate-100 disabled:text-slate-400" />
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 font-black text-slate-900">
                    <td className="p-3">الإجمالي ({active.length} معدة)</td>
                    <td className="p-3 text-center text-blue-700">{daySum} س</td>
                    <td className="p-3 text-center text-amber-700">{dayTripsSum} نقلة</td>
                    <td className="p-3 text-xs text-slate-500">{active.filter(m => parseFloat(draft[m.id] || '') > 0 || parseFloat(draftTrips[m.id] || '') > 0).length} شغالة النهارده</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {/* 📱 على الموبايل: بطاقات لكل معدة تشمل الساعات والنقلات وتقرير الشغل */}
            <div className="space-y-3 md:hidden">
              {byGroup(active).map(g => (
                <div key={g.label}>
                  <div className="mb-2 text-xs font-black text-slate-500">{g.label} ({g.items.length})</div>
                  <div className="space-y-3">
                    {g.items.map(m => (
                      <div key={m.id} className="rounded-2xl border-2 border-slate-200 bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <MName m={m} />
                            {isOwnerUser && (() => {
                              const log = getLogInfo(m.id, dayDate);
                              if (!log) return null;
                              return (
                                <div className="mt-2 inline-flex flex-wrap items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-950 shadow-xs">
                                  {log.allSame ? (
                                    <span>✍️ المسجل: <b className="font-black text-indigo-900">{log.mainUser}</b></span>
                                  ) : (
                                    <>
                                      {log.hoursUser && <span>⏱️ الساعات: <b className="font-black text-indigo-900">{log.hoursUser}</b></span>}
                                      {log.tripsUser && <span>🚛 النقلات: <b className="font-black text-indigo-900">{log.tripsUser}</b></span>}
                                      {log.notesUser && <span>📝 التقرير: <b className="font-black text-indigo-900">{log.notesUser}</b></span>}
                                    </>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </div>

                        {/* خانات الساعات والنقلات جنب بعض */}
                        <div className="grid grid-cols-2 gap-2 mt-3">
                          <div className="text-center bg-blue-50/60 p-2 rounded-xl border border-blue-100">
                            <div className="mb-1 text-[11px] font-bold text-blue-900">⏱️ الساعات</div>
                            <input type="number" step="0.5" min="0" value={draft[m.id] ?? ''} onChange={e => setDraft(d => ({ ...d, [m.id]: e.target.value }))}
                              readOnly={dayLocked || dayFuture} disabled={dayLocked || dayFuture}
                              placeholder="—" className="w-full rounded-xl border-2 border-slate-300 px-2 py-2 text-center text-lg font-black outline-none focus:border-slate-900 disabled:bg-slate-100 disabled:text-slate-400" />
                          </div>

                          <div className="text-center bg-amber-50/60 p-2 rounded-xl border border-amber-100">
                            <div className="mb-1 text-[11px] font-bold text-amber-900">🚛 النقلات</div>
                            <input type="number" step="0.5" min="0" value={draftTrips[m.id] ?? ''} onChange={e => setDraftTrips(d => ({ ...d, [m.id]: e.target.value }))}
                              readOnly={dayLocked || dayFuture} disabled={dayLocked || dayFuture}
                              placeholder="—" className="w-full rounded-xl border-2 border-amber-300 px-2 py-2 text-center text-lg font-black outline-none focus:border-amber-600 disabled:bg-slate-100 disabled:text-slate-400" />
                          </div>
                        </div>

                        <div className="mt-3">
                          <div className="mb-1 text-xs font-bold text-slate-500">📝 تقرير الشغل</div>
                          <textarea rows={3} value={draftNotes[m.id] ?? ''} onChange={e => setDraftNotes(d => ({ ...d, [m.id]: e.target.value }))}
                            readOnly={dayLocked || dayFuture} disabled={dayLocked || dayFuture}
                            placeholder="اتعمل إيه؟ (حفر، نقل ردم...)"
                            className="w-full resize-y rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2.5 text-base font-bold outline-none focus:border-slate-900 disabled:bg-slate-100 disabled:text-slate-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <button type="button" onClick={saveDay} disabled={dayLocked || dayFuture}
              className="mt-4 w-full rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-slate-900">
              {dayLocked ? `🔒 يوم ${dayDate} مقفول — للإدارة بس` : dayFuture ? '⏳ استنى اليوم ييجي' : `💾 حفظ ساعات اليوم (${dayDate})`}
            </button>
          </>
        )}
      </section>

      {/* ===== 📊 التراكمي — شيت شهري شبكي (المعدات × أيام الشهر) زي تتبع الحضور ===== */}
      {histList.length > 0 && (
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xl font-black text-slate-900">📊 التراكمي — شيت شهر {month}</h3>
              <p className="text-xs font-bold text-slate-400 mt-1">المساح يسجل ساعات اليوم من فورم التسجيل فوق ⬆️ — بتنزل هنا تلقائي. اضغط على أي يوم لتعديله</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                className="rounded-xl border-2 border-slate-300 px-3 py-2 text-sm font-black outline-none focus:border-slate-900" />
              <button type="button" onClick={exportMonth} className="rounded-xl border-2 border-emerald-500 bg-white px-3 py-1.5 text-xs font-black text-emerald-700 hover:bg-emerald-50">📤 كشف الشهر Excel</button>
              <button type="button" onClick={() => setPrintGrid(true)} className="rounded-xl border-2 border-blue-500 bg-white px-3 py-1.5 text-xs font-black text-blue-700 hover:bg-blue-50">🖨️ طباعة الشيت (رأسي)</button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="text-center text-xs" style={{ minWidth: `${160 + monthDaysCount * 52 + 90}px` }}>
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="sticky right-0 z-10 bg-slate-900 p-2 text-right min-w-[150px]">المعدة</th>
                  {monthDays.map(d => {
                    const dayNum = Number(d.slice(-2));
                    const isToday = d === today;
                    const wd = ['أحد', 'اتنين', 'تلات', 'أربع', 'خميس', 'جمعة', 'سبت'][new Date(d + 'T00:00:00').getDay()];
                    return (
                      <th key={d} title={`${wd} ${d}`}
                        className={`p-1 min-w-[46px] ${isToday ? 'bg-blue-600' : (dayNum % 2 ? 'bg-slate-800/40' : '')}`}
                        style={isToday ? { boxShadow: 'inset 0 0 0 2px #3b82f6' } : undefined}>
                        <div className="font-black">{dayNum}</div>
                        <div className="text-[9px] font-bold opacity-70">{wd.slice(0, 4)}</div>
                      </th>
                    );
                  })}
                  <th className="p-2 bg-blue-700 font-black min-w-[70px]">📅 الشهر</th>
                </tr>
              </thead>
              <tbody>
                {byGroup(histList).map(g => (
                  <React.Fragment key={g.label}>
                    <tr className="bg-slate-100">
                      <td colSpan={monthDaysCount + 2} className="p-1.5 text-right text-[11px] font-black text-slate-500">{g.label} ({g.items.length})</td>
                    </tr>
                    {g.items.map(m => {
                      const grandH = monthGridTotal(m.id);
                      const grandT = monthGridTotalTrips(m.id);
                      return (
                        <tr key={m.id} className="border-b border-slate-100 hover:bg-blue-50/40">
                          <td className="sticky right-0 z-10 bg-white p-2 text-right font-black text-slate-800 shadow-[inset_-8px_0_8px_-6px_rgba(0,0,0,0.08)]"><MName m={m} /></td>
                          {monthDays.map(d => {
                            const v = hoursOf(m.id, d);
                            const tv = tripsOf(m.id, d);
                            const hasVal = v > 0 || tv > 0;
                            const isToday = d === today;
                            const log = isOwnerUser ? getLogInfo(m.id, d) : null;
                            const tooltip = `${v > 0 ? `${v}س` : ''}${v > 0 && tv > 0 ? ' و ' : ''}${tv > 0 ? `${tv} نقلة` : ''}${log ? ` (${log.mainUser})` : ''} — اضغط للتسجيل/التعديل`;
                            return (
                              <td key={d}
                                onClick={() => { setDayDate(d); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                                title={hasVal ? tooltip : 'اضغط للتسجيل لهذا اليوم'}
                                className={`p-1 cursor-pointer font-bold transition-colors ${hasVal ? 'text-emerald-800 bg-emerald-50/70 hover:bg-emerald-100' : 'text-slate-300 hover:bg-slate-100'} ${isToday ? 'ring-2 ring-inset ring-blue-400' : ''}`}>
                                {hasVal ? (
                                  <div className="text-[11px] leading-tight font-black">
                                    {v > 0 && <span>{v}س</span>}
                                    {v > 0 && tv > 0 && <span className="opacity-40"> / </span>}
                                    {tv > 0 && <span className="text-amber-800">{tv}ن</span>}
                                  </div>
                                ) : '·'}
                              </td>
                            );
                          })}
                          <td className={`p-1 font-black ${grandH || grandT ? 'text-blue-700 bg-blue-50' : 'text-slate-300'}`}>
                            {grandH > 0 && <div>{grandH}س</div>}
                            {grandT > 0 && <div className="text-[10px] text-amber-700">{grandT}ن</div>}
                            {!grandH && !grandT && '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-900 text-white font-black">
                  <td className="sticky right-0 z-10 bg-slate-900 p-2 text-right">الإجمالي</td>
                  {monthDays.map(d => {
                    const ht = dayGridTotal(d);
                    const tt = dayGridTotalTrips(d);
                    return (
                      <td key={d} className={`p-1 ${ht || tt ? 'text-emerald-300' : 'opacity-40'}`}>
                        {ht > 0 && <div>{ht}س</div>}
                        {tt > 0 && <div className="text-[9px] text-amber-300">{tt}ن</div>}
                        {!ht && !tt && '·'}
                      </td>
                    );
                  })}
                  <td className="p-1 bg-blue-700">
                    <div>{monthGridGrand}س</div>
                    {monthGridGrandTrips > 0 && <div className="text-[10px] text-amber-200">{monthGridGrandTrips}ن</div>}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-[11px] font-bold text-slate-500">
            <span>🟩 خلية خضرا = فيها ساعات (س) أو نقلات (ن)</span>
            <span>🔵 إطار أزرق = النهارده</span>
            <span>👆 اضغط أي خلية لتروح ليومها وتعدلها</span>
          </div>
        </section>
      )}


      {/* ===== 👤 كشف الملاك ===== */}
      {histList.length > 0 && (
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xl font-black text-slate-900">👤 كشف الملاك — شهر {month}</h3>
            <div className="flex gap-2">
              <button type="button" onClick={exportOwners} className="rounded-xl border-2 border-emerald-500 bg-white px-3 py-1.5 text-xs font-black text-emerald-700 hover:bg-emerald-50">📤 Excel</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200 text-xs font-black text-slate-500">
                  <th className="p-3">المالك</th>
                  <th className="p-3">معداته</th>
                  <th className="p-3">ساعات الشهر</th>
                  <th className="p-3">نقلات الشهر</th>
                  <th className="p-3">إجمالي الساعات</th>
                  <th className="p-3">إجمالي النقلات</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {ownersList.map(o => (
                  <tr key={o.owner} className="border-b border-slate-100 font-bold text-slate-800">
                    <td className="p-3 font-black">👤 {o.owner}</td>
                    <td className="p-3 text-xs text-slate-500">{o.machines.length} معدة — {o.machines.map(mLabel).join('، ')}</td>
                    <td className="p-3 font-black text-blue-700">{o.mon ? `${o.mon} س` : '—'}</td>
                    <td className="p-3 font-black text-amber-700">{o.monTrips ? `${o.monTrips} نقلة` : '—'}</td>
                    <td className="p-3 font-bold">{o.total ? `${o.total} س` : '—'}</td>
                    <td className="p-3 font-bold text-amber-800">{o.totalTrips ? `${o.totalTrips} نقلة` : '—'}</td>
                    <td className="p-3">
                      <button type="button" onClick={() => setPrintOwner(o.owner)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-200">🖨️ كشف للتوقيع</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 font-black text-slate-900">
                  <td className="p-3">الإجمالي</td>
                  <td className="p-3"></td>
                  <td className="p-3 text-blue-700">{ownersList.reduce((s2, o) => s2 + o.mon, 0) || '—'} س</td>
                  <td className="p-3 text-amber-700">{ownersList.reduce((s2, o) => s2 + o.monTrips, 0) || '—'} نقلة</td>
                  <td className="p-3">{ownersList.reduce((s2, o) => s2 + o.total, 0) || '—'} س</td>
                  <td className="p-3 text-amber-800">{ownersList.reduce((s2, o) => s2 + o.totalTrips, 0) || '—'} نقلة</td>
                  <td className="p-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {/* ===== إدارة المعدات ===== */}
      {(
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xl font-black text-slate-900">⚙️ المعدات ({machinery.filter(m => m.active).length})</h3>
            {machinery.length > 0 && isOwnerUser && (
              <button type="button" onClick={async () => { if (!window.confirm('🧹 هتمسح كل المعدات وكل الساعات المسجلة وتبدأ من الصفر — متأكد؟ (مفيش رجوع)')) return; try { await clearAllMachinery(); flash('🧹 اتفضرت كل المعدات من السيرفر — ابدأ من الأول'); load(); setDraft({}); setDraftNotes({}); } catch (err: any) { flash('⛔ ماتفضرتش: ' + (err?.message || 'حصل خطأ')); } }}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-black text-white hover:bg-red-700">🧹 تفريغ كل المعدات</button>
            )}
          </div>
          <p className="mb-4 text-xs font-bold text-slate-500">النوع + المقاس + المالك + السواق — الاسم بيتكون تلقائي زي: لودر 66 زياد</p>
          {canAddMach && (
          <form onSubmit={submitMachinery} className="mb-4 grid gap-3 md:grid-cols-6">
            <label className="text-sm font-black text-slate-700">
              النوع
              <select value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value }))}
                className="mt-1 w-full rounded-xl border-2 border-blue-400 px-3 py-3 text-sm font-bold outline-none focus:border-blue-600">
                {KINDS.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
            {form.kind === 'أخرى' && (
              <label className="text-sm font-black text-slate-700">
                ✍️ اسم المعدة
                <input value={form.custom} onChange={e => setForm(f => ({ ...f, custom: e.target.value }))} placeholder="عربية مية، جرار، كارنية..."
                  list="vsys-custom-kinds"
                  className="mt-1 w-full rounded-xl border-2 border-blue-400 px-3 py-3 text-sm font-bold outline-none focus:border-blue-600" />
                <datalist id="vsys-custom-kinds">
                  {[...new Set(machinery.map(m => m.kind.trim()).filter(k => k && !KINDS.includes(k)))].map(k => <option key={k} value={k} />)}
                </datalist>
              </label>
            )}
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
            <button type="submit" disabled={busy} className="mt-6 rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50">
              {busy ? '⏳ جاري الحفظ على السيرفر...' : form.id ? '✏️ حفظ التعديل' : '➕ إضافة معدة'}
            </button>
          </form>
          )}

          {machinery.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 p-4 text-center text-sm font-bold text-slate-500">مفيش معدات — ضيف أول معدة من الفورم فوق 👇</div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {machinery.filter(m => !m.deleted).map(m => (
                <div key={m.id} className={`flex items-center justify-between gap-2 rounded-xl border-2 p-3 ${m.active ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-60'}`}>
                  <div>
                    <div className="text-sm font-black text-slate-800">{mLabel(m)} {!m.active && <span className="text-[10px] text-slate-400">(متوقفة)</span>}</div>
                    {(m.driver || m.owner) && <div className="text-[11px] font-bold text-slate-400">👤 مالك: {m.owner}{m.driver ? ` · 🚛 سواق: ${m.driver}` : ''}</div>}
                    {m.notes && <div className="text-[11px] font-bold text-slate-400">{m.notes}</div>}
                  </div>
                  {m.active && isOwnerUser && (
                    <div className="flex gap-1">
                      <button type="button" onClick={() => setForm({ id: m.id, kind: KINDS.includes(m.kind) ? m.kind : 'أخرى', custom: KINDS.includes(m.kind) ? '' : m.kind, owner: m.owner, size: m.size, driver: m.driver || '', notes: m.notes || '' })}
                        className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-200" title="تعديل">✏️</button>
                      <button type="button" onClick={async () => { if (!window.confirm(`إيقاف ${mLabel(m)} مؤقت؟ هتشال من ورقة اليوم بس — وساعاتها وتراكميها بيفضلوا`)) return; try { await deactivateMachinery(m.id); flash('⛔ اتوقفت مؤقت على السيرفر — تقدر ترجعها بالتعديل'); load(); } catch (err: any) { flash('⛔ ماتحفظش: ' + (err?.message || 'حصل خطأ')); } }}
                        className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-700 hover:bg-amber-100" title="إيقاف مؤقت">⛔</button>
                      {isOwnerUser && (
                        <button type="button" onClick={async () => { if (!window.confirm(`مسح ${mLabel(m)} خالص؟ هتشال من كل القوائم — بس ساعاتها القديمة هتفضل محفوظة في السجلات`)) return; try { await deleteMachineryHard(m.id); flash('🗑️ اتمسحت من السيرفر — شغلها القديم محفوظ'); load(); } catch (err: any) { flash('⛔ ماتمسحتش: ' + (err?.message || 'حصل خطأ')); } }}
                          className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-black text-red-600 hover:bg-red-100" title="مسح خالص (أدمن بس)">🗑️</button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ===== 🖨️ طباعة الشيت التراكمي — رأسي: الأيام تحت بعضها والمعدات أعمدة ويجمع رأسي ===== */}
      {printGrid && (
        <div className="fixed inset-0 z-[400] overflow-y-auto bg-slate-950/70 p-4" onClick={() => setPrintGrid(false)}>
          <div className="mx-auto max-w-4xl" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex gap-2 print:hidden">
              <button type="button" onClick={() => window.print()} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700">🖨️ طباعة / حفظ PDF</button>
              <button type="button" onClick={() => setPrintGrid(false)} className="rounded-xl bg-white px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-100">إغلاق</button>
            </div>
            <div className="print-sheet rounded-2xl bg-white p-6 text-slate-900 shadow-2xl" dir="rtl">
              <div className="border-b-4 border-double border-slate-900 pb-3 text-center">
                <div className="text-lg font-black">{deptName}</div>
                <div className="mt-1 text-2xl font-black">📊 شيت ساعات ونقلات المعدات — شهر {month}</div>
              </div>
              <table className="mt-4 w-full border-collapse text-[11px]">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-400 p-1.5 w-24">📅 اليوم</th>
                    {histList.map(m => (
                      <th key={m.id} className="border border-slate-400 p-1.5">
                        <div>{[m.kind, m.size].filter(Boolean).join(' ')}</div>
                        <div className="text-[9px] font-normal text-slate-500">{m.owner}{m.driver ? ` — ${m.driver}` : ''}</div>
                      </th>
                    ))}
                    <th className="border border-slate-400 bg-slate-800 p-1.5 text-white w-20">اليومي</th>
                  </tr>
                </thead>
                <tbody>
                  {monthDays.map((d, i) => {
                    const wd = ['أحد', 'اتنين', 'تلات', 'أربع', 'خميس', 'جمعة', 'سبت'][new Date(d + 'T00:00:00').getDay()];
                    const dayT = dayGridTotal(d);
                    const dayTT = dayGridTotalTrips(d);
                    return (
                      <tr key={d} className={i % 2 ? 'bg-slate-50' : ''}>
                        <td className="border border-slate-300 p-1.5 font-black whitespace-nowrap">{d.slice(8)} — {wd}</td>
                        {histList.map(m => {
                          const v = hoursOf(m.id, d);
                          const tv = tripsOf(m.id, d);
                          return (
                            <td key={m.id} className={`border border-slate-300 p-1.5 text-center font-black ${v || tv ? 'text-slate-900' : 'text-slate-300'}`}>
                              {v > 0 && <span>{v}س</span>}
                              {v > 0 && tv > 0 && <span> / </span>}
                              {tv > 0 && <span className="text-amber-800">{tv}ن</span>}
                              {!v && !tv && '—'}
                            </td>
                          );
                        })}
                        <td className={`border border-slate-300 p-1.5 text-center font-black ${dayT || dayTT ? 'bg-blue-50 text-blue-800' : 'text-slate-300'}`}>
                          {dayT > 0 && <span>{dayT}س</span>}
                          {dayT > 0 && dayTT > 0 && <span> / </span>}
                          {dayTT > 0 && <span className="text-amber-800">{dayTT}ن</span>}
                          {!dayT && !dayTT && '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-900 text-white">
                    <td className="border border-slate-400 p-2 font-black">إجمالي الشهر</td>
                    {histList.map(m => {
                      const t = monthGridTotal(m.id);
                      const tt = monthGridTotalTrips(m.id);
                      return (
                        <td key={m.id} className={`border border-slate-400 p-2 text-center font-black ${t || tt ? 'text-emerald-300' : 'opacity-40'}`}>
                          {t > 0 && <div>{t}س</div>}
                          {tt > 0 && <div className="text-[9px] text-amber-200">{tt}ن</div>}
                          {!t && !tt && '—'}
                        </td>
                      );
                    })}
                    <td className="border border-slate-400 bg-blue-700 p-2 text-center font-black">
                      <div>{monthGridGrand}س</div>
                      {monthGridGrandTrips > 0 && <div className="text-[10px] text-amber-200">{monthGridGrandTrips}ن</div>}
                    </td>
                  </tr>
                </tfoot>
              </table>
              <div className="mt-4 flex justify-between text-[11px] font-bold text-slate-500">
                <span>إجمالي الشهر: <b className="text-slate-900">{monthGridGrand}</b> ساعة {monthGridGrandTrips > 0 && <>· <b className="text-amber-800">{monthGridGrandTrips}</b> نقلة</>}</span>
                <span>تاريخ الطباعة: {today}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== 🖨️ كشف مالك للتوقيع ===== */}
      {printOwner && (
        <div className="fixed inset-0 z-[400] overflow-y-auto bg-slate-950/70 p-4" onClick={() => setPrintOwner(null)}>
          <div className="mx-auto max-w-2xl" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex gap-2 print:hidden">
              <button type="button" onClick={() => window.print()} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700">🖨️ طباعة / حفظ PDF</button>
              <button type="button" onClick={() => setPrintOwner(null)} className="rounded-xl bg-white px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-100">إغلاق</button>
            </div>
            {(() => {
              const o = ownersList.find(x => x.owner === printOwner);
              if (!o) return null;
              return (
                <div className="print-sheet rounded-2xl bg-white p-8 text-slate-900 shadow-2xl" dir="rtl">
                  <div className="border-b-4 border-double border-slate-900 pb-3 text-center">
                    <div className="text-lg font-black">{deptName}</div>
                    <div className="mt-1 text-2xl font-black">كشف ساعات ونقلات معدات — شهر {month}</div>
                  </div>
                  <div className="mt-4 space-y-2 text-base font-bold">
                    <div>👤 المالك: <b className="text-lg">{o.owner}</b></div>
                    <div>🚜 عدد المعدات: <b>{o.machines.length}</b></div>
                    <div className="flex flex-wrap justify-between border-b border-dashed border-slate-300 pb-2 text-sm">
                      <span>ساعات الشهر: <b>{o.mon || 0} س</b></span>
                      <span>نقلات الشهر: <b>{o.monTrips || 0} نقلة</b></span>
                      <span>إجمالي الساعات: <b>{o.total || 0} س</b></span>
                      <span>إجمالي النقلات: <b>{o.totalTrips || 0} نقلة</b></span>
                    </div>
                  </div>
                  <table className="mt-4 w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-100">
                        <th className="border border-slate-400 p-2">م</th>
                        <th className="border border-slate-400 p-2">المعدة</th>
                        <th className="border border-slate-400 p-2">السواق</th>
                        <th className="border border-slate-400 p-2">أيام الشغل</th>
                        <th className="border border-slate-400 p-2">ساعات الشهر</th>
                        <th className="border border-slate-400 p-2">نقلات الشهر</th>
                      </tr>
                    </thead>
                    <tbody>
                      {o.machines.map((m, i) => (
                        <tr key={m.id}>
                          <td className="border border-slate-400 p-2 text-center">{i + 1}</td>
                          <td className="border border-slate-400 p-2 font-black">{m.kind}{m.size ? ` ${m.size}` : ''}</td>
                          <td className="border border-slate-400 p-2">{m.driver || '—'}</td>
                          <td className="border border-slate-400 p-2 text-center">{workDays(m)}</td>
                          <td className="border border-slate-400 p-2 text-center font-black">{totalsFor(m).mon || '—'}</td>
                          <td className="border border-slate-400 p-2 text-center font-black text-amber-800">{totalsFor(m).monTrips || '—'}</td>
                        </tr>
                      ))}
                      <tr className="bg-slate-50">
                        <td className="border border-slate-400 p-2 text-center font-black" colSpan={4}>الإجمالي</td>
                        <td className="border border-slate-400 p-2 text-center font-black">{o.mon || '—'}</td>
                        <td className="border border-slate-400 p-2 text-center font-black text-amber-800">{o.monTrips || '—'}</td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="mt-10 grid grid-cols-3 gap-4 text-center text-sm font-black">
                    <div className="border-t border-slate-800 pt-2">مدير المعدات</div>
                    <div className="border-t border-slate-800 pt-2">السواق</div>
                    <div className="border-t border-slate-800 pt-2">المالك</div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
