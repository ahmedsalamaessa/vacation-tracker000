import { useCallback, useEffect, useState } from 'react';
import {
  getEmployees,
  getLocations,
  addEmployeeAsync,
  updateEmployee,
  deleteEmployee,
} from '../lib/db';
import type { Employee, WorkLocation } from '../lib/types';

interface FormState {
  name: string;
  username: string;
  jobTitle: string;
  phone: string;
  cycleType: string;
  workCycle: number;
  role: string;
  password: string;
  locationIds: number[];
  canViewDashboard: boolean;
  canCheckIn: boolean;
  canViewMyAccount: boolean;
  canRequestVacations: boolean;
  canViewNotifications: boolean;
  canViewDailyReview: boolean;
  canViewAttendance: boolean;
  canEditAttendance: boolean;
  canApproveVacations: boolean;
  canViewReports: boolean;
  canManageEmployees: boolean;
  canManageSettings: boolean;
  canManageLocations: boolean;
  canLockMonths: boolean;
  canViewAuditLog: boolean;
}

const EMPTY: FormState = {
  name: '',
  username: '',
  jobTitle: 'مساح',
  phone: '',
  cycleType: 'fixed',
  workCycle: 12,
  role: 'employee',
  password: '',
  locationIds: [],
  canViewDashboard: false,
  canCheckIn: true,
  canViewMyAccount: true,
  canRequestVacations: true,
  canViewNotifications: true,
  canViewDailyReview: false,
  canViewAttendance: false,
  canEditAttendance: false,
  canApproveVacations: false,
  canViewReports: false,
  canManageEmployees: false,
  canManageSettings: false,
  canManageLocations: false,
  canLockMonths: false,
  canViewAuditLog: false,
};

const CYCLE_LABELS: Record<string, { label: string; cls: string }> = {
  fixed: { label: 'ثابت', cls: 'bg-orange-500' },
  graduated: { label: 'عادي', cls: 'bg-orange-500' },
  variable: { label: 'متغير', cls: 'bg-emerald-500' },
};

interface Props {
  onOpenProfile?: (employeeId: number) => void;
  user: Employee;
}

