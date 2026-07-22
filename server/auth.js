import { env } from "./config.js";
import { getValidSession } from "./db.js";
import { readCookie, SESSION_COOKIE } from "./session.js";

// Session-cookie auth for the admin dashboard/API. The admin password is only
// ever sent once, to /api/auth/login; from there on the browser holds an
// httpOnly session cookie and never re-transmits the password. This also makes
// TOTP meaningful — without a session, /login could verify 2FA but every other
// request just re-sent the password, bypassing it entirely.
//
// Doesn't apply to /api/ingest* (per-site API key), the public status page
// (URL token), or MCP endpoints (bearer key) — those authenticate themselves.
export function requireAdmin(req, res, next) {
  if (!env.adminPassword) {
    return res.status(500).json({ error: "ADMIN_PASSWORD is not set on the server" });
  }
  const token = readCookie(req, SESSION_COOKIE);
  if (!getValidSession(token)) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}
