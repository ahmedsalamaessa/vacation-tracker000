import { useEffect, useState } from 'react';
import { getEmployees, getAttendance, getVacations, getAuditLogs } from '../lib/db';
import { computeGraduatedVacation } from '../lib/vacation';
import { getVacationDaysTaken } from '../lib/balance';
import type { Employee, AuditLog } from '../lib/types';

type DashboardTabKey =
  | 'attendance'
  | 'daily'
  | 'tracker'
  | 'vacations'
  | 'approvals'
  | 'employees'
  | 'reports'
  | 'attempts';

interface DashboardStats {
  emps: number;
  presentToday: number;
  pendingVacs: number;
  negativeBalance: number;
  zeroBalance: number;
  positiveBalance: number;
  totalVacationBalance: number;
  totalPresentDays: number;
  totalEarnedVacations: number;
  missingToday: number;
}

interface NotificationItem {
  type: string;
  title: string;
  body: string;
  severity: 'info' | 'warn' | 'danger';
}

function formatDateTime(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('ar-EG', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface DashboardTabProps {
  user: Employee;
  onNavigate: (tab: DashboardTabKey) => void;
}

export default function DashboardTab({ user, onNavigate }: DashboardTabProps) {
  const [stats, setStats] = useState<DashboardStats>({
    emps: 0,
    presentToday: 0,
    pendingVacs: 0,
    negativeBalance: 0,
    zeroBalance: 0,
    positiveBalance: 0,
    totalVacationBalance: 0,
    totalPresentDays: 0,
    totalEarnedVacations: 0,
    missingToday: 0,
  });
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [audit, setAudit] = useState<AuditLog[]>([]);

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 5000);
    return () => clearInterval(timer);
  }, []);

  function loadData() {
    const employees = getEmployees().filter(e => e.active);
    const attendance = getAttendance();
    const vacations = getVacations();
    const auditLogs = getAuditLogs();

    const today = todayIso();
    const todayAttendance = attendance.filter(a => a.date === today);
    const presentToday = todayAttendance.filter(a => 
      ['حاضر', 'سهر', 'عارضة حضور'].includes(a.status)
    ).length;

    const pendingVacs = vacations.filter(v => v.status === 'بانتظار الموافقة').length;

    // Calculate balances
    let negativeBalance = 0;
    let zeroBalance = 0;
    let positiveBalance = 0;
    
    for (const emp of employees) {
      const empAttendance = attendance.filter(a => a.employeeId === emp.id);
      const empVacations = vacations.filter(v => v.employeeId === emp.id);
      
      const countBy = (status: string) => empAttendance.filter(r => r.status === status).length;
      const present = countBy('حاضر') + countBy('سهر') + countBy('عارضة حضور');
      const grad = computeGraduatedVacation(present);
      
      const sahar = countBy('سهر');
      const overtimeLeave = countBy('بدل سهرة');
      const vacationDaysTaken = getVacationDaysTaken(empAttendance, empVacations);
      const saharBalance = Math.max(0, sahar - overtimeLeave);
      const vacationBalance = grad.earned - vacationDaysTaken + saharBalance;

      if (vacationBalance < 0) negativeBalance++;
      else if (vacationBalance === 0) zeroBalance++;
      else positiveBalance++;
    }

    setStats({
      emps: employees.length,
      presentToday,
      pendingVacs,
      negativeBalance,
      zeroBalance,
      positiveBalance,
      totalVacationBalance: 0,
      totalPresentDays: 0,
      totalEarnedVacations: 0,
      missingToday: employees.length - presentToday,
    });

    // Build notifications
    const notifs: NotificationItem[] = [];
    if (pendingVacs > 0) {
      notifs.push({
        type: 'pending_vacations',
        title: 'طلبات إجازة جديدة',
        body: `${pendingVacs} طلب في انتظار موافقة المدير`,
        severity: 'warn',
      });
    }
    if (employees.length - presentToday > 0) {
      notifs.push({
        type: 'missing_attendance',
        title: 'موظفون لم يسجلوا اليوم',
        body: `${employees.length - presentToday} موظف لم يسجل حضور اليوم`,
        severity: 'info',
      });
    }
    if (negativeBalance > 0) {
      notifs.push({
        type: 'negative_balance',
        title: 'عجز في رصيد الإجازات',
        body: `${negativeBalance} موظف لديه رصيد سالب`,
        severity: 'danger',
      });
    }
    setNotifications(notifs);

    setAudit(auditLogs.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ).slice(0, 6));
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-3 text-right">
          <div>
            <h2 className="text-2xl font-black text-slate-900 md:text-3xl">📊 لوحة التحكم الحية</h2>
            <p className="mt-2 text-sm font-bold text-slate-500">
              إحصائيات فورية · تحديث تلقائي كل 5 ثوانية · المسؤول: {user.name}
            </p>
          </div>
          <button
            onClick={loadData}
            className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white hover:bg-slate-700"
          >
            🔄 تحديث
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-3xl bg-slate-900 p-6 text-white shadow-lg shadow-slate-200">
            <div className="mb-8 flex items-center justify-between">
              <span className="text-3xl">👥</span>
              <span className="text-sm font-black text-white/90">إجمالي الموظفين</span>
            </div>
            <div className="text-5xl font-black">{stats.emps}</div>
            <div className="mt-2 text-sm font-bold text-white/70">مسجّل في النظام</div>
          </div>

          <div className="rounded-3xl bg-emerald-600 p-6 text-white shadow-md shadow-emerald-100">
            <div className="mb-8 flex items-center justify-between">
              <span className="text-3xl">✅</span>
              <span className="text-sm font-black text-white/90">حضور اليوم</span>
            </div>
            <div className="text-5xl font-black">{stats.presentToday}</div>
            <div className="mt-2 text-sm font-bold text-white/80">من أصل {stats.emps}</div>
          </div>

          <div className="rounded-3xl bg-slate-100 p-6 text-slate-700 shadow-inner">
            <div className="mb-8 flex items-center justify-between">
              <span className="text-3xl">⏳</span>
              <span className="text-sm font-black">طلبات معلقة</span>
            </div>
            <div className="text-5xl font-black text-slate-800">{stats.pendingVacs}</div>
            <div className="mt-2 text-sm font-bold text-slate-500">بانتظار الموافقة</div>
          </div>

          <div className="rounded-3xl bg-red-50 p-6 text-red-800 shadow-sm ring-1 ring-red-100">
            <div className="mb-8 flex items-center justify-between">
              <span className="text-3xl">⚠️</span>
              <span className="text-sm font-black">عجز رصيد</span>
            </div>
            <div className="text-5xl font-black">{stats.negativeBalance}</div>
            <div className="mt-2 text-sm font-bold text-red-700">موظف لديه رصيد سالب</div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {(user.role === 'admin' || user.canEditAttendance) && (
            <button
              onClick={() => onNavigate('attendance')}
              className="rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-5 text-right transition hover:bg-indigo-100"
            >
              <div className="text-lg font-black text-indigo-800">📝 فتح تثبيت الحضور</div>
              <div className="mt-1 text-sm font-bold text-indigo-600">تسجيل / تعديل يومي</div>
            </button>
          )}
          {(user.role === 'admin' || user.role === 'manager' || user.canViewAttendance) && (
            <button
              onClick={() => onNavigate('daily')}
              className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-5 text-right transition hover:bg-blue-100"
            >
              <div className="text-lg font-black text-blue-800">📌 مراجعة اليوم</div>
              <div className="mt-1 text-sm font-bold text-blue-600">حاضر · غياب · بصمات مرفوضة · لم يبصم</div>
            </button>
          )}
          <button
            onClick={() => onNavigate('tracker')}
            className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-5 text-right transition hover:bg-emerald-100"
          >
            <div className="text-lg font-black text-emerald-800">⚖️ رصيد الإجازات</div>
            <div className="mt-1 text-sm font-bold text-emerald-600">تتبع المراحل والعجز</div>
          </button>
          <button
            onClick={() => onNavigate('vacations')}
            className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-5 text-right transition hover:bg-amber-100"
          >
            <div className="text-lg font-black text-amber-800">🗓️ الإجازات التفصيلية</div>
            <div className="mt-1 text-sm font-bold text-amber-600">إضافة ومراجعة الإجازات</div>
          </button>
          {(user.role === 'admin' || user.canApproveVacations) && (
            <button
              onClick={() => onNavigate('approvals')}
              className="rounded-2xl border border-green-200 bg-green-50 px-5 py-5 text-right transition hover:bg-green-100 md:col-span-3"
            >
              <div className="text-lg font-black text-green-800">✅ اعتمادات الإجازات</div>
              <div className="mt-1 text-sm font-bold text-green-600">طلبات معلقة · موافقة ورفض مع ملاحظات</div>
            </button>
          )}
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <h3 className="mb-5 text-xl font-black text-slate-950">⚡ إجراءات سريعة للمدير</h3>
        <div className="grid gap-4 md:grid-cols-2">
          {(user.role === 'admin' || user.canManageEmployees) && (
            <button
              onClick={() => onNavigate('employees')}
              className="rounded-2xl bg-slate-900 px-5 py-5 text-lg font-black text-white transition hover:bg-blue-700"
            >
              👥 إدارة الموظفين
            </button>
          )}
          {(user.role === 'admin' || user.canViewReports) && (
            <button
              onClick={() => onNavigate('reports')}
              className="rounded-2xl border-2 border-slate-900 px-5 py-5 text-lg font-black text-slate-900 transition hover:bg-slate-50"
            >
              📥 تصدير تقرير شهري
            </button>
          )}
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-xl font-black text-slate-950">🔔 إشعارات المدير</h3>
          {notifications.length === 0 ? (
            <div className="rounded-2xl bg-green-50 p-4 text-center text-sm font-black text-green-700">
              كل شيء مستقر حالياً ✅
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.map(item => (
                <div
                  key={item.type}
                  className={`rounded-2xl border p-4 ${
                    item.severity === 'danger'
                      ? 'border-red-200 bg-red-50 text-red-800'
                      : item.severity === 'warn'
                        ? 'border-amber-200 bg-amber-50 text-amber-800'
                        : 'border-blue-200 bg-blue-50 text-blue-800'
                  }`}
                >
                  <div className="font-black">{item.title}</div>
                  <div className="mt-1 text-sm font-bold opacity-80">{item.body}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-xl font-black text-slate-950">🧾 آخر سجل حركات</h3>
          {audit.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 p-4 text-center text-sm font-bold text-slate-500">
              لا توجد حركات مسجلة بعد.
            </div>
          ) : (
            <div className="space-y-3">
              {audit.map(log => (
                <div key={log.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <b className="text-sm text-slate-900">{log.action}</b>
                    <span className="text-[10px] font-bold text-slate-400">
                      {formatDateTime(log.createdAt)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs font-bold text-slate-500">
                    بواسطة {log.actorName || '—'} {log.employeeName ? `على ${log.employeeName}` : ''}
                  </div>
                  {(log.oldValue || log.newValue) && (
                    <div className="mt-1 text-xs font-bold text-blue-600">
                      {log.oldValue || '—'} ← {log.newValue || '—'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
