import { env } from "./config.js";

// Single shared-password auth for the admin dashboard/API. Doesn't apply to
// /api/ingest* — sites authenticate those with their own per-site API key.
export function requireAdmin(req, res, next) {
  if (!env.adminPassword) {
    return res.status(500).json({ error: "ADMIN_PASSWORD is not set on the server" });
  }
  // Query-string fallback so <img src> tags (e.g. the screenshot preview)
  // can authenticate — they can't send custom headers like fetch() can.
  const provided = req.header("X-Admin-Password") || req.query.pw;
  if (provided !== env.adminPassword) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}
