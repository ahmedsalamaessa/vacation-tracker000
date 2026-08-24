import { useState } from 'react';
import {
  getSettings, updateSettings, getEmployees, getVacations, getLocations,
  getAttendance, getCheckInAttempts, getAuditLogs, getMonthLocks,
  addLocation, updateLocation, deleteLocation,
  clearAllData, getStorageInfo, importLocalData,
  cleanOldCheckInAttempts, dedupeAttendance,
} from '../lib/db';
import { sha256 } from '../lib/crypto';
import { calculateEmployeeBalance } from '../lib/balance';
import type { WorkLocation, Settings } from '../lib/types';

// ============ تشخيص المشاكل ============
interface Issue {
  id: string;
  severity: 'critical' | 'warning' | 'info' | 'ok';
  title: string;
  description: string;
  fix?: string;
  fixLabel?: string;
  onFix?: () => void;
}

export default function SettingsTab() {
  // حالة القفل
  const [unlocked, setUnlocked] = useState(false);
  const [gatePassword, setGatePassword] = useState('');
  const [gateError, setGateError] = useState('');

  // حالة الإعدادات
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // حالة المواقع
  const [locations, setLocationsState] = useState<WorkLocation[]>([]);
  const [locForm, setLocForm] = useState({ id: 0, name: '', lat: '', lng: '', radiusMeters: 1000, active: true, notes: '' });
  const [locMsg, setLocMsg] = useState('');

  // حالة التشخيص
  const [issues, setIssues] = useState<Issue[]>([]);
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagResult, setDiagResult] = useState<'ok' | 'warnings' | 'critical' | null>(null);

  // حالة الاستيراد
  const [importMsg, setImportMsg] = useState('');

  // حالة إعادة التهيئة
  const [resetConfirm, setResetConfirm] = useState(false);

  // حالة النافذة
  const [activeSection, setActiveSection] = useState<'general' | 'locations' | 'diagnostics' | 'backup' | 'reset'>('general');

  // ============ فتح الإعدادات ============
  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setGateError('');
    const settings = getSettings();
    const storedPassword = settings.settings_password || '';
    const hashedInput = 'sha256:' + await sha256(gatePassword);
    const isDefaultUnchanged = !storedPassword || storedPassword === 'settings123';
    const isValid = storedPassword.startsWith('sha256:')
      ? hashedInput === storedPassword
      : gatePassword === storedPassword;

    if (isValid || (isDefaultUnchanged && gatePassword === 'settings123')) {
      if (!storedPassword.startsWith('sha256:')) {
        updateSettings({ settings_password: hashedInput });
      }
      setUnlocked(true);
      loadAll();
    } else {
      setGateError('كلمة مرور الإعدادات غير صحيحة');
    }
  }

  function loadAll() {
    const settings = getSettings();
    const merged: Record<string, string> = {};
    const defaults = [
      { key: 'department_name', val: 'قسم المساحة' },
      { key: 'work_radius', val: '1000' },
      { key: 'default_work_cycle', val: '12' },
      { key: 'stage1_days', val: '12' },
      { key: 'stage1_vacation', val: '3' },
      { key: 'annual_leave_balance', val: '21' },
      { key: 'casual_annual_quota', val: '6' },
      { key: 'footer_text', val: 'نظام إدارة الإجازات • قسم المساحة' },
      { key: 'settings_password', val: settings.settings_password || 'settings123' },
    ];
    for (const d of defaults) merged[d.key] = settings[d.key as keyof Settings] || d.val;
    setValues(merged);
    setLocationsState(getLocations());
  }

  // ============ حفظ إعداد ============
  function saveField(key: string) {
    setSaving(key);
    setSaved(null);
    updateSettings({ [key]: values[key] || '' } as any);
    setTimeout(() => {
      setSaving(null);
      setSaved(key);
      setTimeout(() => setSaved(null), 1800);
    }, 300);
  }

  // ============ إدارة المواقع ============
  function saveLocation(e: React.FormEvent) {
    e.preventDefault();
    setLocMsg('');
    const data = {
      name: locForm.name.trim(),
      lat: locForm.lat === '' ? null : Number(locForm.lat),
      lng: locForm.lng === '' ? null : Number(locForm.lng),
      radiusMeters: locForm.radiusMeters || 1000,
      active: locForm.active,
      notes: locForm.notes || null,
    };
    if (locForm.id) {
      updateLocation(locForm.id, data);
      setLocMsg('✅ تم تعديل الموقع');
    } else {
      addLocation(data);
      setLocMsg('✅ تم إضافة الموقع');
    }
    setLocForm({ id: 0, name: '', lat: '', lng: '', radiusMeters: 1000, active: true, notes: '' });
    setLocationsState(getLocations());
    setTimeout(() => setLocMsg(''), 3000);
  }

  function editLocation(loc: WorkLocation) {
    setLocForm({ id: loc.id, name: loc.name, lat: loc.lat == null ? '' : String(loc.lat), lng: loc.lng == null ? '' : String(loc.lng), radiusMeters: loc.radiusMeters, active: loc.active, notes: loc.notes || '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function removeLocation(id: number) {
    if (!confirm('حذف هذا الموقع؟')) return;
    deleteLocation(id);
    setLocMsg('🗑️ تم حذف الموقع');
    setLocationsState(getLocations());
  }

  function useMyLocation() {
    if (!navigator.geolocation) { alert('لا يدعم'); return; }
    navigator.geolocation.getCurrentPosition(
      pos => setLocForm(p => ({ ...p, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) })),
      () => alert('تعذر'),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  // ============ التشخيص الشامل ============
  function runDiagnostics() {
    setDiagRunning(true);
    setDiagResult(null);
    const foundIssues: Issue[] = [];
    const employees = getEmployees();
    const attendance = getAttendance();
    const vacations = getVacations();
    const locations = getLocations();
    const attempts = getCheckInAttempts();
    const logs = getAuditLogs();

    // 1) Storage
    const storage = getStorageInfo();
    if (storage.percentage > 80) {
      foundIssues.push({
        id: 'storage-high',
        severity: 'critical',
        title: `⚠️ مساحة التخزين مرتفعة (${storage.percentage}%)`,
        description: `مستخدم ${(storage.used / 1024 / 1024).toFixed(2)} MB من ${(storage.limit / 1024 / 1024).toFixed(0)} MB. لو امتلأ النظام هيتوقف عن الحفظ.`,
        fix: 'حذف البيانات القديمة',
        fixLabel: 'حذف بصمات أقدم من 90 يوم',
        onFix: () => {
          // ⚠️ متحذفش حضور/إجازات قديمة — دي مصدر حساب الرصيد!
          // التنظيف الآمن = البصمات القديمة (سجلات تشخيصية بتاخد أكبر مساحة)
          const removed = cleanOldCheckInAttempts(90, false);
          alert(removed > 0
            ? `🗑️ اتحذفت ${removed} بصمة قديمة (محليًا وعلى السيرفر)`
            : 'مفيش بصمات أقدم من 90 يوم — المساحة غالبًا من بيانات تانية');
          runDiagnostics();
        },
      });
    } else {
      foundIssues.push({ id: 'storage-ok', severity: 'ok', title: `✅ مساحة التخزين طبيعية (${storage.percentage}%)`, description: `${(storage.used / 1024).toFixed(1)} KB مستخدم` });
    }

    // 2) مدير النظام موجود — بالدور مش باسم المستخدم
    // (كان الفحص بيدور على username === 'admin' حرفيًا فبيطلع إنذار كاذب
    //  لو المدير اسم دخوله مختلف — زي Eng Ahmed Salama)
    const adminExists = employees.some(e => e.active && e.role === 'admin');
    if (!adminExists) {
      foundIssues.push({
        id: 'no-admin',
        severity: 'critical',
        title: '❌ مش موجود مدير للنظام',
        description: 'مفيش أي موظف فعّال دوره admin — مش هتقدر تدخل الإعدادات أو تدير النظام.',
        fix: 'إعادة تهيئة المدير',
        fixLabel: 'إصلاح',
        onFix: () => {
          clearAllData();
          window.location.reload();
        },
      });
    } else {
      const adminName = employees.find(e => e.active && e.role === 'admin')?.name || '';
      foundIssues.push({ id: 'admin-ok', severity: 'ok', title: '✅ مدير النظام موجود', description: adminName });
    }

    // 3) مواقع فعالة
    const activeLocs = locations.filter(l => l.active);
    if (activeLocs.length === 0) {
      foundIssues.push({
        id: 'no-locations',
        severity: 'critical',
        title: '❌ مفيش مواقع فعالة للبصمة',
        description: 'من غير مواقع، البصمة هتفشل أو هتتحفظ بدون GPS.',
        fix: 'أضف موقع Naya Bay أو Beach 5',
        fixLabel: 'أضف مواقع افتراضية',
        onFix: () => {
          addLocation({ name: 'Naya Bay', lat: 27.0574, lng: 33.8129, radiusMeters: 1000, active: true, notes: '' });
          addLocation({ name: 'Beach 5', lat: 27.0612, lng: 33.8215, radiusMeters: 1000, active: true, notes: '' });
          setLocationsState(getLocations());
          runDiagnostics();
        },
      });
    } else {
      const withCoords = activeLocs.filter(l => l.lat && l.lng);
      if (withCoords.length === 0) {
        foundIssues.push({
          id: 'no-coords',
          severity: 'warning',
          title: '⚠️ المواقع مش فيها إحداثيات GPS',
          description: 'البصمة هتشتغل لكن من غير حساب مسافة — أي حد يبصم من أي مكان.',
        });
      } else {
        foundIssues.push({ id: 'locs-ok', severity: 'ok', title: `✅ ${activeLocs.length} موقع فعّال`, description: withCoords.length + ' موقع بإحداثيات' });
      }
    }

    // 4) موظفين نشطين
    const activeEmps = employees.filter(e => e.active);
    if (activeEmps.length === 0) {
      foundIssues.push({ id: 'no-emps', severity: 'critical', title: '❌ مفيش موظفين نشطين', description: 'أضف موظفين عشان النظام يشتغل.' });
    } else {
      const withoutPassword = activeEmps.filter(e => !e.password);
      if (withoutPassword.length > 0) {
        foundIssues.push({
          id: 'no-passwords',
          severity: 'warning',
          title: `⚠️ ${withoutPassword.length} موظف من غير كلمة مرور`,
          description: `هؤلاء مش هيقدر يسجل دخول: ${withoutPassword.map(e => e.name).join('، ')}`,
        });
      }
      foundIssues.push({ id: 'emps-ok', severity: 'ok', title: `✅ ${activeEmps.length} موظف نشط`, description: '' });
    }

    // 5) إجازات معلقة
    const pending = vacations.filter(v => v.status === 'بانتظار الموافقة');
    if (pending.length > 0) {
      foundIssues.push({
        id: 'pending-vacs',
        severity: 'warning',
        title: `⚠️ ${pending.length} إجازة معلقة`,
        description: 'روح لتبويب "الاعتمادات" ووافق أو ارفض.',
      });
    } else {
      foundIssues.push({ id: 'pending-ok', severity: 'ok', title: '✅ مفيش إجازات معلقة', description: 'كل الطلبات متعالج.' });
    }

    // 6) رصيد سالب — بنفس معادلة تبويب "رصيد الإجازات" الموحدة
    // (كانت بتستخدم معادلة قديمة مختلفة بتطلع أبرياء بالسالب
    //  وبتحسب حتى السنوية والرسمية كأيام مأخوذة)
    let negCount = 0;
    for (const emp of activeEmps) {
      const empAtt = attendance.filter(a => a.employeeId === emp.id);
      const empVac = vacations.filter(v => v.employeeId === emp.id);
      const balanceData = calculateEmployeeBalance(empAtt, empVac);
      if (balanceData.netBalance < 0) negCount++;
    }
    if (negCount > 0) {
      foundIssues.push({ id: 'neg-balance', severity: 'warning', title: `⚠️ ${negCount} موظف رصيده سالب`, description: 'لازم يواظبوا على الحضور لتغطية العجز.' });
    } else {
      foundIssues.push({ id: 'balance-ok', severity: 'ok', title: '✅ مفيش رصيد سالب', description: '' });
    }

    // 7) بصمات مرفوضة كثيرة
    const failedAttempts = attempts.filter(a => !a.success);
    if (failedAttempts.length > 50) {
      foundIssues.push({
        id: 'too-many-failed',
        severity: 'warning',
        title: `⚠️ ${failedAttempts.length} بصمة مرفوضة`,
        description: 'ممكن يكون النطاق صغير أو الموظفين بيبصموا من أماكن بعيدة.',
        fix: 'تنظيف البصمات المرفوضة',
        fixLabel: 'حذف بصمات أقدم من 30 يوم',
        onFix: () => {
          const removed = cleanOldCheckInAttempts(30, true);
          alert(removed > 0
            ? `🗑️ اتحذفت ${removed} بصمة مرفوضة أقدم من 30 يوم (محليًا وعلى السيرفر)`
            : 'مفيش بصمات مرفوضة أقدم من 30 يوم');
          runDiagnostics();
        },
      });
    }

    // 8) سجل الحركات
    if (logs.length === 0) {
      foundIssues.push({ id: 'no-audit', severity: 'info', title: 'ℹ️ مفيش سجل حركات', description: 'النظام جديد أو السجل اتمسح.' });
    }

    // 9) بيانات مكررة
    const attKeys = new Set<string>();
    let dupes = 0;
    for (const a of attendance) {
      const key = `${a.employeeId}-${a.date}`;
      if (attKeys.has(key)) dupes++;
      attKeys.add(key);
    }
    if (dupes > 0) {
      foundIssues.push({
        id: 'duplicate-attendance',
        severity: 'warning',
        title: `⚠️ ${dupes} سجل حضور مكرر`,
        description: 'في نفس اليوم والموظف مسجل أكتر من مرة.',
        fix: 'إزالة التكرار',
        fixLabel: 'إصلاح',
        onFix: () => {
          const removed = dedupeAttendance();
          alert(removed > 0 ? `🧹 اتحذف ${removed} سجل مكرر` : 'مفيش سجلات مكررة');
          runDiagnostics();
        },
      });
    } else {
      foundIssues.push({ id: 'no-dupes', severity: 'ok', title: '✅ مفيش بيانات مكررة', description: '' });
    }

    setIssues(foundIssues);
    const hasCritical = foundIssues.some(i => i.severity === 'critical');
    const hasWarning = foundIssues.some(i => i.severity === 'warning');
    setDiagResult(hasCritical ? 'critical' : hasWarning ? 'warnings' : 'ok');
    setDiagRunning(false);
  }

  // ============ النسخ الاحتياطي ============
  function downloadBackup() {
    const data = {
      version: 2,
      exportedAt: new Date().toISOString(),
      employees: getEmployees(),
      locations: getLocations(),
      attendance: getAttendance(),
      vacations: getVacations(),
      settings: getSettings(),
      auditLogs: getAuditLogs(),
      checkInAttempts: getCheckInAttempts(),
      monthLocks: getMonthLocks(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importBackup(e: React.ChangeEvent<HTMLInputElement>) {
    setImportMsg('');
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (!data.version || !data.employees) throw new Error('invalid');
        if (!confirm(`سيتم استبدال كل البيانات بالملف. متأكد؟`)) return;
        clearAllData();
        // 🐛 إصلاح: الكتابة بالمفاتيح الصحيحة vsys_* عبر دالة موحدة
        importLocalData(data);
        setImportMsg('✅ تم استعادة النسخة بنجاح! هتعمل Refresh...');
        setTimeout(() => window.location.reload(), 2000);
      } catch {
        setImportMsg('❌ الملف تالف أو مش نسخة صالحة');
      }
    };
    reader.readAsText(file);
  }

  // ============ إعادة التهيئة ============
  function fullReset() {
    if (!resetConfirm) {
      setResetConfirm(true);
      setTimeout(() => setResetConfirm(false), 5000);
      return;
    }
    clearAllData();
    localStorage.setItem('vacation_system_initialized_v4', 'true');
    window.location.reload();
  }

  // ============ تغيير باسورد الإعدادات ============
  async function changeSettingsPassword() {
    const newPass = prompt('كلمة المرور الجديدة للإعدادات (6 أحرف على الأقل):');
    if (!newPass || newPass.length < 6) { alert('قصيرة'); return; }
    updateSettings({ settings_password: 'sha256:' + await sha256(newPass) });
    setGatePassword('');
    alert('✅ تم تغيير باسورد الإعدادات');
  }

  // ============ شاشة القفل ============
  if (!unlocked) {
    return (
      <div className="mx-auto flex min-h-[62vh] max-w-3xl items-center justify-center px-4">
        <form onSubmit={unlock} className="w-full rounded-[2.2rem] border-4 border-slate-900 bg-white px-8 py-10 text-center shadow-2xl shadow-slate-200 md:px-14 md:py-14">
          <div className="mx-auto mb-8 flex h-28 w-28 items-center justify-center rounded-[2rem] bg-gradient-to-br from-amber-400 to-orange-500 text-5xl shadow-2xl shadow-orange-100">🔐</div>
          <h2 className="text-3xl font-black text-slate-950">الإعدادات محمية</h2>
          <p className="mt-3 text-sm font-bold text-slate-500">أدخل كلمة مرور الإعدادات</p>
          {gateError && <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{gateError}</div>}
          <input type="password" value={gatePassword} onChange={(e) => setGatePassword(e.target.value)} placeholder="كلمة مرور الإعدادات..." className="mt-8 w-full rounded-2xl border-4 border-indigo-200 bg-white px-6 py-4 text-center text-lg font-bold outline-none transition focus:border-indigo-500" autoFocus />
          <button type="submit" className="mt-6 w-full rounded-2xl bg-gradient-to-l from-blue-600 to-violet-600 px-6 py-4 text-lg font-black text-white shadow-2xl shadow-blue-100 transition hover:scale-[1.01]">فتح الإعدادات 🔓</button>
          <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-bold text-slate-500">الافتراضية: <b>settings123</b></div>
        </form>
      </div>
    );
  }

  // ============ شاشة الإعدادات ============
  const sectionTabs = [
    { key: 'general' as const, label: '⚙️ عام', emoji: 'عام' },
    { key: 'locations' as const, label: '📍 المواقع', emoji: 'المواقع' },
    { key: 'diagnostics' as const, label: '🔍 تشخيص وحلول', emoji: 'تشخيص' },
    { key: 'backup' as const, label: '💾 نسخ احتياطي', emoji: 'باك اب' },
    { key: 'reset' as const, label: '⚠️ إعادة تهيئة', emoji: 'ريسيت' },
  ];

  return (
    <div className="w-full space-y-6 pb-12">
      {/* Section Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {sectionTabs.map(t => (
          <button key={t.key} onClick={() => setActiveSection(t.key)} className={`shrink-0 px-4 py-2 rounded-xl text-sm font-black border transition ${activeSection === t.key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>{t.label}</button>
        ))}
      </div>

      {/* ============ عام ============ */}
      {activeSection === 'general' && (
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <div className="mb-6 flex items-center justify-between">
            <div><h2 className="text-xl font-black text-slate-950">⚙️ الإعدادات العامة</h2><p className="mt-1 text-xs font-bold text-slate-500">تحكم في إعدادات القسم</p></div>
            <button onClick={changeSettingsPassword} className="rounded-xl bg-amber-100 px-4 py-2 text-xs font-black text-amber-800 hover:bg-amber-200">🔑 تغيير باسورد الإعدادات</button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {([
              { key: 'department_name', label: 'اسم القسم', placeholder: 'قسم المساحة', badge: '🏢 عام', hint: 'يظهر في التقارير' },
              { key: 'work_radius', label: 'نطاق البصمة (متر)', placeholder: '1000', badge: '📍 بصمة', hint: 'المسافة المسموحة حول الموقع' },
              { key: 'default_work_cycle', label: 'دورة العمل (يوم)', placeholder: '12', badge: '🔁 دورة', hint: 'لنظام ثابت' },
              { key: 'stage1_days', label: 'أيام المرحلة 1', placeholder: '12', badge: '1️⃣ مرحلة', hint: 'لنظام الإجازات المتدرج' },
              { key: 'stage1_vacation', label: 'إجازة المرحلة 1', placeholder: '3', badge: '🏖️ إجازة', hint: 'أيام إجازة بعد 12 يوم' },
              { key: 'annual_leave_balance', label: 'رصيد سنوي', placeholder: '21', badge: '🎉 سنوية', hint: 'إجمالي الرصيد السنوي' },
              { key: 'casual_annual_quota', label: 'رصيد العارضة السنوي', placeholder: '6', badge: '⚡ عارضة', hint: 'سنة العارضة من 21 ديسمبر لـ 20 ديسمبر' },
              { key: 'footer_text', label: 'توقيع أسفل النظام', placeholder: '...', badge: '✍️ توقيع', hint: 'يظهر في التقارير' },
            ] as { key: string; label: string; placeholder: string; badge: string; hint: string }[]).map(field => (
              <div key={field.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="text-sm font-black text-slate-700">{field.label}</label>
                  <span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold text-slate-500 shadow-sm">{field.badge}</span>
                </div>
                <input type="text" value={values[field.key] ?? ''} placeholder={field.placeholder} onChange={(e) => setValues(prev => ({ ...prev, [field.key]: e.target.value }))} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-indigo-500" />
                <div className="mt-3 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-bold text-slate-400">{field.hint}</p>
                  <button onClick={() => saveField(field.key)} disabled={saving === field.key} className={`rounded-lg px-4 py-2 text-[11px] font-black text-white ${saved === field.key ? 'bg-green-600' : 'bg-slate-900 hover:bg-indigo-700'} disabled:opacity-60`}>
                    {saving === field.key ? '...' : saved === field.key ? '✓ تم' : 'حفظ'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============ المواقع ============ */}
      {activeSection === 'locations' && (
        <div className="space-y-5">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <div className="mb-5 flex items-center justify-between">
              <div><h2 className="text-xl font-black text-slate-950">📍 مواقع العمل للبصمة</h2><p className="mt-1 text-xs font-bold text-slate-500">أضف وعدّل واحذف مواقع البصمة</p></div>
              <button onClick={useMyLocation} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-700">📡 موقعي الحالي</button>
            </div>
            {locMsg && <div className="mb-4 rounded-xl bg-blue-50 px-4 py-3 text-center text-sm font-bold text-blue-700">{locMsg}</div>}
            <form onSubmit={saveLocation} className="mb-5 grid gap-3 md:grid-cols-2">
              <input value={locForm.name} onChange={(e) => setLocForm({ ...locForm, name: e.target.value })} placeholder="اسم الموقع" className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold outline-none" required />
              <input type="number" value={locForm.radiusMeters} onChange={(e) => setLocForm({ ...locForm, radiusMeters: Number(e.target.value) })} placeholder="نطاق بالمتر" className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold outline-none" />
              <input value={locForm.lat} onChange={(e) => setLocForm({ ...locForm, lat: e.target.value })} placeholder="lat" className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold outline-none" />
              <input value={locForm.lng} onChange={(e) => setLocForm({ ...locForm, lng: e.target.value })} placeholder="lng" className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold outline-none" />
              <input value={locForm.notes} onChange={(e) => setLocForm({ ...locForm, notes: e.target.value })} placeholder="ملاحظات" className="md:col-span-2 rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold outline-none" />
              <label className="flex items-center gap-2 text-sm font-bold text-slate-600"><input type="checkbox" checked={locForm.active} onChange={(e) => setLocForm({ ...locForm, active: e.target.checked })} />مفعل</label>
              <button className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-black text-white hover:bg-slate-700">{locForm.id ? '💾 حفظ التعديل' : '➕ إضافة موقع'}</button>
            </form>
          </div>
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-xl font-black text-slate-900">المواقع الحالية ({locations.length})</h3>
            {locations.length === 0 ? <div className="rounded-2xl bg-amber-50 p-6 text-center font-bold text-amber-700">لا توجد مواقع</div> : (
              <div className="grid gap-4 md:grid-cols-2">
                {locations.map(loc => (
                  <div key={loc.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between">
                      <b className="text-slate-900">{loc.name}</b>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${loc.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{loc.active ? 'مفعل' : 'موقف'}</span>
                    </div>
                    <div className="mt-2 text-xs font-bold text-slate-500">lat: {loc.lat ?? '—'} · lng: {loc.lng ?? '—'} · نطاق: {loc.radiusMeters}م</div>
                    {loc.notes && <div className="mt-1 text-xs text-slate-400">{loc.notes}</div>}
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => editLocation(loc)} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white">✏️ تعديل</button>
                      {loc.lat && <a href={`https://www.google.com/maps?q=${loc.lat},${loc.lng}`} target="_blank" className="rounded-lg bg-blue-50 px-4 py-2 text-xs font-bold text-blue-700">🗺️ خريطة</a>}
                      <button onClick={() => removeLocation(loc.id)} className="rounded-lg bg-red-50 px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-100">🗑️ حذف</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============ تشخيص وحلول ============ */}
      {activeSection === 'diagnostics' && (
        <div className="space-y-5">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-950">🔍 تشخيص وحلول المشاكل</h2>
                <p className="mt-1 text-xs font-bold text-slate-500">اكتشف المشاكل وحلها بضغطة واحدة</p>
              </div>
              <button onClick={runDiagnostics} disabled={diagRunning} className={`rounded-xl px-6 py-3 text-sm font-black transition ${diagRunning ? 'bg-slate-300 text-slate-500' : 'bg-slate-900 text-white hover:bg-slate-700'}`}>
                {diagRunning ? '⏳ جاري الفحص...' : diagResult ? '🔄 إعادة فحص' : '🔍 تشغيل التشخيص'}
              </button>
            </div>

            {diagResult && (
              <div className={`mb-5 rounded-2xl p-4 border ${diagResult === 'critical' ? 'bg-red-50 border-red-200' : diagResult === 'warnings' ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{diagResult === 'critical' ? '🔴' : diagResult === 'warnings' ? '🟡' : '🟢'}</span>
                  <div>
                    <div className={`font-black text-lg ${diagResult === 'critical' ? 'text-red-700' : diagResult === 'warnings' ? 'text-amber-700' : 'text-green-700'}`}>
                      {diagResult === 'critical' ? 'مشاكل حرجة تحتاج تدخل فوري' : diagResult === 'warnings' ? 'فيه مشاكل تحتاج انتباه' : 'النظام سليم 100%'}
                    </div>
                    <div className="text-xs font-bold text-slate-500 mt-1">{issues.filter(i => i.severity === 'critical').length} حرجة · {issues.filter(i => i.severity === 'warning').length} تحذيرات · {issues.filter(i => i.severity === 'ok').length} سليم</div>
                  </div>
                </div>
              </div>
            )}

            {!diagResult && !diagRunning && (
              <div className="rounded-2xl bg-slate-50 p-10 text-center border border-slate-200">
                <div className="text-5xl mb-3">🔍</div>
                <div className="font-black text-slate-700 text-lg">دوس "تشغيل التشخيص"</div>
                <div className="mt-2 text-sm font-bold text-slate-500">هيتفحص كل جزء في النظام ويقترح حلول</div>
              </div>
            )}

            {issues.length > 0 && (
              <div className="space-y-3">
                {issues.map(issue => (
                  <div key={issue.id} className={`rounded-2xl border p-4 flex items-start gap-4 ${
                    issue.severity === 'critical' ? 'border-red-200 bg-red-50' :
                    issue.severity === 'warning' ? 'border-amber-200 bg-amber-50' :
                    issue.severity === 'info' ? 'border-blue-200 bg-blue-50' :
                    'border-green-200 bg-green-50'
                  }`}>
                    <div className="flex-1">
                      <div className={`font-black ${
                        issue.severity === 'critical' ? 'text-red-800' :
                        issue.severity === 'warning' ? 'text-amber-800' :
                        issue.severity === 'info' ? 'text-blue-800' :
                        'text-green-800'
                      }`}>{issue.title}</div>
                      {issue.description && <div className={`mt-1 text-sm font-bold ${
                        issue.severity === 'critical' ? 'text-red-600' :
                        issue.severity === 'warning' ? 'text-amber-600' :
                        issue.severity === 'info' ? 'text-blue-600' :
                        'text-green-600'
                      }`}>{issue.description}</div>}
                    </div>
                    {issue.onFix && (
                      <button onClick={issue.onFix} className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-xs font-black text-white hover:bg-slate-700">
                        {issue.fixLabel || 'إصلاح'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* جدول المشاكل الشائعة وحلولها */}
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-black text-slate-900">📋 دليل المشاكل الشائعة وحلولها</h3>
            <div className="space-y-3">
              {[
                { q: '🔒 مش قادر أدخل الإعدادات', a: 'تأكد إن باسورد الإعدادات صح (الافتراضي: settings123). لو نسيته، روح لتبويب "نسخ احتياطي" وخد باك أب وبعدين اعمل إعادة تهيئة.' },
                { q: '❌ البصمة بتترفض دايمًا', a: 'روح للإعدادات > المواقع وتأكد إن الموقع فيه lat/lng صح. جرب تزود "نطاق البصمة" لو الموظفين بعيد.' },
                { q: '⏳ طلبات الإجازة مش بتظهر للإدارة', a: 'تأكد إن الموظف عامل "طلب إجازة" مش "جدولة" — الجدولة للأدمن فقط. المدير بيلاقي الطلبات في تبويب "الاعتمادات".' },
                { q: '📊 رصيد الإجازات مش بيتحدث', a: 'دوس "تحديث" في صفحة الرصيد. لو مش شغال، روح لـ "تشخيص" وادوس "إزالة التكرار".' },
                { q: '💾 النظام بيقول "خطأ في الحفظ"', a: 'ده معناه localStorage امتلأ. روح لـ "تشخيص" وادوس "تنظيف سجلات أقدم من 90 يوم".' },
                { q: '👤 المدير الفرعي مش بيشوف موظفينه', a: 'روح لإدارة الموظفين وتأكد إن الموظف عنده موقع من مواقع المدير الفرعي. مفيش موقع مشترك = مفيش رؤية.' },
                { q: '📱 النظام بطيء على الموبايل', a: 'شيت الحضور الكبير بيعلق. فلتر حسب الموظف أو الموقع من شريط الفلترة.' },
                { q: '🗑️ حذفت موقع بالغلط', a: 'روح لـ "نسخ احتياطي" واسترجع آخر باك أب. أو ضيف الموقع تاني من تبويب المواقع.' },
                { q: '🔑 نسينا باسورد الأدمن', a: 'روح لتبويب "إعادة تهيئة" وخد باك أب الأول. بعدين اعمل "مسح كل البيانات وإعادة التهيئة" — هيرجع admin/admin123.' },
              ].map((item, i) => (
                <details key={i} className="group rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                  <summary className="cursor-pointer px-4 py-3 font-black text-sm text-slate-800 hover:bg-slate-100 transition">{item.q}</summary>
                  <div className="px-4 pb-3 text-xs font-bold text-slate-600 leading-relaxed border-t border-slate-200 pt-3">{item.a}</div>
                </details>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ============ نسخ احتياطي ============ */}
      {activeSection === 'backup' && (
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <h2 className="text-xl font-black text-slate-950 mb-2">💾 النسخ الاحتياطي والاسترجاع</h2>
          <p className="text-xs font-bold text-slate-500 mb-6">نزّل نسخة من كل بياناتك أو استرجع من نسخة سابقة</p>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <div className="text-3xl mb-3">⬇️</div>
              <h3 className="font-black text-slate-800 mb-2">تنزيل نسخة احتياطية</h3>
              <p className="text-xs text-slate-500 mb-4">هيحمّل كل حاجة: موظفين، حضور، إجازات، مواقع، إعدادات، سجل بصمات</p>
              <button onClick={downloadBackup} className="w-full rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white hover:bg-slate-700">⬇️ تنزيل Backup JSON</button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <div className="text-3xl mb-3">⬆️</div>
              <h3 className="font-black text-slate-800 mb-2">استرجاع من نسخة</h3>
              <p className="text-xs text-slate-500 mb-4">اختار ملف JSON اللي نزلته قبل كده. ⚠️ هيمسح كل البيانات القديمة!</p>
              <input type="file" accept=".json" onChange={importBackup} className="w-full text-sm font-bold text-slate-600 mb-3" />
              {importMsg && <div className={`rounded-xl px-4 py-3 text-sm font-bold ${importMsg.includes('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{importMsg}</div>}
            </div>
          </div>

          <div className="mt-6 rounded-2xl bg-blue-50 border border-blue-200 p-4 text-xs font-bold text-blue-800 leading-relaxed">
            💡 <b>نصيحة:</b> خد نسخة احتياطية أسبوعيًا. لو النظام مسح نفسه أو المتصفح مسح البيانات، هتقدر ترجع كل حاجة من ملف الـ JSON.
          </div>
        </div>
      )}

      {/* ============ إعادة تهيئة ============ */}
      {activeSection === 'reset' && (
        <div className="rounded-[2rem] border border-red-200 bg-white p-6 shadow-sm md:p-8">
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">⚠️</div>
            <h2 className="text-2xl font-black text-red-700">إعادة تهيئة النظام</h2>
            <p className="mt-2 text-sm font-bold text-slate-500">ده هيمسح كل البيانات ويعيد النظام زي يوم ما فتحته أول مرة</p>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
              <h3 className="font-black text-red-800 mb-2">❗ هيتنسى إيه:</h3>
              <ul className="text-sm font-bold text-red-700 space-y-1">
                <li>• كل الموظفين (هترجع admin بس)</li>
                <li>• كل سجلات الحضور</li>
                <li>• كل الإجازات</li>
                <li>• كل المواقع</li>
                <li>• كل الإعدادات (هترجع للقيم الافتراضية)</li>
                <li>• سجل البصمات والحركات</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <h3 className="font-black text-amber-800 mb-2">💡 قبل ما تعمل إعادة تهيئة:</h3>
              <ol className="text-sm font-bold text-amber-700 space-y-1">
                <li>1. روح لتبويب "نسخ احتياطي" ونزّل ملف JSON</li>
                <li>2. بعدين تعال هنا واعمل إعادة تهيئة</li>
                <li>3. لو عايز ترجع البيانات، استورد من نفس الملف</li>
              </ol>
            </div>

            {resetConfirm && (
              <div className="rounded-2xl border border-red-300 bg-red-100 p-4 text-center animate-pulse">
                <p className="font-black text-red-800 text-lg">⚠️ هتتمسح كل البيانات! متأكد؟</p>
                <p className="text-xs font-bold text-red-600 mt-1">لو ضغطت تاني هتمسح كل حاجة</p>
              </div>
            )}

            <button
              onClick={fullReset}
              className={`w-full rounded-xl py-4 text-lg font-black transition ${resetConfirm ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-red-50 text-red-700 border-2 border-red-300 hover:bg-red-100'}`}
            >
              {resetConfirm ? '🗑️ تأخير نهائي - مسح كل البيانات' : 'مسح كل البيانات وإعادة التهيئة'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
