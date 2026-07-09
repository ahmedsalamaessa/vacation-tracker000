# نظام إدارة الإجازات • قسم المساحة

نظام ويب لإدارة الحضور والإجازات والبصمة الجغرافية — مبني بـ React + Vite + Tailwind.

## الميزات

- 👆 بصمة حضور بالموقع الجغرافي (GPS)
- 🗓️ طلبات واعتمادات الإجازات
- 📅 شيت حضور شهري مع قفل الشهور
- 📊 لوحة تحكم حية وتقارير CSV/PDF
- 👥 أدوار: مدير نظام / مدير فرعي / موظف
- 📍 مواقع عمل متعددة (Naya Bay, Beach 5, ...)
- 🌙 وضع ليلي
- 💾 نسخ احتياطي واسترجاع JSON

## التشغيل محلياً

```bash
npm install
npm run dev
```

## البناء

```bash
npm run build
```

المخرجات في مجلد `dist/` (ملف HTML واحد بفضل `vite-plugin-singlefile`).

## قاعدة البيانات (Neon)

1. أنشئ مشروع على [console.neon.tech](https://console.neon.tech)
2. انسخ **Connection string (URI / Pooled)**
3. ضعها في `.env.local`:

```bash
cp .env.example .env.local
# عدّل DATABASE_URL
```

4. شغّل الجداول والبذرة:

```bash
node scripts/setup-db.mjs
```

## النشر على Vercel

1. ارفع المشروع على GitHub
2. اربط الريبو في [vercel.com](https://vercel.com)
3. Framework Preset: **Vite**
4. Build Command: `npm run build`
5. Output Directory: `dist`
6. **Environment Variables** (مهم):
   - `DATABASE_URL` = رابط Neon (Pooled)
   - `SESSION_SECRET` = نص عشوائي طويل
7. Deploy

أو من الـ CLI:

```bash
npx vercel
```

## بيانات الدخول الافتراضية

| الحقل | القيمة |
|--------|--------|
| المستخدم | `admin` |
| كلمة المرور | `admin123` |
| باسورد الإعدادات | `settings123` |

> غيّر كلمات المرور فور أول دخول.

## التقنيات

- React 19 + TypeScript
- Vite 7
- Tailwind CSS 4
- تخزين محلي (localStorage)

## المطور

**Eng Ahmed Salama** — قسم المساحة • 2026
