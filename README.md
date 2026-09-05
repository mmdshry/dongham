# Dongham (دونگ‌هام)

اپلیکیشن تقسیم هزینهٔ گروهی — فارسی‌اول (RTL)، Offline-first، PWA + Capacitor Android.

## استک

| بخش | فناوری |
|-----|--------|
| اپ | Vite + React 19 + TypeScript + Tailwind + Dexie + PWA |
| Native | Capacitor Android |
| API | Hono + JWT + OTP (mock / سناتور / کاوه‌نگار) |
| Store | MariaDB / MySQL (`mysql2`) — هر نوشتن با SQL افزایشی |
| Ledger | `@dongham/ledger` — تقسیم مساوی/ضریب/مبلغ/درصد + settlement |
| SEO | Astro (`apps/marketing`) |
| ادمین | Vite + React (`apps/admin`) روی `admin.dongham.ir` |

## پایگاه داده

هر درخواست نوشتن مستقیم روی MySQL می‌رود (تراکنش incremental). استور سراسری RAM وجود ندارد. `hydrate`/`persist` کامل فقط برای import/export و تست است.

مایگریشن‌ها در `apps/api/migrations/` هنگام boot اعمال می‌شوند. لوکال فقط XAMPP / MySQL روی `3306`. تست‌های API دیتابیس `dongham_test` را می‌سازند (`MYSQL_TEST_DATABASE`).

`ENCRYPTION_KEY` (در غیر این صورت `JWT_SECRET`) ستون‌های حساس دوره‌های `encrypted` را با AES-256-GCM می‌بندد: یادداشت و رسید هزینه/پرداخت، متن چت، پیوست، کارت/شبا.

`pnpm --filter @dongham/api start` هر دو `apps/api/.env` و `.env` ریشه را می‌خواند. روی سرور `MYSQL_*` باید در `/home/dongham/public_html/.env` باشد. PM2 اسکریپت `deploy/start-prod.sh` را از ریشهٔ ریپو اجرا می‌کند.

### انتقال `store.json` پروداکشن به MySQL

باینری فعلی سرور هنوز فایل JSON است (`/home/dongham/public_html/apps/api/data/store.json`). قبل از سوییچ به API جدولی، همان فایل را ایمپورت کنید — نه `GET /admin/export` (هش رمز را ندارد).

روی سرور، بعد از گذاشتن این شاخه روی دیسک و تنظیم `MYSQL_*` **بدون عوض کردن `JWT_SECRET`**:

```bash
# بکاپ در حال اجرا، توقف PM2، کپی نهایی، مایگریشن + ایمپورت
bash deploy/import-prod-mysql.sh --all

# پس از دود دستی (ورود، یک دوره، یک هزینه):
bash deploy/import-prod-mysql.sh --cutover
```

یا دستی:

```bash
pnpm --filter @dongham/api migrate
pnpm --filter @dongham/api import-store -- /home/dongham/public_html/apps/api/data/store.json
```

`--force` جداول را (جز `schema_migrations`) پاک و دوباره پر می‌کند. رول‌بک: باینری قدیمی + همان `store.json`.

## کلاینت و API

اپ و ادمین در وب به‌صورت پیش‌فرض `/api` را صدا می‌زنند (پروکسی Vite در dev، پروکسی Apache در `.htaccess`). بیلد Capacitor باید `VITE_API_URL` مطلق داشته باشد (مثلاً `https://app.dongham.ir/api`). CORS شامل `https://localhost` برای WebView اندروید است.

آنلاین: هر عمل (هزینه، پرداخت، عضو، پیوست، چت، recurring) همان لحظه REST می‌شود. آفلاین: Dexie + outbox؛ flush همان REST را تک‌تک صدا می‌زند. `GET /periods/:id/snapshot` و `POST /periods/:id/sync` بدون `ops` فقط pull هستند. اگر `ops` غیرخالی باشد پاسخ **۴۱۰** با `code: use_rest` است. `period.version` واترمارک pull است، نه OCC روی REST؛ آخرین نوشتن همان موجودیت برنده است.

