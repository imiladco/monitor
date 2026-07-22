import { Router } from "express";
import { getSetting, listPublicSites, latestCheck, checkHistory, uptimePercent } from "../db.js";

export const publicStatusRouter = Router();

publicStatusRouter.get("/public/status/:token", (req, res) => {
  const expected = getSetting("status_page_token", "");
  if (!expected || req.params.token !== expected) {
    return res.status(404).json({ error: "not found" });
  }

  const sites = listPublicSites().map((site) => {
    const uptime = latestCheck(site.id, "uptime");
    return {
      name: site.name,
      url: site.url,
      up: uptime ? Boolean(uptime.ok) : null,
      responseMs: uptime?.response_ms ?? null,
      lastCheckedAt: uptime?.checked_at ?? null,
      recentChecks: checkHistory(site.id, "uptime", 60)
        .reverse()
        .map((c) => ({ ok: Boolean(c.ok), checked_at: c.checked_at, response_ms: c.response_ms })),
      uptime7d: uptimePercent(site.id, 7),
      uptime30d: uptimePercent(site.id, 30),
      uptime90d: uptimePercent(site.id, 90),
    };
  });

  res.json({ sites });
});
