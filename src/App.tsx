import { useEffect, useState, useCallback, useRef } from 'react';
import {
  initializeData,
  getCurrentUser,
  logout as logoutDb,
  clearAllData,
  refreshCurrentSession,
  getVacations,
  getEmployees,
  refreshFromRemote,
} from './lib/db';
import { getManagedEmployees } from './lib/permissions';
import {
  requestPermission,
  pollManagerAlerts,
  playChime,
  showBrowserNotification,
  isSupported as isNotifSupported,
} from './lib/notifications';
import type { Employee } from './lib/types';
import LoginPage from './components/LoginPage';
import CheckInTab from './components/CheckInTab';
import TrackerTab from './components/TrackerTab';
import AttendanceTab from './components/AttendanceTab';
import CalendarTab from './components/CalendarTab';
import VacationsTab from './components/VacationsTab';
import EmployeesTab from './components/EmployeesTab';
import ReportsTab from './components/ReportsTab';
import LocationsTab from './components/LocationsTab';
import EquipmentTab from './components/EquipmentTab';
import CustodyTab from './components/CustodyTab';
import ApprovalsTab from './components/ApprovalsTab';
import DashboardTab from './components/DashboardTab';
import SettingsTab from './components/SettingsTab';
import CheckInAttemptsTab from './components/CheckInAttemptsTab';
import EmployeeProfileTab from './components/EmployeeProfileTab';
import NotificationsTab from './components/NotificationsTab';
import MyAccountTab from './components/MyAccountTab';
import DailyReviewTab from './components/DailyReviewTab';

type TabKey =
  | 'dashboard'
  | 'checkin'
  | 'tracker'
  | 'attendance'
  | 'calendar'
  | 'daily'
  | 'approvals'
  | 'vacations'
  | 'employees'
  | 'locations'
  | 'equipment'
  | 'custody'
  | 'attempts'
  | 'reports'
  | 'notifications'
  | 'profile'
  | 'myaccount'
  | 'settings';

interface TabDef {
  key: TabKey;
  emoji: string;
  adminOnly?: boolean;
  permission?: keyof Pick<
    Employee,
    | 'canViewDashboard'
    | 'canCheckIn'
    | 'canViewMyAccount'
    | 'canRequestVacations'
    | 'canViewNotifications'
    | 'canViewDailyReview'
    | 'canViewAttendance'
    | 'canEditAttendance'
    | 'canApproveVacations'
    | 'canViewReports'
    | 'canManageEmployees'
    | 'canManageSettings'
    | 'canManageLocations'
    | 'canLockMonths'
    | 'canViewAuditLog'
  >;
}

const TABS: TabDef[] = [
  { key: 'dashboard', emoji: '📊', permission: 'canViewDashboard' },
  { key: 'notifications', emoji: '🔔', permission: 'canViewNotifications' },
  { key: 'checkin', emoji: '👆', permission: 'canCheckIn' },
  { key: 'myaccount', emoji: '👤', permission: 'canViewMyAccount' },
  { key: 'tracker', emoji: '📋', permission: 'canViewAttendance' },
  { key: 'attendance', emoji: '📊', permission: 'canViewAttendance' },
  { key: 'calendar', emoji: '📅', permission: 'canViewAttendance' },
  { key: 'daily', emoji: '📌', permission: 'canViewDailyReview' },
  { key: 'vacations', emoji: '🗓️', permission: 'canRequestVacations' },
  { key: 'approvals', emoji: '✅', permission: 'canApproveVacations' },
  { key: 'employees', emoji: '👥', permission: 'canManageEmployees' },
  { key: 'locations', emoji: '📍', permission: 'canManageLocations' },
  { key: 'equipment', emoji: '🧰' },
  { key: 'custody', emoji: '👥', adminOnly: true },
  { key: 'attempts', emoji: '📡', permission: 'canViewAuditLog' },
  { key: 'reports', emoji: '📁', permission: 'canViewReports' },
  { key: 'settings', emoji: '⚙️', permission: 'canManageSettings' },
];

