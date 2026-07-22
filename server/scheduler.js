import cron from "node-cron";
import { env } from "./config.js";
import { checkUptime } from "./checks/uptime.js";
import { checkSsl } from "./checks/ssl.js";
import { checkPort } from "./checks/port.js";
import { sendTelegram, notifySite } from "./notify/telegram.js";
import { listSites, recordCheck, latestCheck, recordEvent, listAllPortChecks, recoverStuckCommands, pruneExpiredSessions } from "./db.js";
import { processCheckResult } from "./incident/index.js";
import { runDeepChecks } from "./deepChecks.js";
import { backupDatabase } from "./backup.js";
import { runVulnerabilityScan } from "./vuln/index.js";
import { evaluatePendingVerdicts } from "./fleet/index.js";
import { pruneOldLogs } from "./logger.js";
import { runRetention } from "./retention.js";
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

  // The incident engine decides whether this outcome opens/resolves an
  // incident (after confirmation) and sends the alert — no more alerting on
  // a single blip.
  await processCheckResult(site, {
    type: "uptime",
    up: result.up,
    downCause: result.error || `HTTP ${result.statusCode}`,
    recoveryDetail: `${result.responseMs}ms`,
    notifyCategory: "status",
  });

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
    await processCheckResult(site, {
      type: "checkout",
      up: checkoutResult.up,
      downTitle: "🔴 صفحه‌ی چک‌اوت خرابه",
      recoveryTitle: "🟢 صفحه‌ی چک‌اوت دوباره سالمه",
      notifyCategory: "status",
      url: site.checkout_url,
    });
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

  await processCheckResult(
    { id: portCheck.site_id, name: portCheck.site_name, url: "" },
    {
      type,
      up: result.ok,
      eventType: "port_change",
      downTitle: `🔴 پورت ${portCheck.label} (${portCheck.host}:${portCheck.port}) بسته شد — ${result.error}`,
      recoveryTitle: `🟢 پورت ${portCheck.label} (${portCheck.host}:${portCheck.port}) دوباره باز شد`,
      notifyCategory: "status",
      url: "",
    }
  );
}

let checksRunning = false;

export async function runChecks() {
  // Guard against overlapping runs: if a slow cycle (many sites / timeouts)
  // is still going when the next tick fires, skip rather than stack.
  if (checksRunning) {
    logger.warn("checks: previous run still in progress, skipping this tick");
    return;
  }
  checksRunning = true;
  try {
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
  } finally {
    checksRunning = false;
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
    pruneExpiredSessions();
    runRetention();
  });
  cron.schedule(`0 ${env.vulnSyncHour} * * *`, () =>
    runVulnerabilityScan().catch((err) => logger.error("vuln: scan failed", { error: err.message }))
  );
  cron.schedule("*/5 * * * *", () =>
    evaluatePendingVerdicts().catch((err) => logger.error("fleet: evaluation failed", { error: err.message }))
  );
  cron.schedule("*/5 * * * *", () => {
    const recovered = recoverStuckCommands();
    if (recovered) logger.warn("commands: requeued stuck running commands", { count: recovered });
  });
  logger.info("scheduler: started", {
    checkIntervalMinutes: env.checkIntervalMinutes,
    dailySummaryHour: env.dailySummaryHour,
    deepCheckHour: env.deepCheckHour,
  });
}
