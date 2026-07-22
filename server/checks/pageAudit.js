import { chromium } from "playwright-core";

const CHROMIUM_PATH = process.env.CHROMIUM_PATH || undefined;

const PROXY_SERVER = process.env.HTTPS_PROXY || process.env.https_proxy;

async function getBrowser() {
  return chromium.launch({
    executablePath: CHROMIUM_PATH,
    args: ["--no-sandbox"],
    proxy: PROXY_SERVER ? { server: PROXY_SERVER, bypass: "localhost,127.0.0.1" } : undefined,
  });
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

    await page.addInitScript(() => {
      window.__vitals = { lcp: 0, cls: 0 };
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

    const screenshot = await page.screenshot({ type: "png" });

    return {
      ok: true,
      loadMs,
      lcpMs: Math.round(vitals.lcp) || null,
      cls: Number(vitals.cls?.toFixed(3)) || 0,
      ttfbMs: nav?.ttfb ?? null,
      screenshot,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    await browser.close();
  }
}
