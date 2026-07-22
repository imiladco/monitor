import { Router } from "express";
import fs from "node:fs";
import crypto from "node:crypto";
import {
  listSites,
  getSiteById,
  createSite,
  updateSite,
  deleteSite,
  latestCheck,
  checkHistory,
  eventTimeline,
  latestSnapshot,
  latestScreenshot,
  vitalsHistory,
  getSetting,
  setSetting,
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

apiRouter.post("/sites", (req, res) => {
  const { name, url, checkoutUrl } = req.body || {};
  if (!name || !url) return res.status(400).json({ error: "name and url are required" });
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: "invalid url" });
  }
  const site = createSite({ name, url, checkoutUrl, apiKey: crypto.randomBytes(24).toString("hex") });
  res.status(201).json({ id: site.id });
});

apiRouter.put("/sites/:id", (req, res) => {
  const site = getSiteById(req.params.id);
  if (!site) return res.status(404).json({ error: "not found" });
  const { name, url, checkoutUrl } = req.body || {};
  if (!name || !url) return res.status(400).json({ error: "name and url are required" });
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: "invalid url" });
  }
  updateSite(site.id, { name, url, checkoutUrl });
  res.json({ ok: true });
});

apiRouter.delete("/sites/:id", (req, res) => {
  const site = getSiteById(req.params.id);
  if (!site) return res.status(404).json({ error: "not found" });
  deleteSite(site.id);
  res.json({ ok: true });
});

apiRouter.get("/settings", (req, res) => {
  res.json({
    telegramBotToken: getSetting("telegram_bot_token", "") ? "••••••••" : "",
    telegramChatId: getSetting("telegram_chat_id", ""),
    hasTelegramBotToken: Boolean(getSetting("telegram_bot_token", "")),
  });
});

apiRouter.put("/settings", (req, res) => {
  const { telegramBotToken, telegramChatId } = req.body || {};
  if (typeof telegramBotToken === "string" && telegramBotToken && telegramBotToken !== "••••••••") {
    setSetting("telegram_bot_token", telegramBotToken);
  }
  if (typeof telegramChatId === "string") {
    setSetting("telegram_chat_id", telegramChatId);
  }
  res.json({ ok: true });
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
