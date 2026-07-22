import { env } from "./config.js";

function keyBy(arr, key) {
  const map = new Map();
  for (const item of arr || []) map.set(item[key], item);
  return map;
}

export function diffSnapshot(prev, next) {
  const events = [];

  if (prev?.wpVersion && next.wpVersion && prev.wpVersion !== next.wpVersion) {
    events.push({
      type: "core_update",
      title: `هسته‌ی وردپرس از ${prev.wpVersion} به ${next.wpVersion} آپدیت شد`,
      severity: "info",
    });
  }

  if (prev?.theme && next.theme && (prev.theme.name !== next.theme.name || prev.theme.version !== next.theme.version)) {
    events.push({
      type: "theme_change",
      title:
        prev.theme.name !== next.theme.name
          ? `پوسته از "${prev.theme.name}" به "${next.theme.name}" عوض شد`
          : `پوسته‌ی "${next.theme.name}" از ${prev.theme.version} به ${next.theme.version} آپدیت شد`,
      severity: "info",
    });
  }

  const prevPlugins = keyBy(prev?.plugins, "slug");
  const nextPlugins = keyBy(next.plugins, "slug");

  for (const [slug, plugin] of nextPlugins) {
    const before = prevPlugins.get(slug);
    if (!before) {
      events.push({
        type: "plugin_installed",
        title: `افزونه‌ی جدید نصب شد: ${plugin.name} (${plugin.version})`,
        severity: "info",
      });
      continue;
    }
    if (before.version !== plugin.version) {
      events.push({
        type: "plugin_update",
        title: `افزونه‌ی ${plugin.name} از ${before.version} به ${plugin.version} آپدیت شد`,
        severity: "info",
        detail: { slug, fromVersion: before.version, toVersion: plugin.version },
      });
    }
    if (before.active !== plugin.active) {
      events.push({
        type: plugin.active ? "plugin_activated" : "plugin_deactivated",
        title: `افزونه‌ی ${plugin.name} ${plugin.active ? "فعال" : "غیرفعال"} شد`,
        severity: "info",
      });
    }
  }

  if (prev) {
    for (const [slug, plugin] of prevPlugins) {
      if (!nextPlugins.has(slug)) {
        events.push({
          type: "plugin_removed",
          title: `افزونه‌ی ${plugin.name} حذف شد`,
          severity: "warning",
        });
      }
    }
  }

  if (prev?.users && next.users) {
    const prevAdmins = new Set(
      prev.users.filter((u) => u.roles?.includes("administrator")).map((u) => u.id)
    );
    for (const u of next.users) {
      if (u.roles?.includes("administrator") && !prevAdmins.has(u.id)) {
        events.push({
          type: "admin_user_created",
          title: `یوزر ادمین جدید ساخته شد: ${u.login}`,
          severity: "critical",
          detail: { userId: u.id, login: u.login },
        });
      }
    }
  }

  if (next.coreIntegrity?.modifiedFiles?.length) {
    const prevModified = new Set(prev?.coreIntegrity?.modifiedFiles?.map((f) => f.file) || []);
    const newlyModified = next.coreIntegrity.modifiedFiles.filter((f) => !prevModified.has(f.file));
    if (newlyModified.length > 0) {
      events.push({
        type: "core_integrity",
        title: `🚨 ${newlyModified.length} فایل هسته‌ی وردپرس دستکاری شده: ${newlyModified
          .slice(0, 5)
          .map((f) => f.file)
          .join(", ")}${newlyModified.length > 5 ? "…" : ""}`,
        severity: "critical",
        detail: { files: newlyModified },
      });
    }
  }

  if (prev?.dbSizeMb != null && next.dbSizeMb != null && prev.dbSizeMb > 0) {
    const growthPercent = ((next.dbSizeMb - prev.dbSizeMb) / prev.dbSizeMb) * 100;
    if (growthPercent >= env.dbGrowthWarnPercent) {
      events.push({
        type: "db_growth",
        title: `دیتابیس ${growthPercent.toFixed(0)}٪ رشد ناگهانی داشت (${prev.dbSizeMb}MB → ${next.dbSizeMb}MB)`,
        severity: "warning",
        detail: { before: prev.dbSizeMb, after: next.dbSizeMb },
      });
    }
  }

  return events;
}
