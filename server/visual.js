import fs from "node:fs";
import path from "node:path";
import { captureUrl } from "./checks/pageAudit.js";
import { diffImage } from "./checks/visualDiff.js";
import {
  listVisualTargets,
  getVisualTarget,
  setVisualBaseline,
  recordVisualShot,
  recordEvent,
} from "./db.js";
import { notifySite } from "./notify/telegram.js";
import { logger } from "./logger.js";

const VISUAL_DIR = path.resolve("data/visual");

function targetDir(target) {
  const dir = path.join(VISUAL_DIR, String(target.site_id), String(target.id));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Capture one visual target and compare it to its approved baseline. On the
// first run (no baseline) the capture becomes the baseline automatically.
// `capture` is injectable for tests.
export async function captureVisualTarget(target, site, capture = captureUrl) {
  const shot = await capture(target.url, target.viewport);
  if (!shot.ok) {
    logger.warn("visual: capture failed", { target: target.label, error: shot.error });
    return;
  }
  const dir = targetDir(target);

  if (!target.baseline_path || !fs.existsSync(target.baseline_path)) {
    const baselinePath = path.join(dir, "baseline.png");
    fs.writeFileSync(baselinePath, shot.buffer);
    setVisualBaseline(target.id, baselinePath);
    logger.info("visual: baseline captured", { target: target.label });
    return;
  }

  const lastPath = path.join(dir, "last.png");
  fs.writeFileSync(lastPath, shot.buffer);

  const result = diffImage(fs.readFileSync(target.baseline_path), shot.buffer);
  if (!result) {
    // Dimensions changed — treat as a significant change without a pixel diff.
    recordVisualShot(target.id, { lastPath, diffPath: null, lastDiff: 100 });
    recordEvent(site.id, {
      type: "visual_change",
      title: `🖼 ابعاد صفحه‌ی «${target.label}» عوض شد`,
      severity: "warning",
    });
    return;
  }

  const diffPath = path.join(dir, "diff.png");
  fs.writeFileSync(diffPath, result.diffBuffer);
  recordVisualShot(target.id, { lastPath, diffPath, lastDiff: Number(result.percent.toFixed(2)) });

  if (result.percent >= target.threshold) {
    const title = `🖼 «${target.label}» ${result.percent.toFixed(1)}٪ نسبت به baseline تغییر کرده`;
    recordEvent(site.id, {
      type: "visual_change",
      title,
      severity: result.percent >= 40 ? "critical" : "warning",
      detail: { targetId: target.id, percent: result.percent },
    });
    await notifySite(site.id, `<b>${site.name}</b> — ${title}\n${target.url}`, "performance");
  }
}

export async function captureSiteVisualTargets(site) {
  for (const target of listVisualTargets(site.id)) {
    try {
      await captureVisualTarget(target, site);
    } catch (err) {
      logger.error("visual: target failed", { target: target.label, error: err.message });
    }
  }
}

// Approve the latest capture as the new baseline.
export function approveBaseline(id) {
  const target = getVisualTarget(id);
  if (!target || !target.last_path || !fs.existsSync(target.last_path)) return false;
  const dir = targetDir(target);
  const baselinePath = path.join(dir, "baseline.png");
  fs.copyFileSync(target.last_path, baselinePath);
  setVisualBaseline(id, baselinePath);
  return true;
}
