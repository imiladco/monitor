import fs from "node:fs";
import path from "node:path";
import { env } from "./config.js";
import { auditPage } from "./checks/pageAudit.js";
import { diffPercent } from "./checks/visualDiff.js";
import { checkDomainExpiry } from "./checks/domain.js";
import { listSites, latestScreenshot, recordScreenshot, recordCheck, latestCheck, recordEvent } from "./db.js";
import { notifySite } from "./notify/telegram.js";
import { captureSiteVisualTargets } from "./visual.js";
import { logger } from "./logger.js";

const SCREENSHOT_DIR = path.resolve("data/screenshots");

function hostnameOf(url) {
  return new URL(url).hostname;
}

async function runVisualAndVitals(site) {
  const audit = await auditPage(site.url);
  if (!audit.ok) {
    logger.error("deep-check: page audit failed", { site: site.name, error: audit.error });
    return;
  }

  const prevShot = latestScreenshot(site.id);
  let diff = null;
  if (prevShot && fs.existsSync(prevShot.path)) {
    try {
      diff = diffPercent(fs.readFileSync(prevShot.path), audit.screenshot);
    } catch (err) {
      logger.error("deep-check: visual diff failed", { site: site.name, error: err.message });
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
    fcpMs: audit.fcpMs,
    tbtMs: audit.tbtMs,
    resources: audit.resources,
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
    await notifySite(
      site.id,
      `<b>${site.name}</b> — ${diff.toFixed(1)}٪ تغییر ظاهری در هوم‌پیج تشخیص داده شد\n${site.url}`,
      "performance"
    );
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
      await notifySite(site.id, `<b>${site.name}</b> — سرعت بارگذاری (LCP) افت کرد: ${audit.lcpMs}ms`, "performance");
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
    await notifySite(site.id, `<b>${site.name}</b> ${title}`, "domain");
  }
}

// Deep check for a single site: visual/vitals audit + domain expiry + visual
// regression targets. Used both by the job worker (one job per site) and the
// direct runDeepChecks() path.
export async function runDeepCheckForSite(site) {
  await runVisualAndVitals(site);
  await runDomainCheck(site);
  await captureSiteVisualTargets(site);
}

export async function runDeepChecks() {
  for (const site of listSites().filter((s) => !s.paused)) {
    try {
      await runDeepCheckForSite(site);
    } catch (err) {
      logger.error("deep-check: failed", { site: site.name, error: err.message });
    }
  }
}
