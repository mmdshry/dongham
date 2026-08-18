# Dongham (دونگ‌هام)

اپلیکیشن تقسیم هزینهٔ گروهی — فارسی‌اول (RTL)، Offline-first، PWA + Capacitor Android.

## استک

| بخش | فناوری |
|-----|--------|
| اپ | Vite + React 19 + TypeScript + Tailwind + Dexie + PWA |
| Native | Capacitor Android |
| API | Hono + JWT + OTP (mock / سناتور / کاوه‌نگار) |
| Ledger | `@dongham/ledger` — تقسیم مساوی/ضریب/مبلغ/درصد + settlement |
| SEO | Astro (`apps/marketing`) |
| ادمین | Vite + React (`apps/admin`) روی `admin.dongham.ir` |

## اجرا

مدیر بستهٔ مرجع **npm** است (`package-lock.json`). `pnpm-workspace.yaml` فقط برای کسانی است که ترجیح می‌دهند pnpm نصب کنند.

```bash
npm install
npm run dev          # http://localhost:5173
npm run dev:api      # http://localhost:8787
npm run dev:admin    # http://localhost:5174
npm run dev:marketing
npm test
npm run test:e2e
```

## Capacitor

```bash
npm run cap:sync
npx cap open android --workspace @dongham/app
```

## قابلیت‌های اصلی

- مهمان آفلاین بدون اکانت
- دوره، اعضا، هزینه با ضریب / مبلغ ثابت / درصد / مساوی
- مالیات، تگ، جستجو، چندارزی، عکس رسید + تشخیص تقریبی مبلغ از نام فایل (نه OCR واقعی)
- قرض و تسویه + پیشنهاد کمینه تراکنش
- چت دوره، دعوت QR/لینک، همگام‌سازی outbox
- Export PDF / Excel / تصویر
- هزینه تکراری، رمز AES-GCM روی کارت/شبا و اسنپ‌شات خروجی، حذف حساب
- نوتیفیکیشن (وب + Capacitor Local Notifications)

## پنل ادمین

ورود فقط با OTP برای شماره‌های `ADMIN_PHONES` (پیش‌فرض `09190755375` و `09306057083`). توکن ادمین ۲۴ ساعته است و JWT معمولی اپ به `/admin` راه ندارد.

```bash
npm run dev:admin    # http://localhost:5174
```

روی سرور:

1. DNS ساب‌دامنه `admin.dongham.ir` را مثل `app.dongham.ir` به همین هاست بدهید.
2. vhost آپاچی را به خروجی استاتیک `apps/admin/dist` اشاره دهید (SPA fallback در `apps/admin/public/.htaccess`).
3. `CORS_ORIGIN` باید `https://admin.dongham.ir` را داشته باشد (در `deploy/ecosystem.config.cjs` آمده).
4. `ADMIN_PHONES` را در `.env` سرور تنظیم کنید.
5. پنل ادمین را با `VITE_API_URL` عمومی بیلد کنید، یا روی vhost ادمین `/api` را به `127.0.0.1:8787` پروکسی کنید (نمونه در `apps/admin/public/.htaccess`).

## Lighthouse

```bash
npm run build -w @dongham/marketing
npx @lhci/cli autorun --config=lighthouserc.json
```

(سرور مارکتینگ باید روی `:4321` در حال سرو باشد.)
