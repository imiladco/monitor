# تست دستی با MCP Inspector

[MCP Inspector](https://github.com/modelcontextprotocol/inspector) ابزار رسمی برای تست دستی یه MCP server هست.

## پیش‌نیاز

- مانیتور در حال اجرا و در دسترس (مثلاً `http://localhost:4000` یا آدرس VPS)
- یه کلید MCP از داشبورد (تنظیمات → دسترسی MCP)

## اجرا

```bash
cd mcp-server
npm install

MONITOR_BASE_URL="http://localhost:4000" \
MONITOR_API_KEY="کلید-تو" \
npx @modelcontextprotocol/inspector node index.js
```

Inspector یه UI وب باز می‌کنه. اونجا:

1. **Tools tab** → باید هر ۹ تا tool رو ببینی.
2. `list_sites` رو بزن (بدون ورودی) → باید لیست سایت‌هات با پرچم‌های سلامت برگرده.
3. `get_site_details` با `site_id` یکی از سایت‌ها → جزئیات کامل.
4. `get_fleet_summary` → آمار کلی ناوگان.
5. `search_across_fleet` با `plugin: "woocommerce"` → همه‌ی سایت‌هایی که ووکامرس دارن.

## چک سریع بدون Inspector

بدون UI هم می‌تونی با یه initialize + tools/list خام تست کنی:

```bash
MONITOR_BASE_URL="http://localhost:4000" MONITOR_API_KEY="کلید" \
node --input-type=module <<'NODE'
import { spawn } from "node:child_process";
const p = spawn("node", ["index.js"], { env: process.env, stdio: ["pipe","pipe","inherit"] });
let buf = ""; p.stdout.on("data", d => buf += d);
const send = o => p.stdin.write(JSON.stringify(o) + "\n");
send({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2024-11-05",capabilities:{},clientInfo:{name:"probe",version:"1"}}});
setTimeout(() => send({jsonrpc:"2.0",id:2,method:"tools/list",params:{}}), 300);
setTimeout(() => { console.log(buf); p.kill(); }, 900);
NODE
```

باید توی خروجی، پیام `id:2` لیست هر ۹ tool رو داشته باشه.

## عیب‌یابی

- **`unauthorized — check MONITOR_API_KEY`**: کلید اشتباهه یا از داشبورد لغو شده.
- **خطای اتصال**: `MONITOR_BASE_URL` رو چک کن (باید از دستگاهت به مانیتور برسه؛ اگه مانیتور روی VPS پشت فایروله، پورتش باید باز باشه).
