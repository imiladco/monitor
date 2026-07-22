import { env } from "./config.js";

// Optional HTTPS enforcement for deployments with TLS terminated in front.
// Relies on Express's `trust proxy` so req.secure reflects X-Forwarded-Proto.
// A no-op unless forceHttps is on, so plain-HTTP setups are unaffected.
export function createHttpsEnforce(forceHttps) {
  return function httpsEnforce(req, res, next) {
    if (!forceHttps) return next();

    if (!req.secure) {
      // Only redirect safe, idempotent navigations; anything else gets a 403 so
      // a POST isn't silently replayed against the https origin.
      if (req.method === "GET" || req.method === "HEAD") {
        return res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
      }
      return res.status(403).json({ error: "HTTPS required" });
    }

    // 1 year, includeSubDomains. Set once we know the request arrived over TLS.
    res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    next();
  };
}

// Default instance wired to the app's config.
export const httpsEnforce = createHttpsEnforce(env.forceHttps);
