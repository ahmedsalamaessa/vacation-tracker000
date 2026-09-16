import { useState } from 'react';
import { login, initializeData } from '../lib/db';
import { api } from '../lib/api';
import type { Employee } from '../lib/types';

interface LoginPageProps {
  onLogin: (user: Employee) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // 🔑 وضع "نسيت كلمة المرور التلقائي" (بدون مغادرة التطبيق أو فتح نوافذ خارجية)
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [phoneInput, setPhoneInput] = useState('');
  const [resetPass, setResetPass] = useState('');
  const [showResetPass, setShowResetPass] = useState(false);
  const [resetMsg, setResetMsg] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    await initializeData();
    try {
      const user = await login(username, password);
      if (user) {
        onLogin(user);
      } else {
        setError('بيانات الدخول غير صحيحة');
      }
    } catch (err: any) {
      const m = String(err?.message || '');
      if (m === 'SERVICE_DOWN') setError('⛔ خدمة قاعدة البيانات متوقفة مؤقتًا (حصة النقل) — بترجع تلقائيًا أول الشهر');
      else if (m === 'too_many_attempts' || m.includes('محاولات كتيرة')) setError('⏳ محاولات دخول كتيرة على نفس الحساب — استنى دقيقة وحاول تاني');
      else if (m === 'NETWORK_TIMEOUT') setError('⏳ الخدمة واخدة وقت شوية في الرد — استنى ثانية وحاول تاني');
      else setError('حدث خطأ أثناء تسجيل الدخول — تأكد من الإنترنت وحاول تاني');
    }
    setBusy(false);
  }

  // ⚡ إعادة تعيين كلمة المرور فوراً برقم الهاتف تلقائياً بدون مغادرة التطبيق
  async function handleDirectReset(e: React.FormEvent) {
    e.preventDefault();
    setResetMsg('');

    if (!phoneInput.trim()) {
      setResetMsg('يرجى إدخال رقم هاتفك المسجل أو اسم المستخدم');
      return;
    }
    if (!resetPass || resetPass.length < 6) {
      setResetMsg('⚠️ كلمة المرور الجديدة يجب أن تكون 6 أرقام أو حروف على الأقل');
      return;
    }

    setResetBusy(true);
    try {
      const res = await api.directResetPassword(phoneInput.trim(), resetPass.trim());
      setResetMsg(`🎉 تم بنجاح تغيير كلمة المرور للمهندس/ ${res.name}! جاري تسجيل دخولك تلقائياً...`);
      
      // تسجيل الدخول التلقائي بالبيانات الجديدة فوراً
      await initializeData();
      const targetUser = res.username || phoneInput.trim();
      const loggedUser = await login(targetUser, resetPass.trim());
      
      if (loggedUser) {
        setTimeout(() => {
          onLogin(loggedUser);
        }, 1000);
      } else {
        setPassword(resetPass);
        setUsername(targetUser);
        setTimeout(() => {
          setMode('login');
          setResetMsg('');
        }, 1500);
      }
    } catch (err: any) {
      const m = String(err?.serverMessage || err?.message || '');
      if (m.includes('غير مسجل') || err?.message === 'not_found') {
        setResetMsg('❌ رقم الهاتف غير مسجل في قاعدة بيانات النظام. يرجى التأكد من الرقم.');
      } else if (m.includes('6 أرقام') || m.includes('6 حروف')) {
        setResetMsg('⚠️ كلمة المرور الجديدة يجب أن تكون 6 أرقام أو حروف على الأقل.');
      } else {
        setResetMsg('⛔ تعذر تحديث كلمة المرور. تأكد من اتصال الإنترنت وحاول مجدداً.');
      }
    } finally {
      setResetBusy(false);
    }
  }

  // 💬 رابط المساعدة المباشرة
  const adminWaUrl = `https://api.whatsapp.com/send?phone=201014696724&text=${encodeURIComponent(
    `مرحباً مهندس أحمد سلامة،\nأنا مساح في قسم المساحة وأحتاج مساعدة في الدخول لحسابي (رقم هاتفي: ${phoneInput || '...'}).`
  )}`;

  return (
    <main
      className="min-h-screen overflow-hidden bg-gradient-to-br from-blue-50 via-slate-50 to-violet-50 px-6 py-10 flex items-center justify-center"
      dir="rtl"
    >
      <section className="w-full">
        <div className="mx-auto max-w-xl rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-2xl shadow-slate-200/80 md:p-14">
          
          <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-[2rem] bg-gradient-to-br from-blue-600 to-violet-600 text-5xl text-white shadow-xl shadow-blue-200">
            {mode === 'login' ? '🔐' : '⚡'}
          </div>

          <h2 className="text-center text-3xl font-black text-slate-950">
            {mode === 'login' ? 'تسجيل الدخول' : 'استعادة كلمة المرور الفورية'}
          </h2>
          <p className="mt-2 text-center text-sm font-bold text-slate-500">
            {mode === 'login'
              ? 'نظام إدارة الإجازات والمعدات • قسم المساحة'
              : 'اكتب رقم هاتفك المسجل وكلمة المرور الجديدة وسيتم التعيين فوراً'}
          </p>

          {error && mode === 'login' && (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-center text-xs font-bold text-red-700">
              {error}
            </div>
          )}

          {/* ========================================================= */}
          {/* 1) شاشة تسجيل الدخول العادية */}
          {/* ========================================================= */}
          {mode === 'login' ? (
            <form onSubmit={handleSubmit} className="mt-8 space-y-5" autoComplete="off">
              <div>
                <label className="mb-2 block text-sm font-black text-slate-700">اسم المستخدم أو رقم الهاتف</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="username"
                  className="w-full rounded-2xl border-2 border-slate-200 px-5 py-3.5 text-base font-bold outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  required
                  placeholder="مثال: ahmed أو 01014696724"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-black text-slate-700">كلمة المرور</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="w-full rounded-2xl border-2 border-slate-200 px-5 py-3.5 pl-14 text-base font-bold outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    required
                    placeholder="اكتب كلمة المرور"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword(p => !p)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 p-2 rounded-xl hover:bg-slate-100 transition-all cursor-pointer select-none"
                    title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-500 pt-1">
                <span>🔒 الجلسة محفوظة بأمان على جهازك</span>
                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot');
                    setError('');
                    setResetMsg('');
                  }}
                  className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer font-black"
                >
                  نسيت كلمة المرور؟
                </button>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-2xl bg-gradient-to-l from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 py-4 text-base font-black text-white shadow-xl shadow-blue-200 transition-all active:scale-[0.99] disabled:opacity-60 cursor-pointer"
              >
                {busy ? 'جاري الدخول...' : 'تسجيل الدخول إلى النظام 🚀'}
              </button>
            </form>
          ) : (
            /* ========================================================= */
            /* 2) شاشة نسيت كلمة المرور التلقائية والمباشرة */
            /* ========================================================= */
            <form onSubmit={handleDirectReset} className="mt-6 space-y-4" autoComplete="off">
              <div>
                <label className="mb-2 block text-sm font-black text-slate-700">
                  📱 رقم هاتفك المسجل أو اسم المستخدم
                </label>
                <input
                  type="text"
                  value={phoneInput}
                  onChange={e => setPhoneInput(e.target.value)}
                  className="w-full rounded-2xl border-2 border-slate-200 px-5 py-3.5 text-base font-bold outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                  required
                  placeholder="مثال: 01014696724 أو ahmed"
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-black text-slate-700">
                  🔐 كلمة المرور الجديدة (6 أرقام/حروف على الأقل)
                </label>
                <div className="relative">
                  <input
                    type={showResetPass ? 'text' : 'password'}
                    value={resetPass}
                    onChange={e => setResetPass(e.target.value)}
                    className="w-full rounded-2xl border-2 border-slate-200 px-5 py-3.5 pl-14 text-base font-bold outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                    required
                    placeholder="اكتب كلمة المرور الجديدة"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowResetPass(p => !p)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-emerald-600 p-2 rounded-xl hover:bg-slate-100 transition-all cursor-pointer select-none"
                    title={showResetPass ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    {showResetPass ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {resetMsg && (
                <div
                  className={`rounded-2xl border px-4 py-3 text-center text-xs font-black whitespace-pre-line leading-relaxed ${
                    resetMsg.startsWith('✅') || resetMsg.startsWith('🎉')
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                      : 'border-rose-300 bg-rose-50 text-rose-800'
                  }`}
                >
                  {resetMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={resetBusy}
                className="w-full rounded-2xl bg-gradient-to-l from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 py-4 text-sm font-black text-white shadow-xl shadow-emerald-200 transition-all active:scale-[0.99] disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
              >
                <span>⚡</span>
                <span>{resetBusy ? 'جاري الحفظ والتسجيل...' : 'تغيير كلمة المرور والدخول فوراً 🚀'}</span>
              </button>

              <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
                <a
                  href={adminWaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 px-4 rounded-xl border border-emerald-300 bg-emerald-50/70 hover:bg-emerald-100 text-emerald-900 text-xs font-black flex items-center justify-center gap-1.5 transition-all text-center"
                >
                  <span>💬</span>
                  <span>تواصل مع المهندس أحمد سلامة عبر الواتساب للمساعدة</span>
                </a>

                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setResetMsg('');
                  }}
                  className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline py-1 text-center cursor-pointer"
                >
                  → العودة لتسجيل الدخول
                </button>
              </div>
            </form>
          )}

          <div className="mt-8 border-t border-slate-100 pt-5 text-center text-xs font-bold text-slate-500">
            Developed &amp; Maintained by <b className="text-slate-800">Eng Ahmed Salama</b>
            <div className="mt-1 text-[11px] font-black text-slate-400">قسم المساحة • 2026</div>
          </div>

        </div>
      </section>
    </main>
  );
}
