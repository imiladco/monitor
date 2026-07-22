import { env } from "../config.js";

export async function checkUptime(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.requestTimeoutMs);
  const start = Date.now();

  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "wp-site-monitor" },
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
