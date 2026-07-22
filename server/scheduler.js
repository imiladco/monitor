import cron from "node-cron";
import { env } from "./config.js";
import { checkUptime } from "./checks/uptime.js";
import { checkSsl } from "./checks/ssl.js";
import { sendTelegram } from "./notify/telegram.js";
import { listSites, recordCheck, latestCheck, recordEvent } from "./db.js";

function hostnameOf(url) {
  return new URL(url).hostname;
}

async function checkSiteUptime(site) {
  const prev = latestCheck(site.id, "uptime");
  const result = await checkUptime(site.url);
  recordCheck(site.id, {
    type: "uptime",
    ok: result.up,
    responseMs: result.responseMs,
    statusCode: result.statusCode,
    error: result.error,
  });

  if (prev && Boolean(prev.ok) !== result.up) {
    const title = result.up
      ? `🟢 برگشت آنلاین (${result.responseMs}ms)`
      : `🔴 از دسترس خارج شد — ${result.error || `HTTP ${result.statusCode}`}`;
    recordEvent(site.id, { type: "uptime_change", title, severity: result.up ? "info" : "critical" });
    await sendTelegram(`<b>${site.name}</b> ${title}\n${site.url}`);
  }

  if (result.up && prev) {
    const wasSlow = prev.response_ms > env.slowResponseMs;
    if (result.slow && !wasSlow) {
      const title = `🐢 کند شد: ${result.responseMs}ms`;
      recordEvent(site.id, { type: "slow_response", title, severity: "warning" });
      await sendTelegram(`<b>${site.name}</b> ${title}\n${site.url}`);
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
    if (checkoutPrev && Boolean(checkoutPrev.ok) !== checkoutResult.up) {
      const title = checkoutResult.up ? "🟢 صفحه‌ی چک‌اوت دوباره سالمه" : "🔴 صفحه‌ی چک‌اوت خرابه";
      recordEvent(site.id, { type: "checkout_change", title, severity: checkoutResult.up ? "info" : "critical" });
      await sendTelegram(`<b>${site.name}</b> ${title}\n${site.checkout_url}`);
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
    await sendTelegram(`<b>${site.name}</b> ${title}`);
  }
}

export async function runChecks() {
  const sites = listSites();
  for (const site of sites) {
    try {
      await checkSiteUptime(site);
      await checkSiteSsl(site);
    } catch (err) {
      console.error(`[checks] ${site.name} failed:`, err.message);
    }
  }
}

async function sendDailySummary() {
  const sites = listSites();
  const lines = sites.map((site) => {
    const uptime = latestCheck(site.id, "uptime");
    const ssl = latestCheck(site.id, "ssl");
    const status = uptime == null ? "❓" : uptime.ok ? "🟢 UP" : "🔴 DOWN";
    const responseMs = uptime?.response_ms != null ? `${uptime.response_ms}ms` : "-";
    const sslDays = ssl?.ssl_days_left != null ? `${ssl.ssl_days_left}d` : "?";
    return `${status} <b>${site.name}</b> — ${responseMs}, SSL: ${sslDays}`;
  });
  if (lines.length) await sendTelegram(`📊 <b>گزارش روزانه</b>\n\n${lines.join("\n")}`);
}

export function startScheduler() {
  cron.schedule(`*/${env.checkIntervalMinutes} * * * *`, runChecks);
  cron.schedule(`0 ${env.dailySummaryHour} * * *`, sendDailySummary);
  console.log(
    `[scheduler] checks every ${env.checkIntervalMinutes}m, daily summary at ${env.dailySummaryHour}:00`
  );
}
