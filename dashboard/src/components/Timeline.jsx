const severityColor = {
  info: "bg-accent",
  warning: "bg-warn",
  critical: "bg-bad",
};

const typeIcon = {
  core_update: "🧩",
  theme_change: "🎨",
  plugin_installed: "➕",
  plugin_update: "🔄",
  plugin_removed: "🗑️",
  plugin_activated: "✅",
  plugin_deactivated: "⛔️",
  admin_user_created: "🚨",
  db_growth: "📈",
  uptime_change: "🌐",
  checkout_change: "🛒",
  slow_response: "🐢",
  slow_response_recovered: "⚡️",
  ssl_warning: "🔒",
  core_integrity: "🚨",
  brute_force: "🛡️",
};

function formatTime(iso) {
  const d = new Date(iso.replace(" ", "T") + "Z");
  return d.toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" });
}

export default function Timeline({ events }) {
  if (!events || events.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-panel p-8 text-center text-gray-500">
        هنوز رویدادی ثبت نشده. وقتی مانیتور یه تغییری تشخیص بده (آپدیت، تغییر وضعیت، هشدار) این‌جا نمایش داده می‌شه.
      </div>
    );
  }

  return (
    <ol className="relative border-r-2 border-border pr-6">
      {events.map((e) => (
        <li key={e.id} className="mb-6 last:mb-0">
          <span
            className={`absolute -right-[9px] mt-1.5 h-4 w-4 rounded-full ring-4 ring-canvas ${severityColor[e.severity] || "bg-gray-500"}`}
          />
          <div className="rounded-xl border border-border bg-panel p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-gray-100">
                <span className="ml-1.5">{typeIcon[e.type] || "•"}</span>
                {e.title}
              </span>
              {e.source === "agent" && (
                <span className="shrink-0 rounded-full bg-panel2 px-2 py-0.5 text-[10px] text-gray-400">
                  agent
                </span>
              )}
            </div>
            <div className="mt-1 text-xs text-gray-500">{formatTime(e.occurred_at)}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
