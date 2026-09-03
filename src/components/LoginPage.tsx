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
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // 🔑 وضع "نسيت كلمة المرور"
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [resetCode, setResetCode] = useState('');
  const [resetPass, setResetPass] = useState('');
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

  // 🔑 تقديم الكود + الباسورد الجديد
  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setResetMsg('');
    setResetBusy(true);
    try {
      const r = await api.resetPassword(username.trim(), resetCode.trim(), resetPass);
      setResetMsg(`✅ تم تغيير كلمة المرور لـ ${r.name} — افتح كلمة المرور دلوقتي وادخل`);
      setResetCode('');
      setResetPass('');
      setPassword('');
      setTimeout(() => { setMode('login'); setResetMsg(''); }, 3500);
    } catch (err: any) {
      const m = String(err?.serverMessage || err?.message || '');
      if (m.includes('خلاص وقته') || err?.message === 'expired') setResetMsg('⏰ الكود خلص وقته (15 دقيقة) — اطلب كود جديد من مدير النظام');
      else if (m.includes('مش موجود') || m.includes('غلط') || err?.message === 'bad_code') setResetMsg('⛔ الكود غلط أو اتصرف خلاص — اطلب كود جديد');
      else if (m.includes('6 حروف') || err?.message === 'bad_request') setResetMsg('⚠️ الباسورد الجديد لازم يكون 6 فيهم على الأقل');
      else setResetMsg('⛔ حصل خطأ — تأكد من الكود والبيانات وحاول تاني');
    }
    setResetBusy(false);
  }

  return (
    <main
      className="min-h-screen overflow-hidden bg-gradient-to-br from-blue-50 via-slate-50 to-violet-50 px-6 py-10 flex items-center justify-center"
      dir="rtl"
    >
      <section className="w-full">
        <div className="mx-auto max-w-xl rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-2xl shadow-slate-200/80 md:p-14">
          <div className="mx-auto mb-8 flex h-28 w-28 items-center justify-center rounded-[2rem] bg-gradient-to-br from-blue-600 to-violet-600 text-5xl text-white shadow-2xl shadow-blue-200">
            🔐
          </div>

          <h2 className="text-center text-4xl font-black text-slate-950">
            {mode === 'login' ? 'تسجيل الدخول' : 'نسيت كلمة المرور؟'}
          </h2>
          <p className="mt-4 text-center text-lg font-bold text-slate-500">
            {mode === 'login' ? 'نظام إدارة الإجازات • قسم المساحة' : 'اكتب الكود اللي وصّلك واختر باسورد جديد'}
          </p>

          {error && mode === 'login' && (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-center text-sm font-bold text-red-700">
              {error}
            </div>
          )}

          {/*
            autocomplete off + random names reduce browser password managers
            filling admin credentials for other visitors on shared devices.
          */}
          <form
            onSubmit={mode === 'login' ? handleSubmit : handleReset}
            className="mt-9 space-y-6"
            autoComplete="off"
            data-lpignore="true"
            data-1p-ignore="true"
          >
            {/* honeypot-style decoy fields to absorb autofill */}
            <input
              type="text"
              name="fake-username"
              autoComplete="username"
              tabIndex={-1}
              aria-hidden="true"
              className="hidden"
              style={{ display: 'none' }}
            />
            <input
              type="password"
              name="fake-password"
              autoComplete="current-password"
              tabIndex={-1}
              aria-hidden="true"
              className="hidden"
              style={{ display: 'none' }}
            />

            <div>
              <label className="mb-3 block text-lg font-black text-slate-700">اسم المستخدم</label>
              <input
                type="text"
                name="vacation_login_user"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                inputMode="text"
                className="w-full rounded-2xl border-4 border-slate-200 px-6 py-5 text-xl font-bold outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                required
                placeholder="اكتب اسم المستخدم أو رقم الهاتف"
              />
              <p className="mt-2 text-sm font-bold text-slate-400">
                يمكنك الدخول باسم المستخدم أو رقم الهاتف المسجل
              </p>
            </div>

            <div>
              <label className="mb-3 block text-lg font-black text-slate-700">كلمة المرور</label>
              {mode === 'login' ? (
                <input
                  type="password"
                  name="vacation_login_pass"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className="w-full rounded-2xl border-4 border-slate-200 px-6 py-5 text-xl font-bold outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  required
                  placeholder="اكتب كلمة المرور"
                />
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-black text-slate-500">🔢 كود الدخول (اللي وصّلك)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={resetCode}
                      onChange={e => setResetCode(e.target.value)}
                      autoComplete="one-time-code"
                      className="w-full rounded-2xl border-4 border-slate-200 px-6 py-4 text-xl font-black tracking-[0.3em] text-center outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                      required
                      placeholder="000 000"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-black text-slate-500">🔐 كلمة المرور الجديدة (6 أرقام/حروف على الأقل)</label>
                    <input
                      type="password"
                      value={resetPass}
                      onChange={e => setResetPass(e.target.value)}
                      autoComplete="new-password"
                      className="w-full rounded-2xl border-4 border-slate-200 px-6 py-4 text-xl font-bold outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                      required
                      placeholder="اكتب الباسورد الجديد"
                    />
                  </div>
                </div>
              )}
            </div>

            {mode === 'forgot' && resetMsg && (
              <div className={`rounded-2xl border px-5 py-4 text-center text-sm font-bold ${
                resetMsg.startsWith('✅')
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-red-200 bg-red-50 text-red-700'
              }`}>
                {resetMsg}
              </div>
            )}
            {mode === 'forgot' && (
              <div className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-center text-xs font-bold text-blue-600 leading-relaxed">
                💡 الكود بيوصّلك من مدير النظام. اتصل بيه واطلب كود إعادة تعيين،
                اكتبه هنا مع اسم المستخدم أو رقم هاتفك، واختار باسورد جديد.
              </div>
            )}

            <div className="flex items-center justify-between gap-3 text-sm font-bold text-slate-500">
              {mode === 'login' ? (
                <>
                  <span>🔒 جلستك محفوظة على جهازك تلقائيًا لحد ما تعمل خروج</span>
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); setError(''); setResetMsg(''); }}
                    className="text-blue-600 hover:underline"
                  >
                    نسيت كلمة المرور؟
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => { setMode('login'); setResetMsg(''); setResetPass(''); setResetCode(''); }}
                  className="text-blue-600 hover:underline"
                >
                  → العودة لتسجيل الدخول
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={mode === 'login' ? busy : resetBusy}
              className="w-full rounded-2xl bg-gradient-to-l from-blue-600 to-violet-600 py-5 text-xl font-black text-white shadow-2xl shadow-blue-100 transition hover:scale-[1.01] disabled:opacity-60"
            >
              {mode === 'login'
                ? (busy ? 'جاري الدخول...' : 'دخول إلى النظام 🚀')
                : (resetBusy ? 'جاري التغيير...' : '🔑 تغيير كلمة المرور')}
            </button>
          </form>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-sm font-bold text-slate-600">
            لا يتم عرض أي اسم مستخدم أو كلمة مرور تلقائيًا. أدخل بياناتك الخاصة فقط.
          </div>

          <div className="mt-10 border-t border-slate-100 pt-7 text-center text-sm font-bold text-slate-500">
            Developed &amp; Maintained by <b className="text-slate-800">Eng Ahmed Salama</b>
            <div className="mt-2 text-xs font-black text-slate-400">صنع بحب لقسم المساحة</div>
          </div>
        </div>
      </section>
    </main>
  );
}
