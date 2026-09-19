import { useEffect, useState } from 'react';
import {
  subscribeToSyncQueue,
  flushOfflineQueue,
  clearOfflineQueue,
  removeFromOfflineQueue,
  type OfflineQueueItem,
} from '../lib/syncQueue';

export default function OfflineSyncBanner() {
  const [queue, setQueue] = useState<OfflineQueueItem[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'warn' } | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const unsub = subscribeToSyncQueue((q, online) => {
      setQueue(q);
      setIsOnline(online);
    });
    return unsub;
  }, []);

  async function handleManualSync() {
    if (syncing || queue.length === 0) return;
    setSyncing(true);
    setMsg(null);
    try {
      const res = await flushOfflineQueue();
      setSyncing(false);

      if (res.syncedCount > 0) {
        setMsg({
          text: `🎉 تم مزامنة ${res.syncedCount} عملية بنجاح مع السيرفر!`,
          type: 'success',
        });
        setTimeout(() => setMsg(null), 5000);
      } else if (res.remaining > 0) {
        setMsg({
          text: `⚠️ لم يتم قبول العمليات بالسيرفر (قد تكون مسجلة مسبقاً). يمكنك تفريغ الطابور.`,
          type: 'warn',
        });
      }
    } catch {
      setSyncing(false);
      setMsg({
        text: `⚠️ تعذر الاتصال بالسيرفر للمزامنة. تأكد من اتصال الإنترنت.`,
        type: 'warn',
      });
    }
  }

  function handleClearQueue() {
    clearOfflineQueue();
    setShowDetails(false);
    setMsg({
      text: '🗑️ تم تفريغ طابور المزامنة بنجاح.',
      type: 'success',
    });
    setTimeout(() => setMsg(null), 3000);
  }

  // إذا كان متصل ولا يوجد عمليات معلقة ولا رسالة، لا نعرض الشريط
  if (isOnline && queue.length === 0 && !msg && !showDetails) {
    return null;
  }

  return (
    <>
      {/* 📋 نافذة تفاصيل العمليات المعلقة */}
      {showDetails && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-xl">📡</span>
                <h3 className="font-black text-slate-900 text-sm">عمليات المزامنة المعلقة ({queue.length})</h3>
              </div>
              <button
                onClick={() => setShowDetails(false)}
                className="text-slate-400 hover:text-slate-700 text-lg font-black"
              >
                ✕
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 my-3 text-xs">
              {queue.map((item) => (
                <div key={item.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-black text-slate-800">{item.description || item.type}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {new Date(item.createdAt).toLocaleTimeString('ar-EG')} • محاولات: {item.retryCount || 0}
                    </div>
                  </div>
                  <button
                    onClick={() => removeFromOfflineQueue(item.id)}
                    className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg text-xs"
                    title="حذف من الطابور"
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={handleManualSync}
                disabled={syncing}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-black text-xs shadow transition flex items-center justify-center gap-1.5"
              >
                {syncing ? '🔄 جاري المزامنة...' : '⚡ مزامنة الكل الآن'}
              </button>
              <button
                type="button"
                onClick={handleClearQueue}
                className="bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-600 px-4 py-2.5 rounded-xl font-black text-xs transition"
              >
                تفريغ الكل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📴 شريط المزامنة السفلي */}
      <div
        dir="rtl"
        className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-40 animate-bounce-short"
      >
        {/* 🟢/🟡 رسالة التنبيه بعد المزامنة */}
        {msg && (
          <div
            className={`p-3.5 rounded-2xl shadow-2xl border text-xs font-black flex items-center justify-between gap-2 mb-2 animate-fade-in ${
              msg.type === 'success'
                ? 'bg-emerald-600 text-white border-emerald-400'
                : 'bg-amber-600 text-white border-amber-400'
            }`}
          >
            <span>{msg.text}</span>
            <button
              onClick={() => setMsg(null)}
              className="text-white hover:opacity-75 text-sm font-black"
            >
              ✕
            </button>
          </div>
        )}

        {/* 📴 شريط الأوفلاين والعمليات المعلقة */}
        {(queue.length > 0 || !isOnline) && (
          <div
            className={`p-3.5 rounded-2xl shadow-2xl border text-xs font-bold transition-all flex flex-wrap items-center justify-between gap-2.5 ${
              !isOnline
                ? 'bg-gradient-to-r from-amber-600 to-amber-700 text-white border-amber-400'
                : 'bg-gradient-to-r from-slate-900 to-blue-950 text-white border-blue-500/40'
            }`}
          >
            <div
              onClick={() => setShowDetails(true)}
              className="flex items-center gap-2 cursor-pointer select-none"
              title="اضغط لعرض تفاصيل العمليات"
            >
              <span className="text-xl">
                {!isOnline ? '📴' : syncing ? '🔄' : '📡'}
              </span>
              <div>
                <div className="font-black flex items-center gap-1.5">
                  <span>{!isOnline ? 'وضع عدم الاتصال (أوفلاين)' : 'عمليات بانتظار المزامنة'}</span>
                  {queue.length > 0 && (
                    <span className="bg-white/20 px-1.5 py-0.2 rounded-full text-[10px] font-mono">
                      {queue.length}
                    </span>
                  )}
                </div>
                <div className="text-[11px] opacity-90 mt-0.5">
                  {!isOnline
                    ? 'يتم حفظ بياناتك محلياً بأمان'
                    : `${queue.length} عملية جاهزة للرفع (اضغط للتفاصيل)`}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {isOnline && queue.length > 0 && (
                <button
                  type="button"
                  onClick={handleManualSync}
                  disabled={syncing}
                  className="bg-white text-slate-950 hover:bg-slate-100 active:scale-95 px-3 py-1.5 rounded-xl font-black text-xs shadow-md transition-all cursor-pointer flex items-center gap-1"
                >
                  {syncing ? (
                    <>
                      <div className="w-3 h-3 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
                      <span>جاري الرفع...</span>
                    </>
                  ) : (
                    <>
                      <span>⚡</span>
                      <span>مزامنة الآن</span>
                    </>
                  )}
                </button>
              )}

              {queue.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearQueue}
                  className="bg-white/10 hover:bg-red-500/30 text-white px-2 py-1.5 rounded-xl text-xs font-black transition"
                  title="تفريغ الطابور"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
