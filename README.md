# Dongham (دونگ‌هام)

اپلیکیشن تقسیم هزینهٔ گروهی — فارسی‌اول (RTL)، Offline-first، PWA.

## استک

| بخش | فناوری |
|-----|--------|
| اپ | Vite + React 19 + TypeScript + Tailwind + Dexie + PWA |
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

### انتقال `store.json` قدیمی به MySQL (یک‌بار، فقط برای سرورهای قدیمی)

runtime فقط MySQL است؛ `store.json` تنها ورودی CLI `import-store` برای سرورهایی است که هنوز روی نسخهٔ فایل JSON بوده‌اند (`/home/dongham/public_html/apps/api/data/store.json`). همان فایل را ایمپورت کنید — نه `GET /admin/export` (هش رمز را ندارد). ایمپورت از همان مسیر `replaceDb` می‌گذرد؛ یعنی فیلدهای دوره‌های `encrypted` پیش از نوشتن AES می‌شوند.

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

اپ و ادمین در وب به‌صورت پیش‌فرض `/api` را صدا می‌زنند (پروکسی Vite در dev، پروکسی Apache در `.htaccess`).

آنلاین: هر عمل (هزینه، پرداخت، عضو، پیوست، چت، recurring) همان لحظه REST می‌شود. آفلاین: Dexie + outbox؛ flush همان REST را تک‌تک صدا می‌زند و هر op بعد از موفقیت خودش از صف حذف می‌شود (چت/فعالیت روی سرور idempotent است). `GET /periods/:id/snapshot` و `POST /periods/:id/sync` بدون `ops` فقط pull هستند. اگر `ops` غیرخالی باشد پاسخ **۴۱۰** با `code: use_rest` است. `period.version` واترمارک pull است، نه OCC روی REST؛ آخرین نوشتن همان موجودیت برنده است و کلاینت هیچ دیالوگ «تعارض نسخه» ندارد. پاسخ 4xx قطعی (۴۰۰/۴۰۳/۴۰۹) صف نمی‌شود و همان پیام سرور نمایش داده می‌شود؛ ۴۰۱ توکن محلی را پاک می‌کند.

توکن دعوت فقط برای اعضای نویسنده (owner/manager/member) در اسنپ‌شات برمی‌گردد؛ خوانندهٔ عمومی و بیننده `invites: []` می‌گیرند. قواعد تسویه (فقط بدهکار «پرداختم» می‌زند، بدهکار یا مالک/مدیر مستقیم تسویه ثبت می‌کند، طلبکار یا مالک/مدیر تأیید می‌کند) در `@dongham/ledger` است و هم UI و هم `POST/PATCH /payments` آن را اجرا می‌کنند.

رسید آنلاین اول به `POST /attachments` می‌رود (`attachmentId`) و کپی محلی در Dexie می‌ماند. ادمین بعد از decrypt تصویر رسید هزینه و فیش پرداخت را می‌بیند.

پشتیبان دستگاه، اسنپ‌شات دوره، و `GET /admin/export` / CLI `import-store` همگی پاکت `dongham` نسخهٔ ۳ هستند (`device` | `period` | `server`). Excel/PDF/تصویر گزارش‌اند، نه بکاپ.

## اجرا

مدیر بستهٔ مرجع **pnpm 11** است (`packageManager`: `pnpm@11.25.0` + `workspace:*` برای `@dongham/ledger`). Node **۲۲٫۱۲ یا جدیدتر** لازم است. `@dongham/ledger` پکیج خصوصی محلی است و باید با `workspace:*` لینک شود، نه از npm.

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

## قابلیت‌های اصلی

- حالت آفلاین بدون اکانت (داده محلی)
- دوره، اعضا، هزینه با ضریب / مبلغ ثابت / درصد / مساوی
- مالیات، تگ، جستجو، چندارزی، عکس رسید + تشخیص تقریبی مبلغ از نام فایل (نه OCR واقعی)
- قرض و تسویه + پیشنهاد کمینه تراکنش
- چت دوره (فقط حالت ابری)، دعوت QR/لینک، همگام‌سازی خودکار ابری
- Export PDF / Excel / تصویر
- هزینه تکراری، AES-256-GCM سرور روی دوره‌های `encrypted`، عبارت عبور اختیاری برای QR/فایل اسنپ‌شات آفلاین (لینک دعوت ابری عبارت عبور ندارد)، حذف حساب
- نوتیفیکیشن وب (Web Push + Notification API)