export default function EmployeesTab({ onOpenProfile, user }: Props) {
  const [list, setList] = useState<Employee[]>([]);
  const [allLocations, setLocationsState] = useState<WorkLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [editId, setEditId] = useState<number | null>(null);
  const [msg, setMsg] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; name: string; step: number; input: string } | null>(null);

  const isManager = user.role === 'manager';
  const isAdmin = user.role === 'admin';

  const manageableLocations = isAdmin
    ? allLocations
    : allLocations.filter(l => user.locationIds.includes(l.id));

  const managersForSelectedLocations = getEmployees().filter(
    emp =>
      emp.active &&
      emp.role === 'manager' &&
      form.locationIds.some(locId => emp.locationIds.includes(locId)),
  );
  const linkedManager = isManager ? user : managersForSelectedLocations[0] || null;

  const load = useCallback(() => {
    setLoading(true);
    const allEmps = getEmployees();
    let filtered: Employee[];
    
    if (isAdmin) {
      filtered = allEmps;
    } else if (isManager) {
      const userLocs = user.locationIds || [];
      filtered = allEmps.filter(e => 
        e.id === user.id || 
        (e.locationIds && e.locationIds.some(id => userLocs.includes(id)))
      );
    } else {
      filtered = [user];
    }
    
    setList(filtered);
    setLocationsState(getLocations());
    setLoading(false);
  }, [user.id, user.role, isAdmin, isManager]);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit(emp: Employee) {
    if (isManager && emp.role === 'admin') {
      alert('لا يمكنك تعديل مدير النظام');
      return;
    }
    setEditId(emp.id);
    setForm({
      name: emp.name,
      username: emp.username || '',
      jobTitle: emp.jobTitle || '',
      phone: emp.phone || '',
      cycleType: emp.cycleType,
      workCycle: emp.workCycle,
      role: emp.role,
      password: '',
      locationIds: emp.locationIds || [],
      canViewDashboard: emp.canViewDashboard ?? emp.role !== 'employee',
      canCheckIn: emp.canCheckIn ?? true,
      canViewMyAccount: emp.canViewMyAccount ?? true,
      canRequestVacations: emp.canRequestVacations ?? true,
      canViewNotifications: emp.canViewNotifications ?? true,
      canViewDailyReview: emp.canViewDailyReview ?? emp.role !== 'employee',
      canViewAttendance: emp.canViewAttendance,
      canEditAttendance: emp.canEditAttendance,
      canApproveVacations: emp.canApproveVacations,
      canViewReports: emp.canViewReports,
      canManageEmployees: emp.canManageEmployees,
      canManageSettings: emp.canManageSettings,
      canManageLocations: emp.canManageLocations,
      canLockMonths: emp.canLockMonths,
      canViewAuditLog: emp.canViewAuditLog,
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function reset() {
    setForm(EMPTY);
    setEditId(null);
    setShowForm(false);
  }

  function toggleLocation(locationId: number) {
    setForm(prev => ({
      ...prev,
      locationIds: prev.locationIds.includes(locationId)
        ? prev.locationIds.filter(id => id !== locationId)
        : [...prev.locationIds, locationId],
    }));
  }

  // 🆕 قوالب الصلاحيات الجاهزة
  function applyPermissionTemplate(template: 'full' | 'hr' | 'readonly') {
    if (template === 'full') {
      setForm(prev => ({
        ...prev,
        role: prev.role === 'employee' ? 'manager' : prev.role,
        canViewDashboard: true,
        canCheckIn: true,
        canViewMyAccount: true,
        canRequestVacations: true,
        canViewNotifications: true,
        canViewDailyReview: true,
        canViewAttendance: true,
        canEditAttendance: true,
        canApproveVacations: true,
        canViewReports: true,
        canManageEmployees: true,
        canManageSettings: false,
        canManageLocations: true,
        canLockMonths: true,
        canViewAuditLog: true,
      }));
      return;
    }
    if (template === 'hr') {
      setForm(prev => ({
        ...prev,
        role: prev.role === 'employee' ? 'manager' : prev.role,
        canViewDashboard: true,
        canCheckIn: true,
        canViewMyAccount: true,
        canRequestVacations: true,
        canViewNotifications: true,
        canViewDailyReview: true,
        canViewAttendance: true,
        canEditAttendance: true,
        canApproveVacations: true,
        canViewReports: true,
        canManageEmployees: true,
        canManageSettings: false,
        canManageLocations: false,
        canLockMonths: false,
        canViewAuditLog: true,
      }));
      return;
    }
    setForm(prev => ({
      ...prev,
      role: prev.role === 'employee' ? 'manager' : prev.role,
      canViewDashboard: true,
      canCheckIn: false,
      canViewMyAccount: true,
      canRequestVacations: false,
      canViewNotifications: true,
      canViewDailyReview: false,
      canViewAttendance: true,
      canEditAttendance: false,
      canApproveVacations: false,
      canViewReports: true,
      canManageEmployees: false,
      canManageSettings: false,
      canManageLocations: false,
      canLockMonths: false,
      canViewAuditLog: true,
    }));
  }

  // 🆕 خيارات الصلاحيات
  const permissionOptions: { key: keyof FormState; label: string }[] = [
    { key: 'canViewDashboard', label: 'لوحة التحكم' },
    { key: 'canCheckIn', label: 'بصمة الحضور' },
    { key: 'canViewMyAccount', label: 'حسابي' },
    { key: 'canRequestVacations', label: 'طلب الإجازات' },
    { key: 'canViewNotifications', label: 'الإشعارات' },
    { key: 'canViewDailyReview', label: 'مراجعة اليوم' },
    { key: 'canViewAttendance', label: form.role === 'employee' ? 'تتبع حضوره فقط' : 'تتبع حضور موظفي الموقع' },
    { key: 'canEditAttendance', label: 'تعديل شيت الحضور' },
    { key: 'canApproveVacations', label: 'اعتماد الإجازات' },
    { key: 'canViewReports', label: 'التقارير' },
    { key: 'canManageEmployees', label: 'إدارة الموظفين' },
    { key: 'canManageSettings', label: 'الإعدادات' },
    { key: 'canManageLocations', label: 'إدارة المواقع' },
    { key: 'canLockMonths', label: 'قفل الشهور' },
    { key: 'canViewAuditLog', label: 'سجل الحركات' },
  ];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    if (!form.name.trim()) {
      setMsg('الاسم مطلوب');
      return;
    }
    if (!editId && !form.password.trim()) {
      setMsg('كلمة المرور مطلوبة');
      return;
    }

    let finalLocationIds = form.locationIds;
    if (isManager) {
      finalLocationIds = form.locationIds.filter(id => user.locationIds.includes(id));
      if (finalLocationIds.length === 0) {
        setMsg('يجب اختيار موقع ضمن مواقعك المسموحة');
        return;
      }
    }

    let finalRole = form.role as any;
    if (isManager && finalRole === 'admin') {
      setMsg('لا يمكنك إنشاء مدير نظام');
      return;
    }

    const employeeData = {
      name: form.name.trim(),
      username: form.username.trim() || form.name.trim(),
      jobTitle: form.jobTitle.trim() || null,
      phone: form.phone.trim() || null,
      workCycle: form.cycleType === 'variable' ? 12 : form.workCycle,
      cycleType: form.cycleType as any,
      role: finalRole,
      password:
        form.password ||
        (editId ? getEmployees().find(e => e.id === editId)?.password || '' : ''),
      locationIds: finalLocationIds,
      managerId: finalRole === 'employee' ? linkedManager?.id || null : null,
      workLocationLat: null,
      workLocationLng: null,
      active: true,
      canViewDashboard: finalRole === 'admin' || form.canViewDashboard,
      canCheckIn: finalRole === 'admin' || form.canCheckIn,
      canViewMyAccount: finalRole === 'admin' || form.canViewMyAccount,
      canRequestVacations: finalRole === 'admin' || form.canRequestVacations,
      canViewNotifications: finalRole === 'admin' || form.canViewNotifications,
      canViewDailyReview: finalRole === 'admin' || form.canViewDailyReview,
      canViewAttendance: finalRole === 'admin' || form.canViewAttendance,
      canEditAttendance:
        finalRole === 'admin' || (finalRole === 'manager' && form.canEditAttendance),
      canApproveVacations: finalRole === 'admin' || form.canApproveVacations,
      canViewReports: finalRole === 'admin' || form.canViewReports,
      canManageEmployees: finalRole === 'admin' || form.canManageEmployees,
      canManageSettings: finalRole === 'admin' || form.canManageSettings,
      canManageLocations: finalRole === 'admin' || form.canManageLocations,
      canLockMonths: finalRole === 'admin' || form.canLockMonths,
      canViewAuditLog: finalRole === 'admin' || form.canViewAuditLog,
    };

    if (editId) {
      updateEmployee(editId, employeeData as any).then(() => {
        setMsg('✅ تم التعديل');
        load();
      });
    } else {
      addEmployeeAsync(employeeData as any).then(() => {
        setMsg('✅ تم إضافة الموظف');
        load();
      });
    }
    reset();
  }

  function remove(id: number) {
    const emp = getEmployees().find(e => e.id === id);
    if (isManager && emp?.role === 'admin') {
      alert('لا يمكنك أرشفة مدير النظام');
      return;
    }
    if (!confirm('إيقاف/أرشفة هذا الموظف؟')) return;
    deleteEmployee(id);
    load();
  }

  function restoreEmployee(emp: Employee) {
    if (!confirm(`استرجاع الموظف ${emp.name}؟`)) return;
    updateEmployee(emp.id, { active: true } as any).then(() => {
      setMsg(`✅ تم استرجاع ${emp.name}`);
      load();
      setTimeout(() => setMsg(''), 3000);
    });
  }

  function startDelete(emp: Employee) {
    if (!isAdmin) {
      alert('❌ الحذف النهائي متاح لمدير النظام فقط');
      return;
    }
    if (emp.role === 'admin') {
      alert('❌ لا يمكن حذف مدير النظام نهائياً');
      return;
    }
    setDeleteConfirm({ id: emp.id, name: emp.name, step: 1, input: '' });
  }

  function confirmDelete() {
    if (!deleteConfirm) return;
    if (deleteConfirm.step === 1) {
      if (deleteConfirm.input.trim() !== deleteConfirm.name.trim()) {
        setMsg('❌ الاسم اللي كتبته مش مطابق. حاول تاني.');
        return;
      }
      setDeleteConfirm({ ...deleteConfirm, step: 2 });
      return;
    }
    if (deleteConfirm.step === 2) {
      updateEmployee(deleteConfirm.id, { 
        active: false,
        name: `[محذوف] ${deleteConfirm.name}`,
        username: `deleted_${deleteConfirm.id}_${Date.now()}`,
        phone: null,
      } as any).then(() => {
        setMsg(`🗑️ تم حذف ${deleteConfirm.name} نهائياً (البيانات محفوظة في السجل)`);
        setDeleteConfirm(null);
        load();
        setTimeout(() => setMsg(''), 5000);
      });
    }
  }

  function cancelDelete() {
    setDeleteConfirm(null);
    setMsg('');
  }

  const activeList = list.filter(e => e.active);
  const archivedList = list.filter(e => !e.active && !e.name.startsWith('[محذوف]'));
  const displayList = showArchived ? archivedList : activeList;

  return (
    <div className="space-y-4">
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="text-center mb-4">
              <div className="text-5xl mb-3">⚠️</div>
              <h3 className="text-xl font-black text-red-700 mb-2">
                حذف نهائي - الخطوة {deleteConfirm.step} من 2
              </h3>
              <p className="text-sm font-bold text-slate-600">
                {deleteConfirm.step === 1 
                  ? `للتأكيد، اكتب اسم الموظف بالظبط:`
                  : `⚠️ آخر تحذير! سيتم حذف "${deleteConfirm.name}" نهائياً.`}
              </p>
            </div>
            {deleteConfirm.step === 1 && (
              <>
                <div className="mb-3 p-3 bg-slate-100 rounded-xl text-center">
                  <div className="text-xs text-slate-500 mb-1">الاسم المطلوب:</div>
                  <div className="font-black text-slate-900">{deleteConfirm.name}</div>
                </div>
                <input
                  type="text"
                  value={deleteConfirm.input}
                  onChange={e => setDeleteConfirm({ ...deleteConfirm, input: e.target.value })}
                  placeholder="اكتب الاسم هنا..."
                  className="w-full border-2 border-red-300 rounded-xl px-4 py-3 text-center font-bold outline-none focus:border-red-500"
                  autoFocus
                />
                {msg && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-center text-sm font-bold text-red-700">
                    {msg}
                  </div>
                )}
              </>
            )}
            {deleteConfirm.step === 2 && (
              <div className="mb-4 p-4 bg-red-50 border-2 border-red-300 rounded-xl">
                <div className="text-center text-red-800 font-bold text-sm space-y-2">
                  <p>🗑️ سيتم مسح الموظف من قائمة النشطين والأرشيف</p>
                  <p className="text-xs">💾 بياناته (الحضور، الإجازات، البصمات) هتفضل محفوظة</p>
                  <p className="text-xs text-red-600 font-black">هذا الإجراء لا يمكن التراجع عنه!</p>
                </div>
              </div>
            )}
            <div className="flex gap-2 mt-4">
              <button onClick={cancelDelete} className="flex-1 bg-slate-200 text-slate-700 py-3 rounded-xl font-black hover:bg-slate-300">
                إلغاء
              </button>
              <button onClick={confirmDelete} className="flex-1 bg-red-600 text-white py-3 rounded-xl font-black hover:bg-red-700">
                {deleteConfirm.step === 1 ? 'تأكيد' : '🗑️ حذف نهائي'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="font-bold text-lg text-slate-800">
              {showArchived 
                ? `🗃️ الموظفين المؤرشفين (${archivedList.length})` 
                : (isManager 
                  ? `👥 موظفي مواقعي (${activeList.length})` 
                  : `👥 قائمة الموظفين (${activeList.length})`)}
            </h2>
            {isManager && !showArchived && (
              <p className="text-xs text-slate-500">
                تشوف موظفين مواقعك فقط: {manageableLocations.map(l => l.name).join('،') || '—'}
              </p>
            )}
            {showArchived && (
              <p className="text-xs text-amber-600 font-bold">
                ⚠️ هؤلاء موظفين مؤرشفين - يمكن استرجاعهم أو حذفهم نهائياً
              </p>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setShowArchived(s => !s)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition ${
                showArchived
                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
              }`}
            >
              {showArchived 
                ? `👥 عرض النشطين (${activeList.length})` 
                : `🗃️ عرض المؤرشفين (${archivedList.length})`}
            </button>
            {!showArchived && (
              <button
                onClick={() => { reset(); setShowForm(s => !s); }}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700"
              >
                ➕ {showForm ? 'إغلاق' : 'إضافة موظف'}
              </button>
            )}
          </div>
        </div>

        {msg && !deleteConfirm && (
          <div className="mb-4 rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-center text-sm font-bold text-blue-700">
            {msg}
          </div>
        )}

        {showForm && !showArchived && (
          <form onSubmit={submit} className="border border-slate-200 rounded-xl p-4 mb-4 space-y-3 bg-slate-50">
            <h3 className="font-bold text-slate-700">
              {editId ? '✏️ تعديل موظف' : '🆕 إضافة موظف جديد'}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">اسم الموظف *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="الاسم..." className="w-full border border-slate-300 rounded-lg px-3 py-2" required />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">اسم المستخدم *</label>
                <input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="ahmed123" className="w-full border border-slate-300 rounded-lg px-3 py-2" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">الوظيفة</label>
                <input value={form.jobTitle} onChange={e => setForm({ ...form, jobTitle: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">الهاتف</label>
                <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2" />
              </div>
            </div>

            <div>
              <label className="block text-sm text-slate-600 mb-1">نظام الإجازات *</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { v: 'graduated', t: 'عادي', s: 'متدرج' },
                  { v: 'fixed', t: 'ثابت', s: 'عدد ثابت' },
                  { v: 'variable', t: 'متغير', s: 'دوري' },
                ].map(opt => (
                  <button
                    type="button"
                    key={opt.v}
                    onClick={() => setForm({ ...form, cycleType: opt.v })}
                    className={`border rounded-lg p-2 text-center ${
                      form.cycleType === opt.v
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    <div className="font-bold text-sm">{opt.t}</div>
                    <div className="text-[10px] text-slate-400">{opt.s}</div>
                  </button>
                ))}
              </div>
            </div>

            {form.cycleType === 'fixed' && (
              <div>
                <label className="block text-sm text-slate-600 mb-1">دورة العمل (أيام)</label>
                <input type="number" value={form.workCycle} onChange={e => setForm({ ...form, workCycle: Number(e.target.value) })} className="w-full border border-slate-300 rounded-lg px-3 py-2" />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">الصلاحية</label>
                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2">
                  <option value="employee">موظف</option>
                  <option value="manager">مدير فرعي</option>
                  {isAdmin && <option value="admin">مدير النظام</option>}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">
                  كلمة المرور {editId ? '(فارغة = بدون تغيير)' : '*'}
                </label>
                <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2" autoComplete="new-password" />
              </div>
            </div>
            
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <label className="mb-2 block text-sm font-bold text-slate-700">
                مواقع العمل {isManager ? '(مواقعك فقط)' : ''}
              </label>
              {manageableLocations.length === 0 ? (
                <div className="text-xs text-slate-400">لا توجد مواقع - أضف موقع أولاً</div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {manageableLocations.map(loc => (
                    <label key={loc.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-xs font-bold">
                      <input type="checkbox" checked={form.locationIds.includes(loc.id)} onChange={() => toggleLocation(loc.id)} />
                      {loc.name}
                    </label>
                  ))}
                </div>
              )}
              {form.role === 'employee' && form.locationIds.length > 0 && (
                <div className={`mt-3 rounded-xl border p-3 text-xs font-bold ${
                  linkedManager
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-amber-200 bg-amber-50 text-amber-800'
                }`}>
                  {linkedManager ? (
                    <>
                      ✅ سيتم ربط الموظف تلقائياً بالمدير الفرعي: <b>{linkedManager.name}</b>
                    </>
                  ) : (
                    <>⚠️ لا يوجد مدير فرعي مربوط بالموقع المختار حالياً.</>
                  )}
                </div>
              )}
            </div>

            {/* 🔧 قسم الصلاحيات المستعاد */}
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3">
              <label className="mb-2 block text-sm font-bold text-indigo-900">🔐 صلاحيات الحساب</label>
              
              {/* قوالب الصلاحيات الجاهزة */}
              {form.role !== 'admin' && (
                <div className="mb-3 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => applyPermissionTemplate('full')}
                    className="rounded-lg bg-purple-600 px-2 py-2 text-[11px] font-black text-white hover:bg-purple-700"
                  >
                    👑 صلاحيات كاملة
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPermissionTemplate('hr')}
                    className="rounded-lg bg-blue-600 px-2 py-2 text-[11px] font-black text-white hover:bg-blue-700"
                  >
                    💼 موارد بشرية
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPermissionTemplate('readonly')}
                    className="rounded-lg bg-slate-700 px-2 py-2 text-[11px] font-black text-white hover:bg-slate-800"
                  >
                    👁️ عرض فقط
                  </button>
                </div>
              )}
              
              {/* الصلاحيات الفردية */}
              <div className="grid grid-cols-2 gap-2">
                {permissionOptions
                  .filter(opt => form.role !== 'employee' || opt.key !== 'canEditAttendance')
                  .map(opt => (
                    <label
                      key={String(opt.key)}
                      className="flex items-center gap-2 rounded-lg bg-white p-2 text-xs font-bold text-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={form.role === 'admin' ? true : Boolean(form[opt.key])}
                        disabled={form.role === 'admin'}
                        onChange={e => setForm({ ...form, [opt.key]: e.target.checked })}
                      />
                      {opt.label}
                    </label>
                  ))}
              </div>
              
              {form.role === 'admin' && (
                <div className="mt-2 text-[10px] font-bold text-purple-700 text-center bg-purple-100 p-2 rounded-lg">
                  💡 مدير النظام يحصل على جميع الصلاحيات تلقائياً
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button type="submit" className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-bold hover:bg-blue-700">
                💾 {editId ? 'حفظ التعديل' : 'إضافة'}
              </button>
              <button type="button" onClick={reset} className="px-4 bg-slate-200 text-slate-700 rounded-lg">
                إلغاء
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="text-center text-slate-500 py-6">جاري التحميل...</div>
        ) : displayList.length === 0 ? (
          <div className="text-center py-10">
            <div className="text-5xl mb-3">{showArchived ? '📭' : '👥'}</div>
            <div className="text-slate-500 font-bold">
              {showArchived ? 'مفيش موظفين مؤرشفين' : 'لا يوجد موظفون'}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {displayList.map(emp => {
              const cycle = CYCLE_LABELS[emp.cycleType] || CYCLE_LABELS.fixed;
              return (
                <div 
                  key={emp.id} 
                  className={`border rounded-xl p-3 ${
                    showArchived 
                      ? 'border-amber-200 bg-amber-50/50' 
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-slate-800 flex items-center gap-2 flex-wrap">
                        {emp.name}
                        {emp.role === 'admin' && (
                          <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                            مدير النظام
                          </span>
                        )}
                        {emp.role === 'manager' && (
                          <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                            مدير فرعي
                          </span>
                        )}
                        {!emp.active && (
                          <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                            🗃️ مؤرشف
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400">{emp.jobTitle || '—'}</div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {onOpenProfile && (
                        <button onClick={() => onOpenProfile(emp.id)} className="text-slate-500 hover:text-slate-900 text-lg" title="الملف الشخصي">
                          👤
                        </button>
                      )}
                      {!showArchived && (
                        <>
                          <button onClick={() => startEdit(emp)} className="text-blue-500 hover:text-blue-700 text-lg" title="تعديل">
                            ✏️
                          </button>
                          <button onClick={() => remove(emp.id)} className="text-orange-500 hover:text-orange-700 text-lg" title="أرشفة">
                            🗃️
                          </button>
                        </>
                      )}
                      {showArchived && (
                        <>
                          <button onClick={() => restoreEmployee(emp)} className="text-green-500 hover:text-green-700 text-lg animate-pulse" title="استرجاع من الأرشيف">
                            ♻️
                          </button>
                          {isAdmin && emp.role !== 'admin' && (
                            <button onClick={() => startDelete(emp)} className="text-red-600 hover:text-red-800 text-lg" title="حذف نهائي">
                              🗑️
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-slate-500">نظام العمل:</span>
                    <span className={`${cycle.cls} text-white px-2 py-0.5 rounded-full`}>
                      {cycle.label}
                    </span>
                    {(emp as any).hasPassword || (emp.password && emp.password !== '') ? (
                      <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        🔑 مفعّل
                      </span>
                    ) : (
                      <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                        ⚠️ بدون باسورد
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    يوزر: <b className="text-slate-600">{emp.username || emp.name}</b>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    المواقع:{' '}
                    {emp.locationIds && emp.locationIds.length > 0
                      ? emp.locationIds
                          .map(id => allLocations.find(loc => loc.id === id)?.name)
                          .filter(Boolean)
                          .join('، ')
                      : 'كل/بدون'}
                  </div>
                  {emp.role === 'employee' && (
                    <div className="mt-1 text-[11px] text-emerald-700 font-bold">
                      المدير الفرعي المرتبط:{' '}
                      {getEmployees().find(m => m.id === emp.managerId)?.name ||
                        getEmployees().find(
                          m =>
                            m.role === 'manager' &&
                            emp.locationIds?.some(id => m.locationIds.includes(id)),
                        )?.name ||
                        'غير محدد'}
                    </div>
                  )}
                  {showArchived && emp.updatedAt && (
                    <div className="mt-1 text-[11px] text-amber-600 font-bold">
                      🕐 أُرشف في: {new Date(emp.updatedAt).toLocaleDateString('ar-EG')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
