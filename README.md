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

## اجرا

```bash
npm install
npm run dev          # http://localhost:5173
npm run dev:api      # http://localhost:8787
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

## Lighthouse

```bash
npm run build -w @dongham/marketing
npx @lhci/cli autorun --config=lighthouserc.json
```

(سرور مارکتینگ باید روی `:4321` در حال سرو باشد.)