رسید آنلاین اول به `POST /attachments` می‌رود (`attachmentId`) و کپی محلی در Dexie می‌ماند. ادمین بعد از decrypt تصویر رسید هزینه و فیش پرداخت را می‌بیند.

پشتیبان دستگاه، اسنپ‌شات دوره، و `GET /admin/export` / CLI `import-store` همگی پاکت `dongham` نسخهٔ ۳ هستند (`device` | `period` | `server`). Excel/PDF/تصویر گزارش‌اند، نه بکاپ.

## اجرا

مدیر بستهٔ مرجع **pnpm** است (`packageManager` + `workspace:*` برای `@dongham/ledger`).

```bash
pnpm install
pnpm dev            # http://localhost:5173
pnpm dev:api        # http://localhost:8787
pnpm dev:admin      # http://localhost:5174
pnpm dev:marketing
pnpm test
pnpm test:e2e          # API را با OTP_PROVIDER=mock بالا می‌آورد
pnpm --filter @dongham/api load-sync   # ۱۰۰ کاربر / ۱۰۰ دوره روی dongham_test
```

اگر سرور از قبل با SMS واقعی بالا باشد، e2e بدون `devCode` همان‌جا قطع می‌شود تا پیامک واقعی نرود. برای استفاده از سرور موجود: `E2E_REUSE_SERVER=1` فقط وقتی API حتماً mock است.

## Capacitor

بیلد اندروید باید `VITE_API_URL` مطلق داشته باشد (مثلاً `https://app.dongham.ir/api`). بدون آن WebView به `/api` روی `https://localhost` می‌زند.

```bash
pnpm cap:sync
pnpm --filter @dongham/app exec cap open android
```

## قابلیت‌های اصلی

- مهمان آفلاین بدون اکانت
- دوره، اعضا، هزینه با ضریب / مبلغ ثابت / درصد / مساوی
- مالیات، تگ، جستجو، چندارزی، عکس رسید + تشخیص تقریبی مبلغ از نام فایل (نه OCR واقعی)
- قرض و تسویه + پیشنهاد کمینه تراکنش
- چت دوره، دعوت QR/لینک، همگام‌سازی outbox
- Export PDF / Excel / تصویر
- هزینه تکراری، AES-256-GCM سرور روی دوره‌های `encrypted`، عبارت عبور اختیاری برای QR، حذف حساب
- نوتیفیکیشن (وب + Capacitor Local Notifications)

## پنل ادمین

ورود فقط با OTP برای شماره‌های `ADMIN_PHONES` (پیش‌فرض `09190755375` و `09306057083`). توکن ادمین ۲۴ ساعته است و JWT معمولی اپ به `/admin` راه ندارد.

```bash
pnpm dev:admin    # http://localhost:5174
```

روی سرور:

1. DNS ساب‌دامنه `admin.dongham.ir` را مثل `app.dongham.ir` به همین هاست بدهید.
2. vhost آپاچی را به خروجی استاتیک `apps/admin/dist` اشاره دهید (SPA fallback در `apps/admin/public/.htaccess`).
3. `CORS_ORIGIN` باید `https://admin.dongham.ir` را داشته باشد (در `deploy/ecosystem.config.cjs` آمده).
4. `ADMIN_PHONES` را در `.env` سرور تنظیم کنید.
5. اپ و ادمین هر دو `/api` را به `127.0.0.1:8787` پروکسی می‌کنند (`.htaccess`). برای Capacitor همان `VITE_API_URL` مطلق را بیلد کنید.

## Lighthouse

```bash
pnpm --filter @dongham/marketing build
npx @lhci/cli autorun --config=lighthouserc.json
```

(سرور مارکتینگ باید روی `:4321` در حال سرو باشد.)
