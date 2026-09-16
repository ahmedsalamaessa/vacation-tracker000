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

  // 🔑 وضع "نسيت كلمة المرور بنظام كود التحقق OTP"
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [forgotStep, setForgotStep] = useState<'phone_request' | 'enter_code'>('phone_request');
  const [phoneInput, setPhoneInput] = useState('');
  const [enteredCode, setEnteredCode] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [incomingSmsCode, setIncomingSmsCode] = useState<string | null>(null);
  const [retrievedEmployee, setRetrievedEmployee] = useState<{ name: string; username: string; phone: string } | null>(null);
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

  // 1️⃣ الخطوة الأولى: إرسال كود التحقق إلى رقم الهاتف
  async function handleSendVerificationCode(e: React.FormEvent) {
    e.preventDefault();
    setResetMsg('');
    if (!phoneInput.trim()) {
      setResetMsg('يرجى كتابة رقم هاتفك المسجل أو اسم المستخدم');
      return;
    }

    setResetBusy(true);
    try {
      const res = await api.requestWhatsAppResetCode(phoneInput.trim());
      setRetrievedEmployee({
        name: res.name,
        username: res.username,
        phone: res.phone || phoneInput.trim(),
      });
      setIncomingSmsCode(res.code);
      setForgotStep('enter_code');
      setResetMsg(`✅ تم توليد وإرسال كود التحقق المكون من 6 أرقام لهاتفك بنجاح!`);
    } catch (err: any) {
      const m = String(err?.serverMessage || err?.message || '');
      if (m.includes('غير مسجل') || err?.message === 'not_found') {
        setResetMsg('❌ رقم الهاتف غير مسجل بالنظام. تأكد من الرقم أو تواصل مع الإدارة.');
      } else {
        setResetMsg('⛔ تعذر إرسال كود التحقق حالياً. تأكد من اتصال الإنترنت وحاول ثانية.');
      }
    } finally {
      setResetBusy(false);
    }
  }

  // 2️⃣ الخطوة الثانية: تأكيد الكود وتعيين كلمة المرور الجديدة
  async function handleVerifyCodeAndReset(e: React.FormEvent) {
    e.preventDefault();
    setResetMsg('');

    if (!enteredCode.trim()) {
      setResetMsg('يرجى كتابة كود التحقق المكون من 6 أرقام');
      return;
    }
    if (!newPasswordInput || newPasswordInput.length < 6) {
      setResetMsg('⚠️ كلمة المرور الجديدة يجب أن تكون 6 أرقام أو حروف على الأقل');
      return;
    }

    setResetBusy(true);
    const targetUser = retrievedEmployee?.username || phoneInput.trim();

    try {
      const r = await api.resetPassword(targetUser, enteredCode.trim(), newPasswordInput.trim());
      setResetMsg(`🎉 تم تأكيد الكود وتعيين كلمة المرور الجديدة بنجاح للمهندس/ ${r.name}! جاري الدخول...`);
      
      // تسجيل الدخول التلقائي فوراً
      await initializeData();
      const loggedUser = await login(targetUser, newPasswordInput.trim());
      if (loggedUser) {
        setTimeout(() => {
          onLogin(loggedUser);
        }, 1200);
      } else {
        setPassword(newPasswordInput);
        setUsername(targetUser);
        setTimeout(() => {
          setMode('login');
          setResetMsg('');
        }, 1500);
      }
    } catch (err: any) {
      const m = String(err?.serverMessage || err?.message || '');
      if (m.includes('خلاص وقته') || err?.message === 'expired') {
        setResetMsg('⏰ كود التحقق انتهت صلاحيته (15 دقيقة) — اطلب كوداً جديداً.');
      } else if (m.includes('مش موجود') || m.includes('غلط') || err?.message === 'bad_code') {
        setResetMsg('⛔ كود التحقق غير صحيح — يرجى مراجعة الأرقام الـ 6 المكتوبة.');
      } else if (m.includes('6 حروف') || err?.message === 'bad_request') {
        setResetMsg('⚠️ كلمة المرور الجديدة يجب أن تكون 6 أرقام أو حروف على الأقل.');
      } else {
        setResetMsg('⛔ حدث خطأ أثناء تأكيد الكود — يرجى المحاولة ثانية.');
      }
    } finally {
      setResetBusy(false);
    }
  }

  // 💬 رابط اختياري لمراسلة الإدارة
  const adminWaUrl = `https://api.whatsapp.com/send?phone=201014696724&text=${encodeURIComponent(
    `مرحباً مهندس أحمد سلامة،\nأنا مساح في قسم المساحة وأحتاج مساعدة في كود التحقق (رقم هاتفي: ${phoneInput || '...'}).`
  )}`;

  return (
    <main
      className="min-h-screen overflow-hidden bg-gradient-to-br from-blue-50 via-slate-50 to-violet-50 px-6 py-10 flex items-center justify-center"
      dir="rtl"
    >
      <section className="w-full">
        <div className="mx-auto max-w-xl rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-2xl shadow-slate-200/80 md:p-14">
          
          <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-[2rem] bg-gradient-to-br from-blue-600 to-violet-600 text-5xl text-white shadow-xl shadow-blue-200">
            {mode === 'login' ? '🔐' : '📩'}
          </div>

          <h2 className="text-center text-3xl font-black text-slate-950">
            {mode === 'login' ? 'تسجيل الدخول' : 'إرسال كود التحقق للهاتف'}
          </h2>
          <p className="mt-2 text-center text-sm font-bold text-slate-500">
            {mode === 'login'
              ? 'نظام إدارة الإجازات والمعدات • قسم المساحة'
              : 'أدخل رقم هاتفك ليصلك كود التحقق وتعيين كلمة مرور جديدة'}
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
                    setForgotStep('phone_request');
                    setError('');
                    setResetMsg('');
                    setIncomingSmsCode(null);
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
            /* 2) شاشة نسيت كلمة المرور بنظام كود التحقق OTP */
            /* ========================================================= */
            <div className="mt-6 space-y-5">
              
              {/* الخطوة 1: طلب الكود برقم الهاتف */}
              {forgotStep === 'phone_request' && (
                <form onSubmit={handleSendVerificationCode} className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-black text-slate-700">
                      📱 رقم الهاتف المسجل بالحساب
                    </label>
                    <input
                      type="tel"
                      inputMode="tel"
                      value={phoneInput}
                      onChange={e => setPhoneInput(e.target.value)}
                      className="w-full rounded-2xl border-2 border-slate-200 px-5 py-3.5 text-lg font-black tracking-wider text-center outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                      required
                      placeholder="010xxxxxxxx أو 011xxxxxxxx"
                      dir="ltr"
                      autoFocus
                    />
                    <p className="mt-2 text-xs text-slate-500 font-bold text-center">
                      سيقوم النظام بالتحقق من رقمك وإرسال كود التحقق (OTP) الخاص بك فوراً
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={resetBusy}
                    className="w-full rounded-2xl bg-gradient-to-l from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 py-4 text-sm font-black text-white shadow-xl shadow-blue-200 transition-all active:scale-[0.99] disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>📩</span>
                    <span>{resetBusy ? 'جاري إرسال الكود...' : 'إرسال كود التحقق للهاتف 📲'}</span>
                  </button>
                </form>
              )}

              {/* الخطوة 2: إدخال كود التحقق وتعيين كلمة المرور الجديدة */}
              {forgotStep === 'enter_code' && (
                <form onSubmit={handleVerifyCodeAndReset} className="space-y-4">
                  
                  {/* كارت إشعار استلام الكود على الهاتف */}
                  {incomingSmsCode && (
                    <div className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white p-4 rounded-2xl text-center space-y-1 shadow-lg shadow-emerald-100 animate-fade-in">
                      <div className="text-xs font-bold opacity-90">
                        📩 رسالة كود التحقق الواردة لهاتفك ({retrievedEmployee?.phone || phoneInput}):
                      </div>
                      <div className="text-2xl font-black font-mono tracking-[0.25em] py-1 bg-white/20 rounded-xl my-1 border border-white/30">
                        {incomingSmsCode}
                      </div>
                      <div className="text-[11px] font-bold opacity-90">
                        👤 الحساب: {retrievedEmployee?.name} — أدخل الكود بالأسفل لتأكيد هويتك
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="mb-1.5 block text-xs font-black text-slate-700">
                      🔢 كود التحقق (6 أرقام)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={enteredCode}
                      onChange={e => setEnteredCode(e.target.value)}
                      className="w-full rounded-2xl border-2 border-slate-300 px-5 py-3 text-xl font-black tracking-[0.3em] text-center outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 font-mono"
                      required
                      placeholder="000000"
                      dir="ltr"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-black text-slate-700">
                      🔐 كلمة المرور الجديدة (6 أحرف/أرقام على الأقل)
                    </label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPasswordInput}
                        onChange={e => setNewPasswordInput(e.target.value)}
                        className="w-full rounded-2xl border-2 border-slate-200 px-5 py-3.5 pl-14 text-base font-bold outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                        required
                        placeholder="اكتب كلمة المرور الجديدة"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowNewPassword(p => !p)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 p-2 rounded-xl hover:bg-slate-100 transition-all cursor-pointer select-none"
                        title={showNewPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                      >
                        {showNewPassword ? (
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
                    className="w-full rounded-2xl bg-gradient-to-l from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 py-4 text-sm font-black text-white shadow-xl shadow-emerald-200 transition-all active:scale-[0.99] disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>🔑</span>
                    <span>{resetBusy ? 'جاري التحقق والحفظ...' : 'تأكيد الكود وحفظ كلمة المرور والدخول 🚀'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setForgotStep('phone_request');
                      setIncomingSmsCode(null);
                      setEnteredCode('');
                      setResetMsg('');
                    }}
                    className="w-full text-center text-xs font-bold text-slate-500 hover:text-slate-800 py-1 cursor-pointer"
                  >
                    ← إعادة إرسال الكود أو تغيير الرقم
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
                    setForgotStep('phone_request');
                    setIncomingSmsCode(null);
                    setEnteredCode('');
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
