import { env } from "../config.js";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,fa;q=0.8",
};

async function attempt(url) {
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
    const responseMs = Date.now() - start;
    return {
      up: res.status < 500,
      statusCode: res.status,
      responseMs,
      slow: responseMs > env.slowResponseMs,
      error: null,
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
export async function checkUptime(url) {
  const first = await attempt(url);
  if (first.up) return first;

  await new Promise((r) => setTimeout(r, 3000));
  return attempt(url);
}
