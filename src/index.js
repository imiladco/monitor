import cron from "node-cron";
import { loadSites, env } from "./config.js";
import { checkUptime } from "./checks/uptime.js";
import { checkSsl } from "./checks/ssl.js";
import { sendTelegram } from "./notify/telegram.js";
import { loadState, saveState } from "./state.js";

function hostnameOf(url) {
  return new URL(url).hostname;
}

async function checkSite(site, state) {
  const key = site.name;
  const prev = state[key] || {};
  const next = { ...prev };
  const alerts = [];

  const uptime = await checkUptime(site.url);
  next.up = uptime.up;
  next.lastResponseMs = uptime.responseMs;

  if (prev.up !== undefined && prev.up !== uptime.up) {
    alerts.push(
      uptime.up
        ? `🟢 <b>${key}</b> برگشت آنلاین (${uptime.responseMs}ms)`
        : `🔴 <b>${key}</b> از دسترس خارج شد — ${uptime.error || `HTTP ${uptime.statusCode}`}\n${site.url}`
    );
  }

  if (uptime.up) {
    if (uptime.slow && !prev.slow) {
      alerts.push(`🐢 <b>${key}</b> کند شده: ${uptime.responseMs}ms\n${site.url}`);
    } else if (!uptime.slow && prev.slow) {
      alerts.push(`⚡️ <b>${key}</b> سرعت پاسخ به حالت عادی برگشت (${uptime.responseMs}ms)`);
    }
  }
  next.slow = uptime.up ? uptime.slow : false;

  if (site.checkoutUrl) {
    const checkout = await checkUptime(site.checkoutUrl);
    if (prev.checkoutUp !== undefined && prev.checkoutUp !== checkout.up) {
      alerts.push(
        checkout.up
          ? `🟢 <b>${key}</b> صفحه‌ی چک‌اوت دوباره سالمه`
          : `🔴 <b>${key}</b> صفحه‌ی چک‌اوت خرابه — ${checkout.error || `HTTP ${checkout.statusCode}`}\n${site.checkoutUrl}`
      );
    }
    next.checkoutUp = checkout.up;
  }

  try {
    const ssl = await checkSsl(hostnameOf(site.url));
    if (ssl.ok) {
      next.sslExpiresAt = ssl.expiresAt;
      const shouldWarn = ssl.daysLeft <= env.sslWarnDays;
      const alreadyWarnedThisCert = prev.sslWarnedFor === ssl.expiresAt;
      if (shouldWarn && !alreadyWarnedThisCert) {
        alerts.push(
          `⚠️ <b>${key}</b> گواهی SSL تا ${ssl.daysLeft} روز دیگه منقضی می‌شه (${new Date(ssl.expiresAt).toDateString()})`
        );
        next.sslWarnedFor = ssl.expiresAt;
      } else if (!shouldWarn) {
        next.sslWarnedFor = null;
      }
      next.sslError = null;
    } else {
      next.sslError = ssl.error;
    }
  } catch (err) {
    next.sslError = err.message;
  }

  state[key] = next;
  return alerts;
}

async function runChecks() {
  const sites = loadSites();
  const state = loadState();
  const allAlerts = [];

  for (const site of sites) {
    try {
      const alerts = await checkSite(site, state);
      allAlerts.push(...alerts);
    } catch (err) {
      allAlerts.push(`❗️ خطا در چک کردن <b>${site.name}</b>: ${err.message}`);
    }
  }

  saveState(state);

  for (const alert of allAlerts) {
    console.log(alert.replace(/<\/?b>/g, ""));
    await sendTelegram(alert);
  }

  if (allAlerts.length === 0) {
    console.log(`[${new Date().toISOString()}] all sites OK`);
  }
}

async function sendDailySummary() {
  const sites = loadSites();
  const state = loadState();
  const lines = sites.map((site) => {
    const s = state[site.name] || {};
    const status = s.up === false ? "🔴 DOWN" : s.up === undefined ? "❓ unchecked" : "🟢 UP";
    const responseMs = s.lastResponseMs != null ? `${s.lastResponseMs}ms` : "-";
    const sslDays = s.sslExpiresAt
      ? `${Math.ceil((new Date(s.sslExpiresAt) - Date.now()) / (1000 * 60 * 60 * 24))}d`
      : "?";
    return `${status} <b>${site.name}</b> — ${responseMs}, SSL: ${sslDays}`;
  });
  await sendTelegram(`📊 <b>گزارش روزانه</b>\n\n${lines.join("\n")}`);
}

async function main() {
  const once = process.argv.includes("--once");

  await runChecks();
  if (once) return;

  cron.schedule(`*/${env.checkIntervalMinutes} * * * *`, runChecks);
  cron.schedule(`0 ${env.dailySummaryHour} * * *`, sendDailySummary);

  console.log(
    `wp-site-monitor running: checks every ${env.checkIntervalMinutes}m, daily summary at ${env.dailySummaryHour}:00`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
