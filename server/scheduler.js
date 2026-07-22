import cron from "node-cron";
import { env } from "./config.js";
import { checkUptime } from "./checks/uptime.js";
import { checkSsl } from "./checks/ssl.js";
import { checkPort } from "./checks/port.js";
import { sendTelegram, notifySite } from "./notify/telegram.js";
import { listSites, recordCheck, latestCheck, recordEvent, listAllPortChecks } from "./db.js";
import { runDeepChecks } from "./deepChecks.js";
import { backupDatabase } from "./backup.js";
import { runVulnerabilityScan } from "./vuln/index.js";
import { pruneOldLogs } from "./logger.js";
import { logger } from "./logger.js";

function hostnameOf(url) {
  return new URL(url).hostname;
}

async function checkSiteUptime(site) {
  const prev = latestCheck(site.id, "uptime");
  const result = await checkUptime(site.url, { keyword: site.keyword, keywordMode: site.keyword_mode });
  recordCheck(site.id, {
    type: "uptime",
    ok: result.up,
    responseMs: result.responseMs,
    statusCode: result.statusCode,
    error: result.error,
  });

  // Treat "no prior check" as if it was up, so a site that's already down
  // the very first time we check it still alerts instead of silently
  // waiting for a future transition that may never come.
  const wasUp = prev ? Boolean(prev.ok) : true;
  if (wasUp !== result.up) {
    const title = result.up
      ? `🟢 برگشت آنلاین (${result.responseMs}ms)`
      : `🔴 از دسترس خارج شد — ${result.error || `HTTP ${result.statusCode}`}`;
    recordEvent(site.id, { type: "uptime_change", title, severity: result.up ? "info" : "critical" });
    await notifySite(site.id, `<b>${site.name}</b> ${title}\n${site.url}`, "status");
  }

  if (result.up && prev) {
    const wasSlow = prev.response_ms > env.slowResponseMs;
    if (result.slow && !wasSlow) {
      const title = `🐢 کند شد: ${result.responseMs}ms`;
      recordEvent(site.id, { type: "slow_response", title, severity: "warning" });
      await notifySite(site.id, `<b>${site.name}</b> ${title}\n${site.url}`, "performance");
    } else if (!result.slow && wasSlow) {
      recordEvent(site.id, {
        type: "slow_response_recovered",
        title: `⚡️ سرعت پاسخ عادی شد (${result.responseMs}ms)`,
        severity: "info",
      });
    }
  }

  if (site.checkout_url) {
    const checkoutPrev = latestCheck(site.id, "checkout");
    const checkoutResult = await checkUptime(site.checkout_url);
    recordCheck(site.id, {
      type: "checkout",
      ok: checkoutResult.up,
      responseMs: checkoutResult.responseMs,
      statusCode: checkoutResult.statusCode,
      error: checkoutResult.error,
    });
    const checkoutWasUp = checkoutPrev ? Boolean(checkoutPrev.ok) : true;
    if (checkoutWasUp !== checkoutResult.up) {
      const title = checkoutResult.up ? "🟢 صفحه‌ی چک‌اوت دوباره سالمه" : "🔴 صفحه‌ی چک‌اوت خرابه";
      recordEvent(site.id, { type: "checkout_change", title, severity: checkoutResult.up ? "info" : "critical" });
      await notifySite(site.id, `<b>${site.name}</b> ${title}\n${site.checkout_url}`, "status");
    }
  }
}

async function checkSiteSsl(site) {
  const prev = latestCheck(site.id, "ssl");
  let result;
  try {
    result = await checkSsl(hostnameOf(site.url));
  } catch (err) {
    result = { ok: false, error: err.message };
  }

  recordCheck(site.id, {
    type: "ssl",
    ok: result.ok,
    sslDaysLeft: result.daysLeft ?? null,
    error: result.error ?? null,
  });

  if (!result.ok) return;

  const shouldWarn = result.daysLeft <= env.sslWarnDays;
  const alreadyWarned = prev && prev.ssl_days_left != null && prev.ssl_days_left <= env.sslWarnDays;
  if (shouldWarn && !alreadyWarned) {
    const title = `⚠️ گواهی SSL تا ${result.daysLeft} روز دیگه منقضی می‌شه`;
    recordEvent(site.id, { type: "ssl_warning", title, severity: "warning" });
    await notifySite(site.id, `<b>${site.name}</b> ${title}`, "ssl");
  }
}

async function checkPortMonitor(portCheck) {
  const type = `port:${portCheck.id}`;
  const prev = latestCheck(portCheck.site_id, type);
  const result = await checkPort(portCheck.host, portCheck.port);
  recordCheck(portCheck.site_id, { type, ok: result.ok, responseMs: result.responseMs, error: result.error });

  const wasUp = prev ? Boolean(prev.ok) : true;
  if (wasUp !== result.ok) {
    const title = result.ok
      ? `🟢 پورت ${portCheck.label} (${portCheck.host}:${portCheck.port}) دوباره باز شد`
      : `🔴 پورت ${portCheck.label} (${portCheck.host}:${portCheck.port}) بسته شد — ${result.error}`;
    recordEvent(portCheck.site_id, { type: "port_change", title, severity: result.ok ? "info" : "critical" });
    await notifySite(portCheck.site_id, `<b>${portCheck.site_name}</b> ${title}`, "status");
  }
}

export async function runChecks() {
  const sites = listSites().filter((s) => !s.paused);
  for (const site of sites) {
    try {
      await checkSiteUptime(site);
      await checkSiteSsl(site);
    } catch (err) {
      logger.error("checks: site check failed", { site: site.name, error: err.message });
    }
  }

  for (const portCheck of listAllPortChecks().filter((p) => !p.site_paused)) {
    try {
      await checkPortMonitor(portCheck);
    } catch (err) {
      logger.error("checks: port check failed", { label: portCheck.label, error: err.message });
    }
  }
}

async function sendDailySummary() {
  const sites = listSites().filter((s) => !s.paused);
  const lines = sites.map((site) => {
    const uptime = latestCheck(site.id, "uptime");
    const ssl = latestCheck(site.id, "ssl");
    const status = uptime == null ? "❓" : uptime.ok ? "🟢 UP" : "🔴 DOWN";
    const responseMs = uptime?.response_ms != null ? `${uptime.response_ms}ms` : "-";
    const sslDays = ssl?.ssl_days_left != null ? `${ssl.ssl_days_left}d` : "?";
    return `${status} <b>${site.name}</b> — ${responseMs}, SSL: ${sslDays}`;
  });
  if (lines.length) await sendTelegram(`📊 <b>گزارش روزانه</b>\n\n${lines.join("\n")}`, "status");
}

export function startScheduler() {
  cron.schedule(`*/${env.checkIntervalMinutes} * * * *`, runChecks);
  cron.schedule(`0 ${env.dailySummaryHour} * * *`, sendDailySummary);
  cron.schedule(`0 ${env.deepCheckHour} * * *`, () =>
    runDeepChecks().catch((err) => logger.error("deep-check: run failed", { error: err.message }))
  );
  cron.schedule(`0 ${env.backupHour} * * *`, () => {
    backupDatabase();
    pruneOldLogs();
  });
  cron.schedule(`0 ${env.vulnSyncHour} * * *`, () =>
    runVulnerabilityScan().catch((err) => logger.error("vuln: scan failed", { error: err.message }))
  );
  logger.info("scheduler: started", {
    checkIntervalMinutes: env.checkIntervalMinutes,
    dailySummaryHour: env.dailySummaryHour,
    deepCheckHour: env.deepCheckHour,
  });
}
