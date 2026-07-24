import { useCallback, useEffect, useState } from 'react';
import {
  getEmployees,
  getLocations,
  addEmployeeAsync,
  updateEmployee,
  deleteEmployee,
} from '../lib/db';
import { getManagedEmployees } from '../lib/permissions';
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

  // 🆕 دالة الحذف النهائي (يطلب تأكيدين)
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
    
    // التأكيد الأول: اسم الموظف صح؟
    if (deleteConfirm.step === 1) {
      if (deleteConfirm.input.trim() !== deleteConfirm.name.trim()) {
        setMsg('❌ الاسم اللي كتبته مش مطابق. حاول تاني.');
        return;
      }
      setDeleteConfirm({ ...deleteConfirm, step: 2 });
      return;
    }
    
    // التأكيد الثاني: نفذ الحذف
    if (deleteConfirm.step === 2) {
      // استخدام updateEmployee بدلاً من الحذف الحقيقي عشان الأمان
      // بدل الحذف من الداتابيز، بنخلي الموظف مؤرشف مع إخفاء بياناته
      updateEmployee(deleteConfirm.id, { 
        active: false,
        name: `[محذوف] ${deleteConfirm.name}`,
        username: `deleted_${deleteConfirm.id}_${Date.now()}`,
        phone: null,
      } as any).then(() => {
        setMsg(`🗑️ تم حذف ${deleteConfirm.name} نهائياً (البيانات محفوظة في السجل للمراجعة)`);
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
      {/* 🆕 نافذة تأكيد الحذف */}
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
              <button
                onClick={cancelDelete}
                className="flex-1 bg-slate-200 text-slate-700 py-3 rounded-xl font-black hover:bg-slate-300"
              >
                إلغاء
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 bg-red-600 text-white py-3 rounded-xl font-black hover:bg-red-700"
              >
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
                تشوف موظفين مواقعك فقط:{' '}
                {manageableLocations.map(l => l.name).join('،') || '—'}
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
                <input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="الاسم..."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">اسم المستخدم *</label>
                <input
                  value={form.username}
                  onChange={e => setForm({ ...form, username: e.target.value })}
                  placeholder="ahmed123"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">الوظيفة</label>
                <input
                  value={form.jobTitle}
                  onChange={e => setForm({ ...form, jobTitle: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">الهاتف</label>
                <input
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">الصلاحية</label>
                <select
                  value={form.role}
                  onChange={e => setForm({ ...form, role: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                >
                  <option value="employee">موظف</option>
                  <option value="manager">مدير فرعي</option>
                  {isAdmin && <option value="admin">مدير النظام</option>}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">
                  كلمة المرور {editId ? '(فارغة = بدون تغيير)' : '*'}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                  autoComplete="new-password"
                />
              </div>
            </div>
            
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <label className="mb-2 block text-sm font-bold text-slate-700">مواقع العمل</label>
              <div className="grid grid-cols-2 gap-2">
                {manageableLocations.map(loc => (
                  <label key={loc.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-xs font-bold">
                    <input
                      type="checkbox"
                      checked={form.locationIds.includes(loc.id)}
                      onChange={() => toggleLocation(loc.id)}
                    />
                    {loc.name}
                  </label>
                ))}
              </div>
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
                        <button
                          onClick={() => onOpenProfile(emp.id)}
                          className="text-slate-500 hover:text-slate-900 text-lg"
                          title="الملف الشخصي"
                        >
                          👤
                        </button>
                      )}
                      {!showArchived && (
                        <>
                          <button
                            onClick={() => startEdit(emp)}
                            className="text-blue-500 hover:text-blue-700 text-lg"
                            title="تعديل"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => remove(emp.id)}
                            className="text-orange-500 hover:text-orange-700 text-lg"
                            title="أرشفة"
                          >
                            🗃️
                          </button>
                        </>
                      )}
                      {showArchived && (
                        <>
                          <button
                            onClick={() => restoreEmployee(emp)}
                            className="text-green-500 hover:text-green-700 text-lg animate-pulse"
                            title="استرجاع من الأرشيف"
                          >
                            ♻️
                          </button>
                          {/* 🆕 زر الحذف النهائي - للأدمن فقط */}
                          {isAdmin && emp.role !== 'admin' && (
                            <button
                              onClick={() => startDelete(emp)}
                              className="text-red-600 hover:text-red-800 text-lg"
                              title="حذف نهائي"
                            >
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
