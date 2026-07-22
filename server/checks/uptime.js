import { env } from "../config.js";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,fa;q=0.8",
};

async function attempt(url, { keyword, keywordMode = "present" } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.requestTimeoutMs);
  const start = Date.now();

  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: BROWSER_HEADERS,
    });

    let body = null;
    if (keyword && res.status < 500) {
      body = await res.text();
    }
    const responseMs = Date.now() - start;

    let up = res.status < 500;
    let error = null;
    if (up && keyword) {
      const found = body.includes(keyword);
      const keywordOk = keywordMode === "absent" ? !found : found;
      if (!keywordOk) {
        up = false;
        error =
          keywordMode === "absent"
            ? `کلیدواژه‌ی ممنوعه پیدا شد: "${keyword}"`
            : `کلیدواژه پیدا نشد: "${keyword}"`;
      }
    }

    return {
      up,
      statusCode: res.status,
      responseMs,
      slow: responseMs > env.slowResponseMs,
      error,
    };
  } catch (err) {
    return {
      up: false,
      statusCode: null,
      responseMs: Date.now() - start,
      slow: false,
      error: err.name === "AbortError" ? "timeout" : err.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// Many WordPress security plugins/WAFs (Wordfence, Cloudflare, iThemes...)
// occasionally challenge or rate-limit a single request from a non-browser
// client. A lone failure is retried once before being reported as down, so
// a real browser-facing outage is what actually triggers an alert.
export async function checkUptime(url, options) {
  const first = await attempt(url, options);
  if (first.up) return first;

  await new Promise((r) => setTimeout(r, 3000));
  return attempt(url, options);
}
