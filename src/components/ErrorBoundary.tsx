// 🆕 إصلاح رقم 6: Error Boundary لمنع الشاشة البيضا
import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('App crashed:', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          className="min-h-screen flex items-center justify-center p-6 bg-slate-100"
        >
          <div className="max-w-md text-center bg-white rounded-3xl p-8 shadow-2xl border border-slate-200">
            <div className="text-6xl mb-4">😔</div>
            <h1 className="text-2xl font-black text-slate-900 mb-2">
              حصل خطأ غير متوقع
            </h1>
            <p className="text-sm font-bold text-slate-500 mb-6 leading-relaxed">
              في مشكلة صغيرة في السيستم. جرّب إعادة تحميل الصفحة.
              <br />
              لو المشكلة تكررت، كلّم المسؤول عن النظام.
            </p>

            {this.state.error && (
              <details className="mb-4 text-right">
                <summary className="cursor-pointer text-xs font-bold text-slate-400 hover:text-slate-600">
                  تفاصيل تقنية للمطور
                </summary>
                <pre className="mt-2 text-[10px] bg-slate-50 p-3 rounded-xl overflow-auto text-red-600 border border-slate-200">
                  {this.state.error.message}
                </pre>
              </details>
            )}

            <div className="flex gap-3">
              <button
                onClick={this.handleReload}
                className="flex-1 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 font-black transition"
              >
                🔄 إعادة تحميل
              </button>
              <button
                onClick={this.handleGoHome}
                className="flex-1 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 px-6 py-3 font-black transition"
              >
                🏠 الصفحة الرئيسية
              </button>
            </div>

            <p className="mt-6 text-[10px] font-bold text-slate-400">
              Developed & Maintained by Eng Ahmed Salama
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
