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

  // 🔑 وضع "نسيت كلمة المرور"
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [forgotStep, setForgotStep] = useState<'request' | 'verify'>('request');
  const [phoneInput, setPhoneInput] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetPass, setResetPass] = useState('');
  const [showResetPass, setShowResetPass] = useState(false);
  const [resetMsg, setResetMsg] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [retrievedEmployee, setRetrievedEmployee] = useState<{ name: string; username: string; phone: string; code: string; waPhone: string } | null>(null);

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

  // 📲 طلب كود الاستعادة برقم الموبايل تلقائياً بدون فتح تطبيقات خارجية
  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    setResetMsg('');
    if (!phoneInput.trim()) {
      setResetMsg('يرجى إدخال رقم الهاتف المسجل');
      return;
    }

    setResetBusy(true);
    try {
      const res = await api.requestWhatsAppResetCode(phoneInput.trim());
      setRetrievedEmployee({
        name: res.name,
        username: res.username,
        phone: res.phone,
        code: res.code,
        waPhone: res.waPhone,
      });

      // وضع الكود تلقائياً في الخانة مباشرة
      setResetCode(res.code);
      setForgotStep('verify');
      setResetMsg(`✅ تم التحقق من رقمك (${res.phone || phoneInput}) بنجاح! تم تعبئة كود الدخول تلقائياً. اكتب كلمة المرور الجديدة الآن.`);
    } catch (err: any) {
      const m = String(err?.serverMessage || err?.message || '');
      if (m.includes('غير مسجل') || err?.message === 'not_found') {
        setResetMsg('❌ رقم الهاتف أو الحساب غير مسجل في النظام. يرجى التأكد من الرقم أو التواصل مع الإدارة.');
      } else {
        setResetMsg('⛔ تعذر توليد الكود حالياً. تأكد من اتصال الإنترنت وحاول مجدداً.');
      }
    } finally {
      setResetBusy(false);
    }
  }

  // 🔑 تأكيد الكود وحفظ الباسورد الجديد والدخول فوراً
  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setResetMsg('');
    setResetBusy(true);

    const targetUser = retrievedEmployee?.username || phoneInput.trim() || username.trim();

    try {
      const r = await api.resetPassword(targetUser, resetCode.trim(), resetPass);
      setResetMsg(`🎉 تم حفظ وتعيين كلمة المرور الجديدة بنجاح يا ${r.name}! جاري الدخول...`);
      setPassword(resetPass);
      setUsername(targetUser);

      setTimeout(() => {
        setMode('login');
        setForgotStep('request');
        setResetMsg('');
      }, 1800);
    } catch (err: any) {
      const m = String(err?.serverMessage || err?.message || '');
      if (m.includes('خلاص وقته') || err?.message === 'expired') {
        setResetMsg('⏰ الكود انتهت صلاحيته (15 دقيقة) — اطلب كود جديد.');
      } else if (m.includes('مش موجود') || m.includes('غلط') || err?.message === 'bad_code') {
        setResetMsg('⛔ الكود غير صحيح — يرجى التأكد من الأرقام الـ 6 المكتوبة.');
      } else if (m.includes('6 حروف') || err?.message === 'bad_request') {
        setResetMsg('⚠️ كلمة المرور الجديدة يجب أن تتكون من 6 أرقام أو حروف على الأقل.');
      } else {
        setResetMsg('⛔ حدث خطأ أثناء الحفظ — يرجى إعادة المحاولة.');
      }
    } finally {
      setResetBusy(false);
    }
  }

  // 💬 رابط اختياري لمراسلة المهندس أحمد سلامة عبر الواتساب للمساعدة
  const adminWaUrl = `https://api.whatsapp.com/send?phone=201014696724&text=${encodeURIComponent(
    `مرحباً مهندس أحمد سلامة،\nأنا مساح/مهندس في قسم المساحة وأحتاج مساعدة في استعادة حسابي على نظام الإجازات (رقم هاتفي: ${phoneInput || '...'}).`
  )}`;

  return (
    <main
      className="min-h-screen overflow-hidden bg-gradient-to-br from-blue-50 via-slate-50 to-violet-50 px-6 py-10 flex items-center justify-center"
      dir="rtl"
    >
      <section className="w-full">
        <div className="mx-auto max-w-xl rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-2xl shadow-slate-200/80 md:p-14">
          
          <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-[2rem] bg-gradient-to-br from-blue-600 to-violet-600 text-5xl text-white shadow-xl shadow-blue-200">
            {mode === 'login' ? '🔐' : '📱'}
          </div>

          <h2 className="text-center text-3xl font-black text-slate-950">
            {mode === 'login' ? 'تسجيل الدخول' : 'استعادة كلمة المرور الفورية'}
          </h2>
          <p className="mt-2 text-center text-sm font-bold text-slate-500">
            {mode === 'login'
              ? 'نظام إدارة الإجازات والمعدات • قسم المساحة'
              : 'أدخل رقم هاتفك المسجل وسيتم تعيين الكود الجديد لك تلقائياً'}
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
                    setForgotStep('request');
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
            /* 2) شاشة نسيت كلمة المرور التلقائية برقم الهاتف */
            /* ========================================================= */
            <div className="mt-6 space-y-5">
              
              {/* الخطوة 1: إدخال رقم الهاتف المسجل */}
              {forgotStep === 'request' && (
                <form onSubmit={handleRequestCode} className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-black text-slate-700">
                      📱 رقم هاتفك المسجل بالنظام
                    </label>
                    <input
                      type="tel"
                      inputMode="tel"
                      value={phoneInput}
                      onChange={e => setPhoneInput(e.target.value)}
                      className="w-full rounded-2xl border-2 border-slate-200 px-5 py-3.5 text-lg font-black tracking-wider text-center outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                      required
                      placeholder="010xxxxxxxx أو 011xxxxxxxx"
                      dir="ltr"
                      autoFocus
                    />
                    <p className="mt-2 text-xs text-slate-500 font-bold text-center">
                      اكتب رقم موبايلك المسجل واضغط الزر بالأسفل للتحقق الفوري
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={resetBusy}
                    className="w-full rounded-2xl bg-gradient-to-l from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 py-4 text-sm font-black text-white shadow-xl shadow-emerald-200 transition-all active:scale-[0.99] disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>⚡</span>
                    <span>{resetBusy ? 'جاري التحقق من الرقم...' : 'تحقق واستلم كود الدخول فوراً 📲'}</span>
                  </button>
                </form>
              )}

              {/* الخطوة 2: الكود تم توليده وتعبئته تلقائياً - فقط يكتب الباسورد الجديد */}
              {forgotStep === 'verify' && (
                <form onSubmit={handleReset} className="space-y-4">
                  
                  {/* كارت تأكيد الحساب والكود التلقائي */}
                  {retrievedEmployee && (
                    <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border-2 border-emerald-300 p-4 rounded-2xl text-center space-y-1.5 shadow-sm">
                      <div className="text-xs font-bold text-emerald-800">
                        👤 مرحباً يا مهندس/ <b>{retrievedEmployee.name}</b> ({retrievedEmployee.phone})
                      </div>
                      <div className="text-sm font-black text-emerald-950 flex items-center justify-center gap-2 pt-1">
                        <span>كود التحقق الخاص بك:</span>
                        <span className="bg-white px-3 py-1 rounded-xl font-mono text-base tracking-widest text-emerald-700 border border-emerald-300 font-black">
                          {retrievedEmployee.code}
                        </span>
                      </div>
                      <div className="text-[11px] font-bold text-emerald-700">
                        ✨ تم إدخال الكود تلقائياً — اكتب كلمة المرور الجديدة بالأسفل فقط
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="mb-1.5 block text-xs font-black text-slate-700">
                      🔢 كود التحقق (تم تعبئته تلقائياً)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={resetCode}
                      onChange={e => setResetCode(e.target.value)}
                      className="w-full rounded-2xl border-2 border-emerald-300 bg-emerald-50/40 px-5 py-3 text-xl font-black tracking-[0.3em] text-center outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 font-mono text-emerald-900"
                      required
                      placeholder="000000"
                      dir="ltr"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-black text-slate-700">
                      🔐 كلمة المرور الجديدة (6 أحرف/أرقام على الأقل)
                    </label>
                    <div className="relative">
                      <input
                        type={showResetPass ? 'text' : 'password'}
                        value={resetPass}
                        onChange={e => setResetPass(e.target.value)}
                        className="w-full rounded-2xl border-2 border-slate-200 px-5 py-3.5 pl-14 text-base font-bold outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                        required
                        placeholder="اكتب كلمة المرور الجديدة"
                        autoFocus
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowResetPass(p => !p)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 p-2 rounded-xl hover:bg-slate-100 transition-all cursor-pointer select-none"
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

                  <button
                    type="submit"
                    disabled={resetBusy}
                    className="w-full rounded-2xl bg-gradient-to-l from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 py-4 text-sm font-black text-white shadow-xl shadow-blue-200 transition-all active:scale-[0.99] disabled:opacity-60 cursor-pointer"
                  >
                    {resetBusy ? 'جاري الحفظ والدخول...' : '🔑 حفظ كلمة المرور الجديدة والدخول الآن 🚀'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setForgotStep('request')}
                    className="w-full text-center text-xs font-bold text-slate-500 hover:text-slate-800 py-1"
                  >
                    ← إدخال رقم هاتف آخر
                  </button>
                </form>
              )}

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

              {/* زر اختياري للتواصل مع المهندس أحمد سلامة */}
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
                    setForgotStep('request');
                    setResetMsg('');
                  }}
                  className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline py-1 text-center cursor-pointer"
                >
                  → العودة لتسجيل الدخول
                </button>
              </div>

            </div>
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
