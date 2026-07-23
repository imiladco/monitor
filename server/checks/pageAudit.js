import { chromium } from "playwright-core";
import { isBlockedUrl } from "./urlGuard.js";

const CHROMIUM_PATH = process.env.CHROMIUM_PATH || undefined;

const PROXY_SERVER = process.env.HTTPS_PROXY || process.env.https_proxy;

// The OS-level sandbox is disabled by default because it can't run as root or
// in an unprivileged container. Set CHROMIUM_DISABLE_SANDBOX=false to re-enable
// it where the environment supports user namespaces — strongly recommended, as
// this browser renders untrusted remote pages. The egress guard below is
// defense-in-depth for the common (no-sandbox) case.
const DISABLE_SANDBOX = process.env.CHROMIUM_DISABLE_SANDBOX !== "false";

async function getBrowser() {
  const args = ["--disable-dev-shm-usage", "--disable-gpu", "--disable-extensions", "--no-first-run"];
  if (DISABLE_SANDBOX) args.push("--no-sandbox", "--disable-setuid-sandbox");
  return chromium.launch({
    executablePath: CHROMIUM_PATH,
    args,
    proxy: PROXY_SERVER ? { server: PROXY_SERVER, bypass: "localhost,127.0.0.1" } : undefined,
  });
}

export const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
};

// Captures a full-page screenshot of an arbitrary URL at a named viewport,
// with the same SSRF egress guard as auditPage. Returns a PNG buffer or
// { error }.
export async function captureUrl(url, viewport = "desktop", { delayMs = 1500 } = {}) {
  const size = VIEWPORTS[viewport] || VIEWPORTS.desktop;
  const browser = await getBrowser();
  try {
    const page = await browser.newPage({ viewport: size, isMobile: viewport === "mobile" });
    await page.route("**/*", async (route) => {
      if (await isBlockedUrl(route.request().url())) return route.abort("blockedbyclient");
      return route.continue();
    });
    await page.goto(url, { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(delayMs);
    const buffer = await page.screenshot({ type: "png", fullPage: true });
    return { ok: true, buffer };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    await browser.close();
  }
}

/**
 * Loads a page once and collects both a screenshot (for visual-regression
 * diffing) and Core Web Vitals-ish metrics (LCP/CLS/TTFB), avoiding the
 * cost of a full Lighthouse run for periodic synthetic checks.
 */
export async function auditPage(url) {
  const browser = await getBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    // Block the browser from reaching internal/private addresses (SSRF guard).
    // Applies to the main navigation and every sub-resource/redirect.
    await page.route("**/*", async (route) => {
      if (await isBlockedUrl(route.request().url())) {
        return route.abort("blockedbyclient");
      }
      return route.continue();
    });

    await page.addInitScript(() => {
      window.__vitals = { lcp: 0, cls: 0, fcp: 0, tbt: 0 };
      try {
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const last = entries[entries.length - 1];
          if (last) window.__vitals.lcp = last.renderTime || last.loadTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) window.__vitals.cls += entry.value;
          }
        }).observe({ type: "layout-shift", buffered: true });
        new PerformanceObserver((list) => {
          const fcp = list.getEntries().find((e) => e.name === "first-contentful-paint");
          if (fcp) window.__vitals.fcp = fcp.startTime;
        }).observe({ type: "paint", buffered: true });
        // Total Blocking Time (lab): sum of long-task time over 50ms.
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            window.__vitals.tbt += Math.max(0, entry.duration - 50);
          }
        }).observe({ type: "longtask", buffered: true });
      } catch {
        // PerformanceObserver entry types not supported; metrics stay at 0
      }
    });

    const start = Date.now();
    await page.goto(url, { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(2000);
    const loadMs = Date.now() - start;

    const vitals = await page.evaluate(() => window.__vitals);
    const nav = await page.evaluate(() => {
      const [entry] = performance.getEntriesByType("navigation");
      return entry ? { ttfb: Math.round(entry.responseStart) } : null;
    });
    // Resource waterfall summary: request count and transferred bytes by kind.
    const resources = await page.evaluate(() => {
      const entries = performance.getEntriesByType("resource");
      const kindOf = (e) => {
        const t = e.initiatorType;
        if (t === "script") return "js";
        if (t === "link" || t === "css") return "css";
        if (t === "img" || t === "image") return "img";
        return "other";
      };
      const sum = { count: entries.length, bytes: 0, js: 0, css: 0, img: 0, other: 0 };
      for (const e of entries) {
        const size = e.transferSize || e.encodedBodySize || 0;
        sum.bytes += size;
        sum[kindOf(e)] += size;
      }
      return sum;
    });

    const screenshot = await page.screenshot({ type: "png" });

    return {
      ok: true,
      loadMs,
      lcpMs: Math.round(vitals.lcp) || null,
      cls: Number(vitals.cls?.toFixed(3)) || 0,
      fcpMs: Math.round(vitals.fcp) || null,
      tbtMs: Math.round(vitals.tbt) || null,
      ttfbMs: nav?.ttfb ?? null,
      resources,
      screenshot,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    await browser.close();
  }
}
