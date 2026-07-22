import { Router } from "express";
import { getSiteByApiKey, latestSnapshot, saveSnapshot, recordEvent } from "../db.js";
import { diffSnapshot } from "../diff.js";
import { notifySite } from "../notify/telegram.js";
import { categoryForEventType } from "../telegramCategories.js";

export const ingestRouter = Router();

ingestRouter.post("/ingest", async (req, res) => {
  const apiKey = req.header("X-Api-Key");
  if (!apiKey) return res.status(401).json({ error: "missing X-Api-Key header" });

  const site = getSiteByApiKey(apiKey);
  if (!site) return res.status(401).json({ error: "invalid api key" });

  const snapshot = req.body;
  if (!snapshot || typeof snapshot !== "object") {
    return res.status(400).json({ error: "invalid snapshot payload" });
  }

  const prev = latestSnapshot(site.id);
  const events = diffSnapshot(prev?.data, snapshot);
  saveSnapshot(site.id, snapshot);

  for (const event of events) {
    recordEvent(site.id, { ...event, source: "agent" });
    if (event.severity === "critical" || event.severity === "warning") {
      await notifySite(site.id, `⏱ <b>${site.name}</b> — ${event.title}`, categoryForEventType(event.type));
    }
  }

  res.json({ ok: true, eventsRecorded: events.length });
});

// For one-off, time-sensitive alerts the agent detects itself (e.g. brute-force
// login attempts) that shouldn't wait for the next full snapshot diff.
ingestRouter.post("/ingest/event", async (req, res) => {
  const apiKey = req.header("X-Api-Key");
  if (!apiKey) return res.status(401).json({ error: "missing X-Api-Key header" });

  const site = getSiteByApiKey(apiKey);
  if (!site) return res.status(401).json({ error: "invalid api key" });

  const { type, title, severity = "warning", detail } = req.body || {};
  if (!type || !title) return res.status(400).json({ error: "type and title are required" });

  recordEvent(site.id, { type, title, detail, severity, source: "agent" });
  if (severity === "critical" || severity === "warning") {
    await notifySite(site.id, `🛡 <b>${site.name}</b> — ${title}`, categoryForEventType(type));
  }

  res.json({ ok: true });
});
