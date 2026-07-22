# WordPress Monitor — MCP Server

یه MCP server که ناوگان سایت‌های وردپرسی‌ات (از طریق مانیتور) رو به Claude Desktop یا Claude Code وصل می‌کنه، تا به‌طور طبیعی درباره‌ی سایت‌هات سؤال بپرسی.

**خواندنی و امن**: هیچ اکشن مخربی (آپدیت، rollback، پاک‌سازی) از اینجا در دسترس نیست و هیچ secretی (توکن تلگرام، کلید API سایت‌ها) خونده نمی‌شه.

## معماری

برخلاف خوندن مستقیم فایل دیتابیس، این server از طریق **HTTP API مانیتور** کار می‌کنه — پس روی لپ‌تاپ تو با stdio اجرا می‌شه ولی داده رو از سرور مانیتور (روی VPS) می‌گیره. نیازی نیست فایل `data/monitor.db` روی همون دستگاه باشه.

## نصب و راه‌اندازی

۱. **یه کلید MCP بساز**: توی داشبورد مانیتور → تنظیمات → دسترسی MCP → یه کلید با اسم بساز (فقط یک‌بار نمایش داده می‌شه).

۲. **وابستگی‌ها رو نصب کن** (روی همون دستگاهی که Claude Desktop داره):

```bash
cd mcp-server
npm install
```

۳. **به Claude Desktop وصلش کن** — توی `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "wordpress-monitor": {
      "command": "node",
      "args": ["/path/to/monitor/mcp-server/index.js"],
      "env": {
        "MONITOR_BASE_URL": "https://your-monitor-domain.com",
        "MONITOR_API_KEY": "کلیدی-که-از-داشبورد-ساختی"
      }
    }
  }
}
```

(اگه مانیتور روی IP:پورت خامه، `MONITOR_BASE_URL` رو مثلاً `http://1.2.3.4:4000` بذار.)

۴. Claude Desktop رو ری‌استارت کن. حالا می‌تونی چیزایی مثل این بپرسی:
- «کدوم سایت‌هام الان آفلاینن؟»
- «WooCommerce روی کل ناوگانم چه نسخه‌ایه؟ کدوم نیاز به آپدیت داره؟»
- «آسیب‌پذیری‌های فعال ناوگانم رو نشون بده»
- «کدوم سایت‌ها SSL نزدیک انقضا دارن؟»

## Toolها (همه خواندنی)

`list_sites`، `get_site_details`، `get_uptime_history`، `get_timeline`، `get_incidents`، `get_fleet_summary`، `search_across_fleet`، `get_plugin_across_fleet`، `get_vulnerabilities`.

## تست

```bash
npm test
```

برای تست دستی با MCP Inspector رسمی، `test-inspector.md` رو ببین.
