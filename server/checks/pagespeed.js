import { logger } from "../logger.js";

const PSI_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

// Pull the performance score (0-100) and lab metrics out of a PageSpeed
// Insights (Lighthouse) response. Kept pure for testing.
export function parsePageSpeed(json, strategy = "mobile") {
  const lh = json?.lighthouseResult;
  if (!lh) return { ok: false, error: "no lighthouseResult in response" };
  const score = lh.categories?.performance?.score;
  const audit = (id) => {
    const v = lh.audits?.[id]?.numericValue;
    return typeof v === "number" ? Math.round(v) : null;
  };
  return {
    ok: true,
    strategy,
    score: typeof score === "number" ? Math.round(score * 100) : null,
    fcpMs: audit("first-contentful-paint"),
    lcpMs: audit("largest-contentful-paint"),
    tbtMs: audit("total-blocking-time"),
    siMs: audit("speed-index"),
    ttiMs: audit("interactive"),
    cls: (() => {
      const v = lh.audits?.["cumulative-layout-shift"]?.numericValue;
      return typeof v === "number" ? Number(v.toFixed(3)) : null;
    })(),
  };
}

// Calls the PSI API for one URL. PSI runs are slow (10-60s), so the timeout is
// generous. Returns the parsed result or { ok:false, error }.
export async function runPageSpeed(url, { strategy = "mobile", apiKey = "" } = {}) {
  const params = new URLSearchParams({ url, category: "performance", strategy });
  if (apiKey) params.set("key", apiKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 70000);
  try {
    const res = await fetch(`${PSI_ENDPOINT}?${params}`, { signal: controller.signal });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body?.error?.message || `HTTP ${res.status}` };
    }
    return parsePageSpeed(await res.json(), strategy);
  } catch (err) {
    logger.warn("pagespeed: request failed", { url, error: err.message });
    return { ok: false, error: err.name === "AbortError" ? "timeout" : err.message };
  } finally {
    clearTimeout(timeout);
  }
}
