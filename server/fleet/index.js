import { env } from "../config.js";
import { logger } from "../logger.js";
import { notifySite } from "../notify/telegram.js";
import {
  enqueuePendingVerdict,
  duePendingVerdicts,
  deletePendingVerdict,
  checksInWindow,
  recordVerdict,
  getVerdict,
  createHold,
  activeHold,
  sitesWithPluginVersion,
  getSiteById,
} from "../db.js";

// How long after an update we wait before judging it. The uptime check runs
// every checkIntervalMinutes, so a 60-minute window gives ~12 data points.
const WINDOW_MINUTES = 60;

function isoAgo(baseIso, minutes) {
  return new Date(new Date(`${baseIso}Z`).getTime() + minutes * 60000).toISOString().slice(0, 19).replace("T", " ");
}

// Called from the ingest route when a plugin_update event is diffed. Queues a
// deferred evaluation instead of judging immediately (needs time to observe).
export function onPluginUpdate(siteId, { slug, fromVersion, toVersion }) {
  const eventAt = new Date().toISOString().slice(0, 19).replace("T", " ");
  const evaluateAfter = isoAgo(eventAt, WINDOW_MINUTES);
  enqueuePendingVerdict({ siteId, pluginSlug: slug, fromVersion, toVersion, eventAt, evaluateAfter });
  logger.info("fleet: queued verdict", { siteId, slug, fromVersion, toVersion });
}

// Judges one update using only the high-frequency signal we actually have:
// uptime checks (every few minutes). Compares the post-update window against
// a same-length reference window immediately before the update.
function judge(pending) {
  const after = checksInWindow(pending.site_id, "uptime", pending.event_at, isoAgo(pending.event_at, WINDOW_MINUTES));
  const beforeStart = isoAgo(pending.event_at, -WINDOW_MINUTES);
  const before = checksInWindow(pending.site_id, "uptime", beforeStart, pending.event_at);

  const afterDown = after.filter((c) => !c.ok || (c.status_code && c.status_code >= 500));
  const beforeDown = before.filter((c) => !c.ok || (c.status_code && c.status_code >= 500));

  if (afterDown.length > beforeDown.length && afterDown.length > 0) {
    return {
      verdict: "bad",
      notes: `${afterDown.length} چک ناموفق/۵۰۰ در ۱ ساعت بعد آپدیت (قبلش ${beforeDown.length})`,
    };
  }

  const avg = (rows) => {
    const vals = rows.filter((c) => c.ok && c.response_ms != null).map((c) => c.response_ms);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const avgAfter = avg(after);
  const avgBefore = avg(before);
  if (avgBefore != null && avgAfter != null && avgAfter > avgBefore * 2) {
    return {
      verdict: "suspicious",
      notes: `میانگین پاسخ از ${Math.round(avgBefore)}ms به ${Math.round(avgAfter)}ms رسید`,
    };
  }

  return { verdict: "safe", notes: null };
}

// Places holds on other sites still on fromVersion, so their agents block the
// same upgrade before applying it.
async function placeHoldsForBadUpgrade(pending, reason) {
  const candidates = sitesWithPluginVersion(pending.plugin_slug, pending.from_version, pending.site_id);
  for (const site of candidates) {
    createHold({
      siteId: site.id,
      pluginSlug: pending.plugin_slug,
      targetVersion: pending.to_version,
      reason,
    });
    await notifySite(
      site.id,
      `⏸ <b>${site.name}</b> — آپدیت ${pending.plugin_slug} به ${pending.to_version} توسط Fleet Learning موقتاً hold شد. دلیل: ${reason}`,
      "plugin"
    );
  }
  return candidates.length;
}

export async function evaluatePendingVerdicts() {
  for (const pending of duePendingVerdicts()) {
    try {
      const { verdict, notes } = judge(pending);
      const existing = getVerdict(pending.plugin_slug, pending.from_version, pending.to_version);
      const evidence = new Set(existing?.evidence_site_ids ? JSON.parse(existing.evidence_site_ids) : []);
      evidence.add(pending.site_id);

      recordVerdict({
        pluginSlug: pending.plugin_slug,
        fromVersion: pending.from_version,
        toVersion: pending.to_version,
        verdict,
        evidenceSiteIds: [...evidence],
        notes,
      });

      if (verdict === "bad" || verdict === "suspicious") {
        const originSite = getSiteById(pending.site_id);
        const reason = `${notes} (منبع: ${originSite?.name || pending.site_id})`;
        const held = await placeHoldsForBadUpgrade(pending, reason);
        logger.warn("fleet: bad/suspicious upgrade", {
          plugin: pending.plugin_slug,
          from: pending.from_version,
          to: pending.to_version,
          verdict,
          holdsPlaced: held,
        });
      }

      deletePendingVerdict(pending.id);
    } catch (err) {
      logger.error("fleet: evaluation failed", { id: pending.id, error: err.message });
      deletePendingVerdict(pending.id); // don't let a poison row block the queue forever
    }
  }
}

// Answer for the agent's pre-update check.
export function updateCheck(siteId, pluginSlug, fromVersion, toVersion) {
  const verdictRow = getVerdict(pluginSlug, fromVersion, toVersion);
  const hold = activeHold(siteId, pluginSlug, toVersion);
  return {
    verdict: verdictRow?.verdict || "unknown",
    hold: Boolean(hold),
    reason: hold?.reason || verdictRow?.notes || null,
    evidence_count: verdictRow?.evidence_site_ids ? JSON.parse(verdictRow.evidence_site_ids).length : 0,
  };
}
