import fs from "node:fs";
import path from "node:path";
import { env } from "./config.js";
import { auditPage } from "./checks/pageAudit.js";
import { diffPercent } from "./checks/visualDiff.js";
import { checkDomainExpiry } from "./checks/domain.js";
import { listSites, latestScreenshot, recordScreenshot, recordCheck, latestCheck, recordEvent } from "./db.js";
import { sendTelegram } from "./notify/telegram.js";

const SCREENSHOT_DIR = path.resolve("data/screenshots");

function hostnameOf(url) {
  return new URL(url).hostname;
}

async function runVisualAndVitals(site) {
  const audit = await auditPage(site.url);
  if (!audit.ok) {
    console.error(`[deep-check] ${site.name} page audit failed: ${audit.error}`);
    return;
  }

  const prevShot = latestScreenshot(site.id);
  let diff = null;
  if (prevShot && fs.existsSync(prevShot.path)) {
    try {
      diff = diffPercent(fs.readFileSync(prevShot.path), audit.screenshot);
    } catch (err) {
      console.error(`[deep-check] ${site.name} visual diff failed: ${err.message}`);
    }
  }

  const dir = path.join(SCREENSHOT_DIR, String(site.id));
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${Date.now()}.png`);
  fs.writeFileSync(filePath, audit.screenshot);

  recordScreenshot(site.id, {
    path: filePath,
    diffPercent: diff,
    lcpMs: audit.lcpMs,
    cls: audit.cls,
    ttfbMs: audit.ttfbMs,
  });

  // keep only the last 20 screenshots per site on disk
  const files = fs.readdirSync(dir).sort();
  for (const old of files.slice(0, -20)) fs.unlinkSync(path.join(dir, old));

  if (diff != null && diff >= env.visualDiffWarnPercent) {
    recordEvent(site.id, {
      type: "visual_change",
      title: `🖼 ${diff.toFixed(1)}٪ از صفحه‌ی اصلی نسبت به قبل تغییر ظاهری کرده`,
      severity: diff >= 40 ? "critical" : "warning",
      source: "external",
    });
    await sendTelegram(`<b>${site.name}</b> — ${diff.toFixed(1)}٪ تغییر ظاهری در هوم‌پیج تشخیص داده شد\n${site.url}`);
  }

  if (audit.lcpMs != null) {
    const prevVitals = latestCheck(site.id, "vitals");
    const wasSlow = prevVitals?.response_ms > env.lcpWarnMs;
    const isSlow = audit.lcpMs > env.lcpWarnMs;
    recordCheck(site.id, { type: "vitals", ok: true, responseMs: audit.lcpMs });
    if (isSlow && !wasSlow) {
      recordEvent(site.id, {
        type: "cwv_drop",
        title: `🐌 LCP بدتر شد: ${audit.lcpMs}ms (بالاتر از حد قابل قبول)`,
        severity: "warning",
      });
      await sendTelegram(`<b>${site.name}</b> — سرعت بارگذاری (LCP) افت کرد: ${audit.lcpMs}ms`);
    }
  }
}

async function runDomainCheck(site) {
  const prev = latestCheck(site.id, "domain");
  const result = await checkDomainExpiry(hostnameOf(site.url));
  recordCheck(site.id, {
    type: "domain",
    ok: result.ok,
    sslDaysLeft: result.daysLeft ?? null,
    error: result.error ?? null,
  });

  if (!result.ok) return;

  const shouldWarn = result.daysLeft <= env.domainWarnDays;
  const alreadyWarned = prev && prev.ssl_days_left != null && prev.ssl_days_left <= env.domainWarnDays;
  if (shouldWarn && !alreadyWarned) {
    const title = `🌐 دامنه تا ${result.daysLeft} روز دیگه منقضی می‌شه`;
    recordEvent(site.id, { type: "domain_warning", title, severity: "warning" });
    await sendTelegram(`<b>${site.name}</b> ${title}`);
  }
}

export async function runDeepChecks() {
  for (const site of listSites()) {
    try {
      await runVisualAndVitals(site);
    } catch (err) {
      console.error(`[deep-check] ${site.name} visual/vitals failed:`, err.message);
    }
    try {
      await runDomainCheck(site);
    } catch (err) {
      console.error(`[deep-check] ${site.name} domain check failed:`, err.message);
    }
  }
}
