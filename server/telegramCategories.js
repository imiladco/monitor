export const CATEGORIES = [
  { key: "security", label: "امنیت", icon: "🛡" },
  { key: "status", label: "وضعیت", icon: "🌐" },
  { key: "plugin", label: "افزونه", icon: "🧩" },
  { key: "theme", label: "پوسته", icon: "🎨" },
  { key: "domain", label: "دامنه", icon: "🌍" },
  { key: "ssl", label: "SSL", icon: "🔒" },
  { key: "performance", label: "پرفورمنس", icon: "⚡️" },
];

const EVENT_TYPE_TO_CATEGORY = {
  uptime_change: "status",
  checkout_change: "status",
  port_change: "status",
  ssl_warning: "ssl",
  domain_warning: "domain",
  visual_change: "performance",
  cwv_drop: "performance",
  slow_response: "performance",
  slow_response_recovered: "performance",
  db_growth: "performance",
  core_integrity: "security",
  brute_force: "security",
  admin_user_created: "security",
  plugin_installed: "plugin",
  plugin_update: "plugin",
  plugin_removed: "plugin",
  plugin_activated: "plugin",
  plugin_deactivated: "plugin",
  theme_change: "theme",
  core_update: "plugin",
};

export function categoryForEventType(type) {
  return EVENT_TYPE_TO_CATEGORY[type] || null;
}