export default function App() {
  const [user, setUser] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('checkin');
  const [menuOpen, setMenuOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [profileEmployeeId, setProfileEmployeeId] = useState<number | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  async function enableNotifications() {
    if (!isNotifSupported()) return;
    await requestPermission();
  }

  // 🔔 دورة تنبيهات المدير: تحديث من السيرفر + صوت + إشعار متصفح عند طلبات جديدة
  const lastPendingRef = useRef<number | null>(null);
  useEffect(() => {
    if (!user || (user.role !== 'admin' && user.role !== 'manager')) return;
    const u = user;
    let stopped = false;
    async function tick() {
      try {
        const result = await pollManagerAlerts(u);
        if (!result || stopped) return;
        setPendingCount(result.pending);
        if (lastPendingRef.current !== null && result.pending > lastPendingRef.current) {
          playChime();
          showBrowserNotification(
            '🔔 طلب إجازة جديد',
            `عندك ${result.pending} طلب معلق في انتظار الموافقة`,
          );
        }
        lastPendingRef.current = result.pending;
      } catch {
        // الشبكة وقعت — نحاول في الدورة الجاية
      }
    }
    tick();
    const t = setInterval(tick, 45000);
    return () => {
      stopped = true;
      clearInterval(t);
      lastPendingRef.current = null;
    };
  }, [user?.id]);

  const updatePendingCount = useCallback(() => {
    const vacs = getVacations();
    if (!user) {
      setPendingCount(vacs.filter(v => v.status === 'بانتظار الموافقة').length);
      return;
    }
    if (user.role === 'admin') {
      setPendingCount(vacs.filter(v => v.status === 'بانتظار الموافقة').length);
    } else if (user.role === 'manager') {
      const managedIds = new Set(
        (user.locationIds || []).length === 0
          ? getEmployees().map(e => e.id)
          : getEmployees()
              .filter(
                e =>
                  e.active &&
                  e.role !== 'admin' &&
                  (e.id === user.id ||
                    e.locationIds.some(id => user.locationIds.includes(id))),
              )
              .map(e => e.id),
      );
      setPendingCount(
        vacs.filter(v => v.status === 'بانتظار الموافقة' && managedIds.has(v.employeeId))
          .length,
      );
    } else {
      setPendingCount(0);
    }
  }, [user?.id]);

  useEffect(() => {
    async function boot() {
      const isFirstLoad = !localStorage.getItem('vacation_system_initialized_v5');
      if (isFirstLoad) {
        await clearAllData();
        localStorage.setItem('vacation_system_initialized_v5', 'true');
      }
      await initializeData();
      const currentUser = getCurrentUser();
      if (currentUser) {
        setUser(currentUser);
        const hasPerms =
          currentUser.role === 'admin' ||
          currentUser.canViewAttendance ||
          currentUser.canEditAttendance ||
          currentUser.canApproveVacations ||
          currentUser.canViewReports ||
          currentUser.canManageEmployees ||
          currentUser.canManageSettings ||
          currentUser.canManageLocations ||
          currentUser.canViewAuditLog;
        if (hasPerms) setTab('dashboard');
      }
      setDarkMode(localStorage.getItem('vacation_dark_mode') === 'true');
      setLoading(false);
    }
    boot();
  }, []);

  useEffect(() => {
    updatePendingCount();
    const t = setInterval(updatePendingCount, 5000);
    return () => clearInterval(t);
  }, [updatePendingCount, refreshKey]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function tick() {
      const ok = await refreshFromRemote();
      if (!cancelled && ok) {
        const fresh = refreshCurrentSession();
        if (fresh) setUser(fresh);
        setRefreshKey(k => k + 1);
      }
    }
    const first = setTimeout(tick, 3000);
    const t = setInterval(tick, 2 * 60 * 1000);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(t);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    const fresh = refreshCurrentSession();
    if (fresh) setUser(fresh);
  }, [refreshKey]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('vacation_dark_mode', String(darkMode));
  }, [darkMode]);

  // 🖥️ متابعة حالة ملء الشاشة
  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else {
        const req = (document.documentElement as any).requestFullscreen;
        if (req) req.call(document.documentElement).catch(() => {});
      }
    } catch {
      // آيفون سفاري مش بيدعم Fullscreen API — بيستخدم وضع التطبيق بدلها
    }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    document.documentElement.lang = 'ar';
    document.documentElement.dir = 'rtl';
  }, []);

  function handleLogin(loggedInUser: Employee) {
    setUser(loggedInUser);
    const hasPerms =
      loggedInUser.role === 'admin' ||
      loggedInUser.canViewAttendance ||
      loggedInUser.canEditAttendance ||
      loggedInUser.canApproveVacations ||
      loggedInUser.canViewReports ||
      loggedInUser.canManageEmployees ||
      loggedInUser.canManageSettings ||
      loggedInUser.canManageLocations ||
      loggedInUser.canViewAuditLog;
    setTab(hasPerms ? 'dashboard' : 'checkin');
    setShowWelcome(true);
    setTimeout(() => setShowWelcome(false), 3000);
    enableNotifications();
  }

  function handleLogout() {
    if (!window.confirm('هل أنت متأكد من تسجيل الخروج؟')) return;
    logoutDb();
    setUser(null);
    setTab('checkin');
  }

  function handleDataChange() {
    setRefreshKey(k => k + 1);
  }

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900"
        dir="rtl"
      >
        <div className="text-center">
          <div className="text-5xl mb-4 animate-bounce">📋</div>
          <div className="text-lg font-black text-slate-500 dark:text-slate-300">
            جاري تحميل النظام...
          </div>
        </div>
      </div>
    );
  }

  if (!user) return <LoginPage onLogin={handleLogin} />;

  const hasAnyPerm =
    user.role === 'admin' ||
    user.canViewDashboard ||
    user.canViewAttendance ||
    user.canEditAttendance ||
    user.canApproveVacations ||
    user.canViewReports ||
    user.canManageEmployees ||
    user.canManageSettings ||
    user.canManageLocations ||
    user.canViewAuditLog;

  function hasPermission(permission?: keyof Employee): boolean {
    if (!permission) return true;
    if (user!.role === 'admin') return true;
    const value = user![permission];
    if (value === undefined) {
      return ['canCheckIn', 'canViewMyAccount', 'canRequestVacations', 'canViewNotifications'].includes(
        permission as string,
      );
    }
    return Boolean(value);
  }

  const visibleTabs = TABS.filter(t => {
    if (t.key === 'dashboard')
      return user.role !== 'employee' && hasPermission(t.permission as keyof Employee);
    if (t.permission) return hasPermission(t.permission as keyof Employee);
    if (t.adminOnly) return user.role === 'admin';
    return true;
  });

  const activeTab: TabKey =
    tab === 'profile' && profileEmployeeId
      ? 'profile'
      : visibleTabs.find(t => t.key === tab)
        ? tab
        : visibleTabs[0]?.key || 'checkin';

  function getBadge(key: TabKey): number {
    if (key === 'approvals') return pendingCount;
    return 0;
  }

  const searchEmployees = user
    ? getManagedEmployees(user)
        .filter(emp => {
          const q = searchQuery.trim().toLowerCase();
          if (!q) return false;
          return (
            emp.name.toLowerCase().includes(q) ||
            emp.username.toLowerCase().includes(q) ||
            (emp.phone || '').includes(q) ||
            (emp.jobTitle || '').toLowerCase().includes(q)
          );
        })
        .slice(0, 8)
    : [];

  const searchTabs = visibleTabs
    .filter(item => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return false;
      return tabLabel(item.key).toLowerCase().includes(q);
    })
    .slice(0, 8);

  function roleLabel(role: Employee['role']): string {
    if (role === 'admin') return 'مدير النظام';
    if (role === 'manager') return 'مدير فرعي';
    return 'موظف';
  }

  function tabLabel(key: TabKey): string {
    const map: Record<TabKey, string> = {
      dashboard: 'لوحة التحكم',
      notifications: 'الإشعارات',
      checkin: 'بصمة حضور',
      myaccount: 'حسابي',
      tracker: 'رصيد الإجازات',
      attendance: 'تتبع الحضور',
      calendar: 'التقويم',
      daily: 'مراجعة اليوم',
      approvals: 'الاعتمادات',
      vacations: 'الإجازات',
      employees: 'الموظفين',
      locations: 'المواقع',
      equipment: 'استلام وتسليم العدة',
      custody: 'عهدة المساحين',
      attempts: 'سجل البصمات',
      reports: 'التقارير',
      profile: 'ملف الموظف',
      settings: 'الإعدادات',
    };
    return map[key];
  }

  return (
    <div
      className="min-h-screen transition-colors duration-300 bg-slate-100 dark:bg-slate-900"
      dir="rtl"
    >
      {showWelcome && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[200] animate-bounce">
          <div className="rounded-2xl bg-gradient-to-l from-blue-600 to-indigo-600 px-8 py-4 text-white shadow-2xl shadow-blue-200 dark:shadow-blue-900">
            <div className="text-lg font-black">👋 أهلاً بك يا {user.name}!</div>
            <div className="text-xs font-bold text-blue-100 mt-1">تم تسجيل دخولك بنجاح</div>
          </div>
        </div>
      )}
      <header className="sticky top-0 z-50 shadow-sm border-b px-4 md:px-6 py-3 flex items-center justify-between bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMenuOpen(true)}
            className="rounded-xl border px-3 py-2 text-xl font-black hover:opacity-80 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 relative"
          >
            ☰
            {pendingCount > 0 && (
              <span className="absolute -top-1 -left-1 w-5 h-5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center animate-pulse">
                {pendingCount}
              </span>
            )}
          </button>
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-md text-white font-black text-xl">
            📋
          </div>
          <div>
            <h1 className="font-black text-lg leading-tight text-slate-900 dark:text-white">
              نظام إدارة الإجازات
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <p className="text-[12px] font-bold text-slate-500 dark:text-slate-400">
                {user.name}
                <span className="mx-1">•</span>
                {roleLabel(user.role)}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSearchOpen(true)}
            className="hidden md:flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black transition bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
          >
            🔎 بحث <span className="text-[10px] opacity-60">Ctrl+K</span>
          </button>
          <button
            onClick={toggleFullscreen}
            className="rounded-xl px-3 py-2 text-lg transition bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
            title={isFullscreen ? 'الخروج من ملء الشاشة' : 'ملء الشاشة'}
          >
            {isFullscreen ? '🔳' : '🖥️'}
          </button>
          <button
            onClick={() => setDarkMode(d => !d)}
            className="rounded-xl px-3 py-2 text-lg transition bg-slate-100 dark:bg-yellow-500/20 text-slate-600 dark:text-yellow-400 hover:bg-slate-200 dark:hover:bg-yellow-500/30"
            title={darkMode ? 'وضع نهاري' : 'وضع ليلي'}
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
          <button
            onClick={() => setTab('myaccount')}
            className="rounded-xl px-3 py-2 text-lg transition bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
            title="حسابي"
          >
            👤
          </button>
          <button
            onClick={handleLogout}
            className="group flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-xl transition-all duration-300 border border-transparent text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 hover:border-red-100 dark:hover:border-red-800"
          >
            <span>خروج</span>
            <span className="transition-transform group-hover:translate-x-1">←</span>
          </button>
        </div>
      </header>
      {menuOpen && (
        <div
          className="fixed inset-0 z-[100] bg-slate-950/50"
          onClick={() => setMenuOpen(false)}
        >
          <aside
            className="h-full w-80 max-w-[88vw] p-4 shadow-2xl overflow-y-auto bg-white dark:bg-slate-800"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between border-b pb-3 border-slate-200 dark:border-slate-700">
              <div>
                <div className="font-black text-slate-900 dark:text-white">قائمة النظام</div>
                <div className="text-xs font-bold text-slate-400">اختر الصفحة</div>
              </div>
              <button
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-black bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
              >
                ✕
              </button>
            </div>
            <div className="space-y-1.5">
              {visibleTabs.map(item => {
                const badge = getBadge(item.key);
                return (
                  <button
                    key={item.key}
                    onClick={() => {
                      setTab(item.key);
                      setMenuOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm font-black transition-all ${
                      activeTab === item.key
                        ? 'border-blue-500 bg-blue-600 text-white shadow-md'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 hover:border-blue-200 hover:bg-blue-50 dark:hover:bg-slate-700 hover:text-blue-700 dark:hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span>{item.emoji}</span>
                      <span>{tabLabel(item.key)}</span>
                    </span>
                    {badge > 0 && (
                      <span className="min-w-[20px] h-5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center px-1 animate-pulse">
                        {badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      )}
      {searchOpen && (
        <div
          className="fixed inset-0 z-[300] bg-slate-950/50 p-4"
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="mx-auto mt-20 max-w-2xl rounded-[2rem] bg-white shadow-2xl border border-slate-200 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-100">
              <input
                autoFocus
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="ابحث عن موظف أو صفحة..."
                className="w-full rounded-2xl border border-slate-200 px-5 py-4 text-lg font-bold outline-none focus:border-blue-500"
              />
            </div>
            <div className="max-h-[420px] overflow-y-auto p-3 space-y-4">
              <div>
                <div className="px-2 pb-2 text-xs font-black text-slate-400">الصفحات</div>
                {searchTabs.length === 0 ? (
                  <div className="px-3 py-2 text-sm font-bold text-slate-400">
                    اكتب للبحث في الصفحات
                  </div>
                ) : (
                  searchTabs.map(item => (
                    <button
                      key={item.key}
                      onClick={() => {
                        setTab(item.key);
                        setSearchOpen(false);
                        setSearchQuery('');
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-right hover:bg-blue-50 font-bold"
                    >
                      <span>{item.emoji}</span>
                      <span>{tabLabel(item.key)}</span>
                    </button>
                  ))
                )}
              </div>
              <div>
                <div className="px-2 pb-2 text-xs font-black text-slate-400">الموظفين</div>
                {searchEmployees.length === 0 ? (
                  <div className="px-3 py-2 text-sm font-bold text-slate-400">
                    اكتب اسم، يوزر، رقم هاتف أو وظيفة
                  </div>
                ) : (
                  searchEmployees.map(emp => (
                    <button
                      key={emp.id}
                      onClick={() => {
                        setProfileEmployeeId(emp.id);
                        setTab('profile');
                        setSearchOpen(false);
                        setSearchQuery('');
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-right hover:bg-slate-50"
                    >
                      <div>
                        <div className="font-black text-slate-900">{emp.name}</div>
                        <div className="text-xs font-bold text-slate-400">
                          {emp.jobTitle || '—'} · {emp.phone || emp.username}
                        </div>
                      </div>
                      <span className="text-xs font-black text-blue-600">فتح الملف</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <main className="p-3 md:p-5 w-full">
        {activeTab === 'dashboard' && hasAnyPerm && user.role !== 'employee' && (
          <DashboardTab user={user} onNavigate={t => setTab(t as TabKey)} />
        )}
        {activeTab === 'notifications' && <NotificationsTab user={user} />}
        {activeTab === 'checkin' && (
          <CheckInTab user={user} onDataChange={handleDataChange} />
        )}
        {activeTab === 'myaccount' && <MyAccountTab user={user} />}
        {activeTab === 'tracker' && <TrackerTab user={user} refreshKey={refreshKey} />}
        {activeTab === 'attendance' && (
          <AttendanceTab
            user={user}
            readOnly={user.role === 'employee' || !(user.role === 'admin' || user.canEditAttendance)}
            currentUserId={user.role === 'employee' ? user.id : undefined}
            onSaved={handleDataChange}
          />
        )}
        {activeTab === 'calendar' &&
          (user.role === 'admin' || user.canViewAttendance) && (
            <CalendarTab user={user} />
          )}
        {activeTab === 'daily' &&
          (user.role === 'admin' || user.role === 'manager' || user.canViewAttendance) && (
            <DailyReviewTab user={user} />
          )}
        {activeTab === 'vacations' && (
          <VacationsTab user={user} onChanged={handleDataChange} />
        )}
        {activeTab === 'approvals' &&
          (user.role === 'admin' || user.canApproveVacations) && (
            <ApprovalsTab user={user} onChanged={handleDataChange} />
          )}
        {activeTab === 'employees' &&
          (user.role === 'admin' || user.canManageEmployees) && (
            <EmployeesTab
              user={user}
              onOpenProfile={id => {
                setProfileEmployeeId(id);
                setTab('profile');
              }}
            />
          )}
        {activeTab === 'profile' && profileEmployeeId && (
          <EmployeeProfileTab
            employeeId={profileEmployeeId}
            onBack={() => {
              setProfileEmployeeId(null);
              setTab('employees');
            }}
          />
        )}
        {activeTab === 'locations' &&
          (user.role === 'admin' || user.canManageLocations) && <LocationsTab user={user} />}
        {activeTab === 'equipment' && <EquipmentTab user={user} />}
        {activeTab === 'custody' && <CustodyTab user={user} />}
        {activeTab === 'attempts' &&
          (user.role === 'admin' || user.canViewAuditLog) && <CheckInAttemptsTab user={user} />}
        {activeTab === 'reports' &&
          (user.role === 'admin' || user.canViewReports || user.role === 'employee') && (
            <ReportsTab user={user} />
          )}
        {activeTab === 'settings' &&
          (user.role === 'admin' || user.canManageSettings) && <SettingsTab />}
      </main>
      <footer className="mt-10 border-t px-4 py-8 text-center bg-white/70 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700">
        <p className="text-sm font-bold text-slate-500 dark:text-slate-400">
          نظام إدارة الإجازات • قسم المساحة • 2026
        </p>
        <p className="mt-2 text-base font-black text-slate-800 dark:text-slate-200">
          Developed & Maintained by Eng Ahmed Salama
        </p>
      </footer>
    </div>
  );
}
