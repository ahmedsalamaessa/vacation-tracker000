import { useState } from 'react';
import { login, initializeData } from '../lib/db';
import type { Employee } from '../lib/types';

interface LoginPageProps {
  onLogin: (user: Employee) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
        setError(`بيانات الدخول غير صحيحة`);
      }
    } catch {
      setError('حدث خطأ أثناء تسجيل الدخول');
    }
    setBusy(false);
  }

  return (
    <main className="min-h-screen overflow-hidden bg-gradient-to-br from-blue-50 via-slate-50 to-violet-50 px-6 py-10 flex items-center justify-center" dir="rtl">
      <section className="w-full">
          <div className="mx-auto max-w-xl rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-2xl shadow-slate-200/80 md:p-14">
            <div className="mx-auto mb-8 flex h-28 w-28 items-center justify-center rounded-[2rem] bg-gradient-to-br from-blue-600 to-violet-600 text-5xl text-white shadow-2xl shadow-blue-200">
              🔐
            </div>
            <h2 className="text-center text-4xl font-black text-slate-950">تسجيل الدخول</h2>
            <p className="mt-4 text-center text-lg font-bold text-slate-500">
              نظام إدارة الإجازات • قسم المساحة
            </p>

            {error && (
              <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-center text-sm font-bold text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-9 space-y-6">
              <div>
                <label className="mb-3 block text-lg font-black text-slate-700">اسم المستخدم</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-2xl border-4 border-slate-200 px-6 py-5 text-xl font-bold outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  required
                  placeholder="اسم المستخدم أو رقم الهاتف"
                />
                <p className="mt-2 text-sm font-bold text-slate-400">
                  يمكنك الدخول باسم المستخدم أو رقم الهاتف المسجل
                </p>
              </div>

              <div>
                <label className="mb-3 block text-lg font-black text-slate-700">كلمة المرور</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-2xl border-4 border-slate-200 px-6 py-5 text-xl font-bold outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  required
                  placeholder="كلمة المرور"
                />
              </div>

              <div className="flex items-center justify-between gap-3 text-sm font-bold text-slate-500">
                <label className="flex items-center gap-2">
                  <input type="checkbox" defaultChecked className="h-5 w-5 rounded border-slate-300" />
                  تذكرني 7 أيام
                </label>
                <span>نسيت كلمة المرور؟ تواصل مع مدير النظام</span>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-2xl bg-gradient-to-l from-blue-600 to-violet-600 py-5 text-xl font-black text-white shadow-2xl shadow-blue-100 transition hover:scale-[1.01] disabled:opacity-60"
              >
                {busy ? 'جاري الدخول...' : 'دخول إلى النظام 🚀'}
              </button>
            </form>

            <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-center text-sm font-bold text-blue-700">
              يمكنك استخدام اسم المستخدم أو رقم الهاتف للدخول
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
