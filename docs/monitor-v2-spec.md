# Monitor v2 — Spec بهبودیافته (سه قابلیت جدید)

این نسخه‌ی بازنگری‌شده‌ی spec اولیه‌ست، بعد از تأیید عملی محدودیت‌ها. سه تغییر اساسی نسبت به نسخه‌ی اول:

1. **منبع CVE**: با تست عملی مشخص شد هیچ فید JSON رایگانِ بدون‌کلید برای آسیب‌پذیری وردپرس وجود نداره (Patchstack یه صفحه‌ی HTMLه؛ Wordfence v3 الان ۴۰۱/نیاز به کلید می‌ده، نسخه‌های قدیمی ۴۱۰). پس **دیتابیس محلیِ دستی هسته‌ی اصلیه**، و فید خارجی یه گزینه‌ی اختیاریِ قابل‌تنظیم (URL + کلید).
2. **Fleet Learning**: منطق تشخیص روی داده‌ای که *واقعاً* با فرکانس بالا داریم سوار می‌شه (uptime/status هر ۵ دقیقه، پنجره‌ی ۱ ساعته)، نه TTFB/visual که فقط روزانه‌ست. صف verdict پایدار (توی DB) تا ری‌استارت گمش نکنه.
3. **MCP Server**: به‌جای خوندن مستقیم `data/monitor.db` (که روی VPS ـه و از لپ‌تاپ در دسترس نیست)، از طریق **HTTP API مانیتور** با bearer API key کار می‌کنه — از راه دور و بدون دسترسی فایل.

پیش‌فرض معماری ثابت: Node.js/Express + SQLite + React dashboard + wp-agent. migrationها فقط additive.

---

## فاز A — CVE Cross-Reference (local-first)

### هسته: دیتابیس محلی
- جدول `vulnerabilities` (source: `manual`/`local`/`external`) و `site_vulnerabilities` طبق spec اصلی.
- یه فایل seed: `data/local-vulnerabilities.seed.json` (این یکی **gitignore نمی‌شه**، چون داده‌ی محصوله نه داده‌ی رانتایم). موقع بوت، رکوردهای این فایل با `source='local'` upsert می‌شن (بر اساس یه `source_id` پایدار). مزیت رقابتی: پلاگین‌های بازار ایران که Patchstack/Wordfence نمی‌شناسن.
- صفحه‌ی «Manual Vulnerability Entry» توی داشبورد: ادمین رکورد دستی (`source='manual'`) اضافه/حذف کنه.

### فید خارجی (اختیاری، pluggable)
- تنظیمات: `EXTERNAL_VULN_FEED_URL` و `EXTERNAL_VULN_FEED_KEY` (هر دو خالی = غیرفعال).
- انتظار فرمت: یه JSON آرایه با فیلدهای نرمال‌شده؛ یه adapter کوچیک که به شکل داخلی مپ می‌کنه. اگه فید در دسترس/تنظیم نبود، کل قابلیت فقط با دیتابیس محلی کار می‌کنه.

### تطبیق نسخه
- تابع `versionInRange(installed, rangeExpr)` با wrapper سبک روی `semver` که نسخه‌های ناقص وردپرسی (`1.2`) رو هم نرمال کنه. بیان‌های پشتیبانی‌شده: `<= x`, `< x`, `>= x`, `>= a < b`, `x.y.*`, تک‌نسخه.
- تست unit با کیس‌های edge.

### Sync/Match Job
- cron روزانه ساعت `VULN_SYNC_HOUR` (پیش‌فرض ۵): (۱) اگه فید خارجی تنظیمه fetch+upsert، (۲) هر سایت: پلاگین‌های snapshot agent رو با `vulnerabilities` جوین کن، match جدید → `site_vulnerabilities`، (۳) هر آسیب‌پذیریِ ≥ `VULN_ALERT_MIN_SEVERITY` → هشدار تلگرام به تاپیک «امنیت».
- وقتی پلاگین آپدیت شد و از بازه خارج شد → `resolved_at` ست می‌شه.

