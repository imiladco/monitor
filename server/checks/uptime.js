import { env } from "../config.js";
import { matchStatus, getJsonPath } from "./httpAssert.js";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,fa;q=0.8",
};

function keywordFails(text, keyword, mode, isRegex) {
  let found;
  if (isRegex) {
    try {
      found = new RegExp(keyword).test(text);
    } catch {
      return null; // invalid regex — don't fail the check on a config error
    }
  } else {
    found = text.includes(keyword);
  }
  const ok = mode === "absent" ? !found : found;
  if (ok) return null;
  return mode === "absent" ? `کلیدواژه‌ی ممنوعه پیدا شد: "${keyword}"` : `کلیدواژه پیدا نشد: "${keyword}"`;
}

async function attempt(url, opts = {}) {
  const {
    keyword,
    keywordMode = "present",
    keywordIsRegex = false,
    method = "GET",
    headers = {},
    body = null,
    basicAuth = null,
    expectedStatus = null,
    jsonAssert = null,
    maxResponseMs = null,
  } = opts;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.requestTimeoutMs);
  const start = Date.now();

  try {
    const reqHeaders = { ...BROWSER_HEADERS, ...headers };
    if (basicAuth?.user) {
      reqHeaders.Authorization = "Basic " + Buffer.from(`${basicAuth.user}:${basicAuth.pass || ""}`).toString("base64");
    }
    const sendsBody = method !== "GET" && method !== "HEAD" && body != null;

    const res = await fetch(url, {
      method,
      redirect: "follow",
      signal: controller.signal,
      headers: reqHeaders,
      body: sendsBody ? body : undefined,
    });

    const needBody = (keyword || jsonAssert?.path) && method !== "HEAD" && res.status < 500;
    const text = needBody ? await res.text() : null;
    const responseMs = Date.now() - start;

    let up;
    let error = null;
    if (expectedStatus) {
      up = matchStatus(res.status, expectedStatus);
      if (!up) error = `کد وضعیت ${res.status} خارج از محدوده‌ی انتظار (${expectedStatus})`;
    } else {
      up = res.status < 500;
      if (!up) error = `HTTP ${res.status}`;
    }

    if (up && keyword && text != null) {
      const kwError = keywordFails(text, keyword, keywordMode, keywordIsRegex);
      if (kwError) {
        up = false;
        error = kwError;
      }
    }

    if (up && jsonAssert?.path && text != null) {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
      const { found } = getJsonPath(parsed, jsonAssert.path);
      const wantAbsent = jsonAssert.mode === "absent";
      if (wantAbsent ? found : !found) {
        up = false;
        error = wantAbsent
          ? `مسیر JSON نباید وجود داشته باشه: ${jsonAssert.path}`
          : `مسیر JSON پیدا نشد: ${jsonAssert.path}`;
      }
    }

    if (up && maxResponseMs && responseMs > maxResponseMs) {
      up = false;
      error = `زمان پاسخ ${responseMs}ms بیش از حد مجاز ${maxResponseMs}ms`;
    }

    return {
      up,
      statusCode: res.status,
      responseMs,
      slow: responseMs > (maxResponseMs || env.slowResponseMs),
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