## پنل ادمین

ورود فقط با OTP برای شماره‌های `ADMIN_PHONES` (پیش‌فرض `09190755375` و `09306057083`). توکن ادمین ۲۴ ساعته است و JWT معمولی اپ به `/admin` راه ندارد.

```bash
pnpm dev:admin    # http://localhost:5174
```

روی سرور:

1. DNS ساب‌دامنه `admin.dongham.ir` را به همین هاست بدهید.
2. vhost آپاچی را به خروجی استاتیک `apps/admin/dist` اشاره دهید (SPA fallback در `apps/admin/public/.htaccess`).
3. `CORS_ORIGIN` باید `https://admin.dongham.ir` را داشته باشد (در `deploy/ecosystem.config.cjs` آمده).
4. `ADMIN_PHONES` را در `.env` سرور تنظیم کنید.
5. دامنهٔ اصلی `/api` را به `127.0.0.1:8787` پروکسی می‌کند ([`deploy/public_html.htaccess`](deploy/public_html.htaccess))؛ ادمین هم `/api` را در `.htaccess` خودش پروکسی می‌کند.

## سایت مارکتینگ، اپ و SEO

خروجی ایندکس‌شونده فقط Astro است (`apps/marketing`) روی `https://dongham.ir/`. وب‌اپ روی **همان دامنه** است (`/app`, `/auth`, `/periods`, `/i/...`) و در `robots.txt` و متای HTML، `noindex` است. ادمین روی `admin.dongham.ir` است.

`https://app.dongham.ir` باید ۳۰۱ شود: `/` → `https://dongham.ir/app` و بقیهٔ مسیرها با همان پسوند به apex. نمونه: [`deploy/apache-app.dongham.ir.conf`](deploy/apache-app.dongham.ir.conf).

روی سرور **DocumentRoot دامنهٔ اصلی را به ریشهٔ ریپو** (`/home/dongham/public_html`) بدهید، نه `apps/marketing/dist`. نمونه: [`deploy/apache-dongham.ir.conf`](deploy/apache-dongham.ir.conf) به‌همراه [`deploy/public_html.htaccess`](deploy/public_html.htaccess). مسیرهای رزرو اپ را با صفحهٔ Astro هم‌نام نکنید: `app`, `auth`, `periods`, `i`, `transactions`, `reports`, `profile`, `friends`, `more`, `api`.

`APP_PUBLIC_URL` در پروداکشن `https://dongham.ir` است (بدون `/app`). دعوت، زرین‌پال (`/more`) و ایمپرسونیت (`/auth?imp=`) روی همین origin ساخته می‌شوند.

بعد از بیلد و دیپلوی:

1. با curl چک کنید `https://dongham.ir/features` به مسیر `apps/marketing/dist` نرود، `http://dongham.ir/` به HTTPS برسد، `https://dongham.ir/app` شل اپ را بدهد، و `https://app.dongham.ir/i/x` به `https://dongham.ir/i/x` برود.
2. در [Google Search Console](https://search.google.com/search-console) پراپرتی `https://dongham.ir` را verify کنید.
3. سایتمپ `https://dongham.ir/sitemap-index.xml` را submit کنید (`robots.txt` همان را معرفی می‌کند).
4. در Google Identity، origin مجاز `https://dongham.ir` را اضافه کنید. اگر زرین‌پال callback را در پنل قفل کرده‌اید، `https://dongham.ir/more` را هم بگذارید.

`pnpm --filter @dongham/marketing og` تصویر `public/og.png` را دوباره می‌سازد.

## Lighthouse

```bash
pnpm --filter @dongham/marketing build
npx @lhci/cli autorun --config=lighthouserc.json
```

(`lighthouserc.json` خودش `astro preview` را روی `127.0.0.1:4321` بالا می‌آورد.)
