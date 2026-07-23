import { getSetting } from "../db.js";
import { logger } from "../logger.js";

function stripHtml(s) {
  return String(s || "").replace(/<[^>]+>/g, "");
}

// Fans a notification out to a generic webhook (POST JSON) if one is
// configured. The URL is admin-set and trusted. Fire-and-forget: failures are
// logged, never thrown, so they can't disrupt the primary alert path.
export async function sendWebhook({ text, category = null, severity = null } = {}) {
  const url = getSetting("webhook_url", "");
  if (!url) return { ok: false, skipped: true };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "site-monitor",
        at: new Date().toISOString(),
        category,
        severity,
        text: stripHtml(text),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      logger.warn("webhook: non-2xx response", { status: res.status });
      return { ok: false, error: `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    logger.warn("webhook: delivery failed", { error: err.message });
    return { ok: false, error: err.message };
  } finally {
    clearTimeout(timeout);
  }
}
