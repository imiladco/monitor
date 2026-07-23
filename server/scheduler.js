import cron from "node-cron";
import { env } from "./config.js";
import { checkUptime } from "./checks/uptime.js";
import { checkSsl } from "./checks/ssl.js";
import { checkPort } from "./checks/port.js";
import { resolveDns } from "./checks/dns.js";
import { sendTelegram, notifySite } from "./notify/telegram.js";
import {
  listSites,
  recordCheck,
  latestCheck,
  latestCheckMeta,
  recordEvent,
  listAllPortChecks,
  recoverStuckCommands,
  pruneExpiredSessions,
  getSiteById,
  enqueueJob,
  recoverStuckJobs,
  pruneFinishedJobs,
} from "./db.js";
import { processCheckResult } from "./incident/index.js";
import { runPool } from "./pool.js";
import { runDeepCheckForSite } from "./deepChecks.js";
import { registerJob, startWorkers } from "./jobs/queue.js";
import { backupDatabase } from "./backup.js";
import { runVulnerabilityScan } from "./vuln/index.js";
import { evaluatePendingVerdicts } from "./fleet/index.js";
import { pruneOldLogs } from "./logger.js";
import { runRetention } from "./retention.js";
import { runSystemMaintenance } from "./systemHealth.js";
import { logger } from "./logger.js";

function hostnameOf(url) {
  return new URL(url).hostname;
}

function parseHttpConfig(site) {
  if (!site.http_config) return {};
  try {
    return JSON.parse(site.http_config);
  } catch {
    return {};
  }
}

async function checkSiteUptime(site) {
  const prev = latestCheck(site.id, "uptime");
  const result = await checkUptime(site.url, {
    keyword: site.keyword,
    keywordMode: site.keyword_mode,
    ...parseHttpConfig(site),
  });
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
  const prevMeta = latestCheckMeta(site.id, "ssl");
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
    meta: result.ok
      ? {
          issuer: result.issuer,
          subject: result.subject,
          tlsVersion: result.tlsVersion,
          fingerprint: result.fingerprint,
          altNames: result.altNames,
          authorized: result.authorized,
          authorizationError: result.authorizationError,
          hostnameMismatch: result.hostnameMismatch,
        }
      : null,
  });

  if (!result.ok) return;

  // Chain/hostname validity — a real security signal, not just expiry.
  const wasAuthorized = prevMeta ? prevMeta.authorized !== false : true;
  if (!result.authorized && wasAuthorized) {
    const reason = result.hostnameMismatch ? "عدم تطابق نام دامنه (hostname mismatch)" : "زنجیره‌ی گواهی نامعتبره";
    const title = `🔴 گواهی SSL نامعتبر — ${reason}`;
    recordEvent(site.id, { type: "ssl_invalid", title, severity: "critical", detail: { error: result.authorizationError } });
    await notifySite(site.id, `<b>${site.name}</b> ${title}\n${site.url}`, "ssl");
  }

  // Certificate rotation / issuer change — informational, but a surprise
  // issuer change is worth surfacing.
  if (prevMeta?.fingerprint && result.fingerprint && prevMeta.fingerprint !== result.fingerprint) {
    const issuerChanged = prevMeta.issuer && result.issuer && prevMeta.issuer !== result.issuer;
    const title = issuerChanged
      ? `🔁 گواهی SSL عوض شد — صادرکننده از «${prevMeta.issuer}» به «${result.issuer}»`
      : `🔁 گواهی SSL نو شد (${result.issuer || "صادرکننده نامشخص"})`;
    recordEvent(site.id, { type: "ssl_cert_change", title, severity: issuerChanged ? "warning" : "info" });
    if (issuerChanged) await notifySite(site.id, `<b>${site.name}</b> ${title}`, "ssl");
  }

  const shouldWarn = result.daysLeft <= env.sslWarnDays;
  const alreadyWarned = prev && prev.ssl_days_left != null && prev.ssl_days_left <= env.sslWarnDays;
  if (shouldWarn && !alreadyWarned) {
    // Escalate severity as expiry nears (spec: <30 warning, <7 high, expired critical).
    const severity = result.daysLeft <= 0 ? "critical" : result.daysLeft <= 7 ? "critical" : "warning";
    const title =
      result.daysLeft <= 0
        ? "🔴 گواهی SSL منقضی شده"
        : `⚠️ گواهی SSL تا ${result.daysLeft} روز دیگه منقضی می‌شه`;
    recordEvent(site.id, { type: "ssl_warning", title, severity });
    await notifySite(site.id, `<b>${site.name}</b> ${title}`, "ssl");
  }
}

function arraysEqual(a = [], b = []) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

