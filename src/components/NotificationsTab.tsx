import { useEffect, useState } from 'react';
import { getAttendance, getVacations, getNotificationsForUser } from '../lib/db';
import { getManagedEmployees } from '../lib/permissions';
import { computeGraduatedVacation } from '../lib/vacation';
import { getVacationDaysTaken } from '../lib/balance';
import type { Employee } from '../lib/types';

interface Notification {
  id: string;
  type: 'danger' | 'warn' | 'info' | 'success';
  emoji: string;
  title: string;
  body: string;
  time: string;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Props {
  user: Employee;
}

export default function NotificationsTab({ user }: Props) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [user.id]);

  function load() {
    setLoading(true);
    const emps = getManagedEmployees(user);
    const attendance = getAttendance();
    const vacations = getVacations();
    const today = todayIso();
    const notifs: Notification[] = [];

    // إشعارات داخلية محفوظة في النظام حتى لو المتصفح كان مقفول
    const internalNotifs = getNotificationsForUser(user.id).slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 30);
    internalNotifs.forEach(n => {
      notifs.push({
        id: `internal-${n.id}`,
        type: n.severity === 'danger' ? 'danger' : n.severity === 'warn' ? 'warn' : n.severity === 'success' ? 'success' : 'info',
        emoji: n.severity === 'danger' ? '🔴' : n.severity === 'warn' ? '🟡' : n.severity === 'success' ? '✅' : 'ℹ️',
        title: n.title,
        body: n.body,
        time: n.createdAt,
      });
    });

    const relevantVacations = user.role === 'employee' 
      ? vacations.filter(v => v.employeeId === user.id)
      : user.role === 'manager'
        ? vacations.filter(v => emps.some(e => e.id === v.employeeId))
        : vacations;

    const pending = relevantVacations.filter(v => v.status === 'بانتظار الموافقة');
    if (pending.length > 0) {
      pending.forEach(v => {
        const emp = emps.find(e => e.id === v.employeeId);
        // للموظف لا نعرض طلباته المعلقة كإشعار مقلق، فقط القرارات
        if (user.role !== 'employee') {
          notifs.push({
            id: `pending-${v.id}`,
            type: 'warn',
            emoji: '⏳',
            title: `طلب إجازة من ${emp?.name || 'موظف'}`,
            body: `${v.vacationType || 'اعتيادية'} - ${v.vacationDays} يوم (${v.startDate} إلى ${v.endDate})`,
            time: v.createdAt,
          });
        }
      });
    }

    const recentDecisions = relevantVacations.filter(v => v.status === 'مقبولة' || v.status === 'مرفوضة').sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, user.role === 'employee' ? 10 : 5);
    recentDecisions.forEach(v => {
      const emp = emps.find(e => e.id === v.employeeId);
      const title = user.role === 'employee' 
        ? `${v.status === 'مقبولة' ? 'تم اعتماد' : 'تم رفض'} إجازتك`
        : `${v.status === 'مقبولة' ? 'تم اعتماد' : 'تم رفض'} إجازة ${emp?.name || 'موظف'}`;
      notifs.push({
        id: `decision-${v.id}`,
        type: v.status === 'مقبولة' ? 'success' : 'danger',
        emoji: v.status === 'مقبولة' ? '✅' : '❌',
        title,
        body: `${v.vacationType} - ${v.vacationDays} يوم${v.notes ? ` - ${v.notes}` : ''}`,
        time: v.createdAt,
      });
    });

    if (user.role !== 'employee') {
      const todayRecords = attendance.filter(a => a.date === today);
      const presentIds = new Set(todayRecords.map(a => a.employeeId));
      const missing = emps.filter(e => !presentIds.has(e.id));
      if (missing.length > 0) {
        notifs.push({
          id: 'missing-today',
          type: 'info',
          emoji: '📋',
          title: `${missing.length} موظف لم يسجل حضور اليوم`,
          body: missing.slice(0, 5).map(e => e.name).join('، ') + (missing.length > 5 ? ` و${missing.length - 5} آخرين` : ''),
          time: new Date().toISOString(),
        });
      }
    }

    const negativeEmps: string[] = [];
    const lowBalanceEmps: string[] = [];
    emps.forEach(emp => {
      // للموظف فقط نفسه، للمدير موظفينه، للادمن الكل
      const empAtt = attendance.filter(a => a.employeeId === emp.id);
      const countBy = (s: string) => empAtt.filter(r => r.status === s).length;
      const present = countBy('حاضر') + countBy('سهر') + countBy('عارضة حضور');
      const grad = computeGraduatedVacation(present);
      const empVacs = relevantVacations.filter(v => v.employeeId === emp.id);
      const taken = getVacationDaysTaken(empAtt, empVacs);
      const sahar = countBy('سهر');
      const saharSpent = countBy('بدل سهرة');
      const balance = grad.earned - taken + Math.max(0, sahar - saharSpent);
      if (balance < 0) negativeEmps.push(emp.name);
      else if (balance <= 1 && balance >= 0) lowBalanceEmps.push(emp.name);
    });

    if (user.role !== 'employee') {
      if (negativeEmps.length > 0) {
        notifs.push({ id: 'negative-balance', type: 'danger', emoji: '🔴', title: `${negativeEmps.length} موظف لديه رصيد سالب`, body: negativeEmps.join('، '), time: new Date().toISOString() });
      }
      if (lowBalanceEmps.length > 0) {
        notifs.push({ id: 'low-balance', type: 'warn', emoji: '🟡', title: `${lowBalanceEmps.length} موظف رصيده على وشك النفاذ`, body: lowBalanceEmps.join('، '), time: new Date().toISOString() });
      }
    } else {
      // للموظف لو رصيده سالب
      if (negativeEmps.includes(user.name)) {
        notifs.push({ id: 'my-negative', type: 'danger', emoji: '🔴', title: 'رصيدك سالب', body: 'لديك عجز في رصيد الإجازات - واصل الحضور لتغطيته', time: new Date().toISOString() });
      }
    }

    const priority = { danger: 0, warn: 1, info: 2, success: 3 } as const;
    notifs.sort((a, b) => priority[a.type] - priority[b.type]);
    setNotifications(notifs);
    setLoading(false);
  }

  const formatTime = (t: string) => {
    const d = new Date(t);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'الآن';
    if (diff < 3600000) return `منذ ${Math.floor(diff / 60000)} دقيقة`;
    if (diff < 86400000) return `منذ ${Math.floor(diff / 3600000)} ساعة`;
    return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
  };

  const colors = { danger: 'border-red-200 bg-red-50', warn: 'border-amber-200 bg-amber-50', info: 'border-blue-200 bg-blue-50', success: 'border-green-200 bg-green-50' };
  const textColors = { danger: 'text-red-800', warn: 'text-amber-800', info: 'text-blue-800', success: 'text-green-800' };

  return (
    <div className="w-full space-y-5">
      <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black text-slate-950">🔔 {user.role === 'employee' ? 'إشعاراتي' : 'مركز الإشعارات'}</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">{user.role === 'employee' ? 'إشعاراتك الشخصية فقط' : user.role === 'manager' ? 'إشعارات موظفي مواقعك فقط' : 'تحديث تلقائي كل 8 ثوانٍ'}</p>
          </div>
          <button onClick={load} className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-200">🔄 تحديث</button>
        </div>

        {loading ? (
          <div className="py-10 text-center text-slate-500 font-bold">جاري التحميل...</div>
        ) : notifications.length === 0 ? (
          <div className="rounded-2xl bg-green-50 p-10 text-center">
            <div className="text-5xl mb-3">✨</div>
            <div className="text-xl font-black text-green-700">كل شيء مستقر</div>
            <div className="mt-2 text-sm font-bold text-green-600">لا توجد إشعارات حالياً</div>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map(n => (
              <div key={n.id} className={`rounded-2xl border p-4 ${colors[n.type]} transition-all hover:shadow-md`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl mt-0.5">{n.emoji}</span>
                    <div>
                      <div className={`font-black ${textColors[n.type]}`}>{n.title}</div>
                      <div className={`mt-1 text-sm font-bold opacity-80 ${textColors[n.type]}`}>{n.body}</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">{formatTime(n.time)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