### UI
- صفحه‌ی جدید Security → Vulnerabilities: لیست، فیلتر (severity/سایت/پلاگین)، سایت‌های متأثر، نسخه‌ی fixed، لینک منبع، دکمه‌ی Mark resolved (برای false positive).
- صفحه‌ی هر سایت: بخش «آسیب‌پذیری‌های شناخته‌شده» با شمارش severity.

---

## فاز B — Fleet Learning (Update Guard)

### تغییر کلیدی نسبت به spec اول
منطق «bad» فقط روی سیگنالی که با فرکانس بالا داریم:
- **پنجره‌ی ۱ ساعته** بعد از رویداد آپدیت پلاگین (نه ۳۰ دقیقه، چون چک هر ۵ دقیقه‌ست → ~۱۲ داده‌نقطه).
- **bad**: توی ۱ ساعت بعد آپدیت، سایت حداقل یه چک `down`/`5xx` داشت که قبل آپدیت (بازه‌ی مرجع) نداشت.
- **suspicious**: میانگین response-time بعد آپدیت > `2x` بازه‌ی مرجع (این رو از checks داریم).
- **safe**: هیچ‌کدوم برقرار نیست (visual/TTFB به‌عنوان سیگنال تکمیلی بعداً اضافه می‌شن).
- verdictها روی upgrade path (`slug` + `from`→`to`) تجمیع می‌شن.

### صف پایدار
- جدول `pending_verdicts` (site_id, plugin_slug, from, to, evaluate_after). یه cron هر ۵ دقیقه ردیف‌های سررسیدشده رو ارزیابی می‌کنه — ری‌استارت گمش نمی‌کنه.

### Hold
- verdict=bad/suspicious → برای هر سایت دیگه با همون `from_version` و `to_version` موجود، رکورد `update_holds`.
- endpoint `GET /api/update-check?plugin=&from=&to=` (agent auth) → `{verdict, hold, reason, evidence_count}`.
- agent قبل از نمایش آپدیت این رو صدا می‌زنه؛ اگه hold بود بنر توی WP-Admin.
- داشبورد: بخش «Fleet Learning Alerts» + لیست holdهای هر سایت با دکمه‌ی Release (پسورد ادمین).
- **بدون auto-apply** در این فاز.

---

## فاز C — MCP Server (HTTP-based)

### تغییر کلیدی
به‌جای خوندن مستقیم DB، MCP یه کلاینت HTTP روی API مانیتوره. روی لپ‌تاپ کاربر با stdio اجرا می‌شه ولی داده رو از `MONITOR_BASE_URL` می‌گیره با `Authorization: Bearer <MONITOR_API_KEY>`.

### احراز هویت
- جدول `mcp_api_keys` (name, key_hash, last_used_at, created_at). صفحه‌ی «تنظیمات → MCP Access»: ساخت/revoke، نمایش کلید فقط یک‌بار موقع ساخت.
- یه middleware جدید که این کلیدها رو می‌پذیره برای مسیرهای read-only `/api/mcp/*`.

### Tools (read-only)
`list_sites`, `get_site_details`, `get_uptime_history`, `get_timeline`, `get_incidents`, `get_fleet_summary`, `search_across_fleet`, `get_plugin_across_fleet`, `get_vulnerabilities` (از فاز A). هیچ اکشن مخربی، هیچ خوندن secret.
> نکته: `get_error_logs` از spec اصلی حذف شد چون agent فعلاً استریم خطای PHP نمی‌فرسته — پیش‌نیاز جدا داره.

### پکیج
`mcp-server/` با `@modelcontextprotocol/sdk`، stdio، هر tool فایل جدا، تست + `test-inspector.md`.

---

## اصول مشترک
- PHP سمت agent با WPCS و prefix `wpmon_`.
- JS سمت سرور تست‌دار (Node built-in test runner).
- همه‌ی رشته‌های UI فارسی/RTL.
- هیچ secret لاگ نشه.
- migration فقط additive (جدول جدید، نه ALTER روی جدول‌های حساس).
- هر فاز branch/PR جدا.