async function checkSiteDns(site) {
  const prev = latestCheckMeta(site.id, "dns");
  let records;
  try {
    records = await resolveDns(hostnameOf(site.url));
  } catch (err) {
    recordCheck(site.id, { type: "dns", ok: false, error: err.message });
    return;
  }
  const resolved = records.a.length > 0 || records.aaaa.length > 0;
  recordCheck(site.id, { type: "dns", ok: resolved, error: resolved ? null : "no A/AAAA records", meta: records });

  if (!prev) return; // first observation — nothing to compare

  // IP change (A/AAAA) and nameserver change are worth alerting; MX change is
  // informational.
  if (!arraysEqual(prev.a, records.a) || !arraysEqual(prev.aaaa, records.aaaa)) {
    const title = `🌐 رکورد IP دامنه تغییر کرد — ${(prev.a[0] || "?")} → ${(records.a[0] || "?")}`;
    recordEvent(site.id, { type: "dns_change", title, severity: "warning", detail: { before: prev.a, after: records.a } });
    await notifySite(site.id, `<b>${site.name}</b> ${title}\n${site.url}`, "status");
  }
  if (!arraysEqual(prev.ns, records.ns)) {
    const title = "🌐 Nameserverهای دامنه تغییر کردن";
    recordEvent(site.id, { type: "ns_change", title, severity: "warning", detail: { before: prev.ns, after: records.ns } });
    await notifySite(site.id, `<b>${site.name}</b> ${title}\n${site.url}`, "status");
  }
  if (!arraysEqual(prev.mx, records.mx)) {
    recordEvent(site.id, {
      type: "mx_change",
      title: "✉️ رکوردهای MX (ایمیل) دامنه تغییر کردن",
      severity: "info",
      detail: { before: prev.mx, after: records.mx },
    });
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
    // Bounded concurrency: many sites (or a few slow/timing-out ones) no longer
    // serialize the whole sweep. runPool swallows per-item errors.
    const siteResults = await runPool(sites, env.uptimeConcurrency, async (site) => {
      await checkSiteUptime(site);
      await checkSiteSsl(site);
    });
    siteResults.forEach((r, i) => {
      if (r?.error) logger.error("checks: site check failed", { site: sites[i].name, error: r.error.message });
    });

    const portChecks = listAllPortChecks().filter((p) => !p.site_paused);
    const portResults = await runPool(portChecks, env.portConcurrency, (portCheck) => checkPortMonitor(portCheck));
    portResults.forEach((r, i) => {
      if (r?.error) logger.error("checks: port check failed", { label: portChecks[i].label, error: r.error.message });
    });
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
  // Heavy browser work runs through the durable job queue: one deep-check job
  // per site, processed under a low concurrency cap, retried with backoff, and
  // recovered after a restart.
  registerJob(
    "deep_check",
    async ({ siteId }) => {
      const site = getSiteById(siteId);
      if (site && !site.paused) await runDeepCheckForSite(site);
    },
    { concurrency: env.browserConcurrency, timeoutMs: 120000, backoffBaseSeconds: 60 }
  );
  startWorkers();

  cron.schedule(`*/${env.checkIntervalMinutes} * * * *`, runChecks);
  cron.schedule(`0 ${env.dailySummaryHour} * * *`, sendDailySummary);
  cron.schedule(`0 ${env.deepCheckHour} * * *`, () => {
    const active = listSites().filter((s) => !s.paused);
    for (const site of active) {
      enqueueJob({ type: "deep_check", payload: { siteId: site.id }, maxAttempts: 2 });
    }
    // DNS is cheap and stable — resolve daily, off the browser queue.
    runPool(active, env.uptimeConcurrency, checkSiteDns).catch((err) =>
      logger.error("dns: sweep failed", { error: err.message })
    );
  });
  cron.schedule(`0 ${env.backupHour} * * *`, async () => {
    await backupDatabase();
    pruneOldLogs();
    pruneExpiredSessions();
    runRetention();
    // Aggregate, VACUUM, verify backup, and alert on low disk — after the
    // fresh backup and retention prune so it reflects the trimmed DB.
    await runSystemMaintenance().catch((err) => logger.error("system: maintenance failed", { error: err.message }));
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
    const recoveredJobs = recoverStuckJobs();
    if (recoveredJobs) logger.warn("jobs: requeued stuck running jobs", { count: recoveredJobs });
    pruneFinishedJobs();
  });
  logger.info("scheduler: started", {
    checkIntervalMinutes: env.checkIntervalMinutes,
    dailySummaryHour: env.dailySummaryHour,
    deepCheckHour: env.deepCheckHour,
  });
}
