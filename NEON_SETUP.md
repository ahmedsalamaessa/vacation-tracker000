# ربط Neon خطوة بخطوة

## 1) إنشاء حساب Neon

1. افتح: https://console.neon.tech
2. **Sign up with GitHub** (نفس حساب GitHub بتاعك)
3. اسمح بالصلاحيات

## 2) إنشاء مشروع

1. **Create a project**
2. الإعدادات المقترحة:
   - **Project name:** `vacation-tracker`
   - **Postgres version:** أحدث (16 أو 17)
   - **Region:** اختر الأقرب (مثلاً Europe / Frankfurt لو متاح)
3. **Create project**

## 3) نسخ Connection String

1. من لوحة المشروع → **Dashboard**
2. دور على **Connection string**
3. اختار **URI** (مش Pooled لو هتستخدم serverless — أو استخدم **Pooled** مع Neon serverless)
4. انسخ الرابط كامل، شكله تقريبًا:

```
postgresql://neondb_owner:xxxxx@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require
```

## 4) تشغيل الـ Schema

1. من Neon → **SQL Editor**
2. افتح ملف `db/schema.sql` من المشروع
3. الصق المحتوى كامل → **Run**

## 5) إرسال الـ Connection String (بحذر)

- **متحطّش** الباسورد في شات عام لو مش ضروري
- حطّه في ملف `.env.local` عندك محليًا
- على Vercel هتحطه في **Environment Variables**

## 6) بعد ما تخلص

ابعت رسالة: **«عملت Neon وخلصت الـ SQL»**

وبعدين نكمّل ربط الكود + الـ API + Vercel.
