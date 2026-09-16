import { useEffect, useState } from 'react';
import {
  getOfflineQueue,
  subscribeToSyncQueue,
  flushOfflineQueue,
  type OfflineQueueItem,
} from '../lib/syncQueue';

export default function OfflineSyncBanner() {
  const [queue, setQueue] = useState<OfflineQueueItem[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [syncing, setSyncing] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

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
    setSuccessMsg('');
    const res = await flushOfflineQueue();
    setSyncing(false);

    if (res.syncedCount > 0) {
      setSuccessMsg(`🎉 تم مزامنة ${res.syncedCount} عمليات بنجاح مع السيرفر!`);
      setTimeout(() => setSuccessMsg(''), 6000);
    }
  }

  // إذا كان متصل ولا يوجد عمليات معلقة ولا رسالة نجاح، لا نعرض الشريط
  if (isOnline && queue.length === 0 && !successMsg) {
    return null;
  }

  return (
    <div
      dir="rtl"
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-50 animate-bounce-short"
    >
      {/* 🟢 رسالة النجاح بعد المزامنة */}
      {successMsg && (
        <div className="bg-emerald-600 text-white p-3.5 rounded-2xl shadow-2xl border border-emerald-400 text-xs font-black flex items-center justify-between gap-2 mb-2 animate-fade-in">
          <span>{successMsg}</span>
          <button
            onClick={() => setSuccessMsg('')}
            className="text-white hover:text-emerald-200 text-sm font-black"
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
          <div className="flex items-center gap-2">
            <span className="text-xl">
              {!isOnline ? '📴' : syncing ? '🔄' : '📡'}
            </span>
            <div>
              <div className="font-black">
                {!isOnline ? 'وضع عدم الاتصال (أوفلاين)' : 'عمليات بانتظار المزامنة'}
              </div>
              <div className="text-[11px] opacity-90 mt-0.5">
                {!isOnline
                  ? 'يتم حفظ بصمتك وساعاتك محلياً بأمان'
                  : `${queue.length} عملية جاهزة للرفع للسيرفر`}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {queue.length > 0 && (
              <span className="bg-white/20 px-2 py-0.5 rounded-full text-[11px] font-mono font-black">
                {queue.length}
              </span>
            )}

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
          </div>
        </div>
      )}
    </div>
  );
}
