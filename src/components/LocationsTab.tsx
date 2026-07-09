import { useCallback, useEffect, useState } from 'react';
import { getLocations, addLocation, updateLocation, deleteLocation } from '../lib/db';
import type { WorkLocation, Employee } from '../lib/types';

const EMPTY = {
  id: 0,
  name: '',
  lat: '',
  lng: '',
  radiusMeters: 1000,
  active: true,
  notes: '',
};

interface Props {
  user?: Employee;
}

export default function LocationsTab({ user }: Props) {
  const [locations, setLocationsState] = useState<WorkLocation[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const all = getLocations();
    if (user && user.role === 'manager') {
      // مدير فرعي يشوف مواقعه فقط
      setLocationsState(all.filter(l => user.locationIds.includes(l.id)));
    } else {
      setLocationsState(all);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  function edit(loc: WorkLocation) {
    setForm({
      id: loc.id,
      name: loc.name,
      lat: loc.lat == null ? '' : String(loc.lat),
      lng: loc.lng == null ? '' : String(loc.lng),
      radiusMeters: loc.radiusMeters,
      active: loc.active,
      notes: loc.notes || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    const locationData = {
      name: form.name.trim(),
      lat: form.lat === '' ? null : Number(form.lat),
      lng: form.lng === '' ? null : Number(form.lng),
      radiusMeters: form.radiusMeters || 1000,
      active: form.active,
      notes: form.notes || null,
    };
    if (form.id) {
      updateLocation(form.id, locationData);
      setMsg('✅ تم تعديل الموقع');
    } else {
      addLocation(locationData);
      setMsg('✅ تم إضافة الموقع');
    }
    setForm(EMPTY);
    load();
  }

  function remove(id: number) {
    if (!confirm('هل أنت متأكد من حذف هذا الموقع؟ سيظهر الموظفون بدونه ولكنه لن يمسح حضورهم القديم.')) return;
    const ok = deleteLocation(id);
    if (ok) {
      setMsg('🗑️ تم حذف الموقع');
      load();
    } else {
      setMsg('❌ فشل حذف الموقع');
    }
  }

  function useMyLocation() {
    if (!('geolocation' in navigator)) {
      alert('المتصفح لا يدعم تحديد الموقع');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm(prev => ({
          ...prev,
          lat: pos.coords.latitude.toFixed(6),
          lng: pos.coords.longitude.toFixed(6),
        }));
      },
      () => alert('تعذر تحديد موقعك الحالي'),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-slate-950">📍 مواقع العمل</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">
              {user?.role === 'manager' ? 'مواقعك المسموحة فقط - يمكنك تعديلها' : 'قسّم الموظفين والمديرين بين Naya Bay و Beach 5 أو أي مواقع أخرى'}
            </p>
          </div>
          <button onClick={useMyLocation} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-700">📡 موقعي الحالي</button>
        </div>

        {msg && <div className="mb-4 rounded-xl bg-blue-50 px-4 py-3 text-center text-sm font-bold text-blue-700">{msg}</div>}

        <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="اسم الموقع: Naya Bay / Beach 5" className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold outline-none focus:border-blue-500" required />
          <input type="number" value={form.radiusMeters} onChange={(e) => setForm({ ...form, radiusMeters: Number(e.target.value) })} placeholder="نطاق البصمة بالمتر" className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold outline-none focus:border-blue-500" />
          <input value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} placeholder="خط العرض lat" className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold outline-none focus:border-blue-500" />
          <input value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} placeholder="خط الطول lng" className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold outline-none focus:border-blue-500" />
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="ملاحظات الموقع" className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 md:col-span-2" />
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm font-bold text-slate-700"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />الموقع مفعل للبصمة</label>
          <button className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white hover:bg-blue-700">{form.id ? '💾 حفظ تعديل الموقع' : '➕ إضافة موقع'}</button>
        </form>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-xl font-black text-slate-900">المواقع الحالية ({locations.length})</h3>
        {loading ? <div className="py-8 text-center text-slate-500">جاري التحميل...</div> : locations.length === 0 ? <div className="rounded-2xl bg-amber-50 p-6 text-center font-bold text-amber-700">لا توجد مواقع. أضف Naya Bay و Beach 5 من النموذج بالأعلى.</div> : (
          <div className="grid gap-4 md:grid-cols-2">
            {locations.map(loc => (
              <div key={loc.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-lg font-black text-slate-900">{loc.name}</div>
                  <span className={`rounded-full px-3 py-1 text-[10px] font-black ${loc.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{loc.active ? 'مفعل' : 'موقوف'}</span>
                </div>
                <div className="mt-2 text-xs font-bold text-slate-500">lat: {loc.lat ?? '—'} · lng: {loc.lng ?? '—'} · النطاق: {loc.radiusMeters}م</div>
                {loc.notes && <div className="mt-1 text-xs font-bold text-slate-400">{loc.notes}</div>}
                <div className="mt-3 flex gap-2">
                  <button onClick={() => edit(loc)} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white">✏️ تعديل</button>
                  {loc.lat != null && loc.lng != null && <a href={`https://www.google.com/maps?q=${loc.lat},${loc.lng}`} target="_blank" className="rounded-lg bg-blue-50 px-4 py-2 text-xs font-bold text-blue-700">🗺️ خرائط</a>}
                  <button onClick={() => remove(loc.id)} className="rounded-lg bg-red-50 px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-100">🗑️ حذف</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
