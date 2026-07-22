import { Router } from "express";
import { getSiteByApiKey, latestSnapshot, saveSnapshot, recordEvent } from "../db.js";
import { diffSnapshot } from "../diff.js";
import { sendTelegram } from "../notify/telegram.js";

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
      await sendTelegram(`⏱ <b>${site.name}</b> — ${event.title}`);
    }
  }

  res.json({ ok: true, eventsRecorded: events.length });
});
