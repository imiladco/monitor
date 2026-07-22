import { env } from "../config.js";
import {
  checkHistory,
  getOpenIncident,
  openIncident,
  incrementIncidentFailure,
  resolveIncident,
  recentIncidentCount,
  recordEvent,
} from "../db.js";
import { notifySite } from "../notify/telegram.js";
import { logger } from "../logger.js";

// Count how many of the most recent checks (newest first) failed before the
// first success — i.e. the current run of consecutive failures. The just-taken
// check is already recorded, so this includes it.
function trailingFailures(siteId, type, max) {
  const rows = checkHistory(siteId, type, max);
  let n = 0;
  for (const r of rows) {
    if (r.ok) break;
    n += 1;
  }
  return n;
}

// Approximate the outage start as the timestamp of the oldest check in the
// current failure run.
function firstFailureAt(siteId, type, runLength) {
  const rows = checkHistory(siteId, type, runLength);
  const oldestFailing = rows[Math.min(runLength, rows.length) - 1];
  return oldestFailing?.checked_at ?? null;
}

/**
 * Turns a single check outcome into incident lifecycle transitions and the
 * notifications that go with them. Call this AFTER the check row is recorded.
 *
 * - Down + no open incident: opens one only once `incidentConfirmChecks`
 *   consecutive failures are seen (false-positive control). Dedupes to one
 *   open incident per site+type. Flags/quiets flapping sites.
 * - Down + open incident: just bumps the failure counter (no repeat alert).
 * - Up + open incident: resolves it and sends a recovery notification.
 *
 * Returns the action taken (for tests/telemetry): "opened" | "escalated" |
 * "resolved" | "confirming" | "none".
 */
export async function processCheckResult(site, opts) {
  const {
    type,
    up,
    downCause,
    recoveryDetail,
    notifyCategory = "status",
    url = site.url,
    subject = site.name,
    downTitle,
    recoveryTitle,
    // Keep SLA/timeline event types per-check-type so a checkout/port outage
    // isn't counted as uptime downtime.
    eventType = `${type}_change`,
  } = opts;
  const tail = url ? `\n${url}` : "";
  const open = getOpenIncident(site.id, type);

  if (!up) {
    if (open) {
      incrementIncidentFailure(open.id);
      return "escalated";
    }
    const runLength = trailingFailures(site.id, type, env.incidentConfirmChecks);
    if (runLength < env.incidentConfirmChecks) {
      return "confirming"; // not enough consecutive failures yet — no alert
    }

    const flapping = recentIncidentCount(site.id, type, env.incidentFlapWindowMin) >= env.incidentFlapThreshold;
    const title = downTitle || `🔴 از دسترس خارج شد — ${downCause || "بدون پاسخ"}`;
    const incident = openIncident({
      siteId: site.id,
      type,
      title,
      cause: downCause ?? null,
      startedAt: firstFailureAt(site.id, type, runLength),
      flapping,
    });
    recordEvent(site.id, { type: eventType, title, severity: "critical", detail: { incidentId: incident.id } });
    logger.info("incident: opened", { site: site.name, type, incidentId: incident.id, flapping });

    // Flapping sites get a single consolidated notice instead of an alert per
    // open/close cycle.
    if (flapping) {
      await notifySite(
        site.id,
        `🌀 <b>${subject}</b> ناپایدار شده (flapping) — چند بار پشت‌سرهم قطع/وصل شده${tail}`,
        notifyCategory
      );
    } else {
      await notifySite(site.id, `<b>${subject}</b> ${title}${tail}`, notifyCategory);
    }
    return "opened";
  }

  // up
  if (open) {
    resolveIncident(open.id);
    const title = recoveryTitle || (recoveryDetail ? `🟢 برگشت آنلاین (${recoveryDetail})` : "🟢 برگشت آنلاین");
    recordEvent(site.id, { type: eventType, title, severity: "info", detail: { incidentId: open.id } });
    logger.info("incident: resolved", { site: site.name, type, incidentId: open.id });
    if (!open.flapping) {
      await notifySite(site.id, `<b>${subject}</b> ${title}${tail}`, notifyCategory);
    }
    return "resolved";
  }
  return "none";
}
