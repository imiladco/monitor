import { Router } from "express";
import fs from "node:fs";
import {
  listSites,
  getSiteById,
  latestCheck,
  checkHistory,
  eventTimeline,
  latestSnapshot,
  latestScreenshot,
  vitalsHistory,
} from "../db.js";

export const apiRouter = Router();

apiRouter.get("/sites", (req, res) => {
  const sites = listSites().map((site) => {
    const uptime = latestCheck(site.id, "uptime");
    const ssl = latestCheck(site.id, "ssl");
    return {
      id: site.id,
      name: site.name,
      url: site.url,
      up: uptime ? Boolean(uptime.ok) : null,
      responseMs: uptime?.response_ms ?? null,
      sslDaysLeft: ssl?.ssl_days_left ?? null,
      lastCheckedAt: uptime?.checked_at ?? null,
    };
  });
  res.json(sites);
});

apiRouter.get("/sites/:id", (req, res) => {
  const site = getSiteById(req.params.id);
  if (!site) return res.status(404).json({ error: "not found" });
  const snapshot = latestSnapshot(site.id);
  const domain = latestCheck(site.id, "domain");
  const screenshot = latestScreenshot(site.id);
  res.json({
    id: site.id,
    name: site.name,
    url: site.url,
    checkoutUrl: site.checkout_url,
    apiKey: site.api_key,
    agent: snapshot?.data ?? null,
    agentLastSeen: snapshot?.captured_at ?? null,
    domainDaysLeft: domain?.ssl_days_left ?? null,
    screenshot: screenshot
      ? {
          capturedAt: screenshot.captured_at,
          diffPercent: screenshot.diff_percent,
          lcpMs: screenshot.lcp_ms,
          cls: screenshot.cls,
          ttfbMs: screenshot.ttfb_ms,
        }
      : null,
  });
});

apiRouter.get("/sites/:id/screenshot", (req, res) => {
  const shot = latestScreenshot(req.params.id);
  if (!shot || !fs.existsSync(shot.path)) return res.status(404).end();
  res.sendFile(shot.path);
});

apiRouter.get("/sites/:id/vitals", (req, res) => {
  res.json(vitalsHistory(req.params.id));
});

apiRouter.get("/sites/:id/checks", (req, res) => {
  const type = req.query.type === "ssl" ? "ssl" : "uptime";
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  res.json(checkHistory(req.params.id, type, limit).reverse());
});

apiRouter.get("/sites/:id/timeline", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 500);
  res.json(eventTimeline(req.params.id, limit));
});
