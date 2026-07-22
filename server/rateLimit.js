// Tiny in-memory fixed-window rate limiter — no dependency. State is
// per-process, which is fine for this single-instance deployment. Keyed by
// client IP. With skipSuccessfulRequests, only failed attempts count toward
// the limit, so a legitimate admin retrying a typo'd password isn't locked out
// but a brute-force sweep is.
export function createRateLimiter({ windowMs, max, message, skipSuccessfulRequests = false } = {}) {
  const hits = new Map(); // key -> { count, resetAt }

  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, windowMs);
  timer.unref?.();

  return function rateLimit(req, res, next) {
    const now = Date.now();
    const key = req.ip || req.socket?.remoteAddress || "unknown";

    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }

    if (entry.count >= max) {
      res.set("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ error: message || "too many requests, try again later" });
    }

    entry.count += 1;

    if (skipSuccessfulRequests) {
      res.on("finish", () => {
        if (res.statusCode < 400 && entry.count > 0) entry.count -= 1;
      });
    }

    next();
  };
}
