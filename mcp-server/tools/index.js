import { z } from "zod";

// Each tool: name, description, a Zod input shape, and a handler(client, args)
// that returns a plain object. Kept transport-agnostic so the handlers are
// unit-testable without the SDK/stdio. All read-only — no destructive actions
// are exposed (updates/rollbacks must go through the main dashboard's approval
// flow, never the MCP surface).

export const tools = [
  {
    name: "list_sites",
    description: "لیست همه‌ی سایت‌های ناوگان با وضعیت جاری و پرچم‌های سلامت.",
    inputSchema: {},
    handler: (client) => client.get("/sites"),
  },
  {
    name: "get_site_details",
    description: "جزئیات یک سایت: نسخه‌ها، پلاگین‌ها، آپدیت‌های در انتظار، SSL، آسیب‌پذیری‌ها و holdها.",
    inputSchema: { site_id: z.number().int().describe("شناسه‌ی سایت از list_sites") },
    handler: (client, { site_id }) => client.get(`/sites/${site_id}`),
  },
  {
    name: "get_uptime_history",
    description: "تاریخچه‌ی uptime و زمان پاسخ یک سایت برای چند روز اخیر.",
    inputSchema: {
      site_id: z.number().int(),
      days: z.number().int().min(1).max(90).default(7),
    },
    handler: (client, { site_id, days }) => client.get(`/sites/${site_id}/uptime?days=${days}`),
  },
  {
    name: "get_timeline",
    description: "رویدادهای Time Machine یک سایت (آپدیت پلاگین، یوزر جدید، تغییر فایل core و ...).",
    inputSchema: { site_id: z.number().int() },
    handler: (client, { site_id }) => client.get(`/sites/${site_id}/timeline`),
  },
  {
    name: "get_incidents",
    description: "لیست اینسیدنت‌های قطعی (down) با مدت‌زمان، برای یک سایت یا کل ناوگان.",
    inputSchema: {
      site_id: z.number().int().optional(),
      days: z.number().int().min(1).max(365).default(30),
    },
    handler: (client, { site_id, days }) =>
      client.get(`/incidents?days=${days}${site_id ? `&site_id=${site_id}` : ""}`),
  },
  {
    name: "get_fleet_summary",
    description: "آمار کلی ناوگان: تعداد آنلاین/آفلاین، آپدیت‌های در انتظار، آسیب‌پذیری‌های فعال.",
    inputSchema: {},
    handler: (client) => client.get("/fleet-summary"),
  },
  {
    name: "search_across_fleet",
    description:
      "جستجوی ساختاریافته در ناوگان. دقیقاً یکی از پارامترها را بده: plugin (سایت‌هایی که این پلاگین را دارند)، slow_ms (سایت‌های کندتر از این)، ssl_within_days (SSL نزدیک انقضا).",
    inputSchema: {
      plugin: z.string().optional(),
      slow_ms: z.number().int().optional(),
      ssl_within_days: z.number().int().optional(),
    },
    handler: (client, args) => {
      const q = new URLSearchParams();
      if (args.plugin) q.set("plugin", args.plugin);
      if (args.slow_ms) q.set("slow_ms", String(args.slow_ms));
      if (args.ssl_within_days) q.set("ssl_within_days", String(args.ssl_within_days));
      return client.get(`/search?${q.toString()}`);
    },
  },
  {
    name: "get_plugin_across_fleet",
    description: "بررسی یک پلاگین روی همه‌ی سایت‌ها: نسخه‌ها، آپدیت موجود، و اینکه Fleet Learning holdش کرده یا نه.",
    inputSchema: { plugin_slug: z.string() },
    handler: (client, { plugin_slug }) => client.get(`/plugin/${encodeURIComponent(plugin_slug)}`),
  },
  {
    name: "get_vulnerabilities",
    description: "آسیب‌پذیری‌های فعال شناخته‌شده در کل ناوگان.",
    inputSchema: {},
    handler: (client) => client.get("/vulnerabilities"),
  },
];
