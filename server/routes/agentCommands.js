import { Router } from "express";
import { getSiteByApiKey, claimPendingCommands, completeCommand, getSetting } from "../db.js";
import { updateCheck } from "../fleet/index.js";

export const agentCommandsRouter = Router();

function authenticate(req, res) {
  const apiKey = req.header("X-Api-Key");
  if (!apiKey) {
    res.status(401).json({ error: "missing X-Api-Key header" });
    return null;
  }
  const site = getSiteByApiKey(apiKey);
  if (!site) {
    res.status(401).json({ error: "invalid api key" });
    return null;
  }
  return site;
}

// The agent polls this on its own schedule. Commands only ever reach an
// agent if remote actions are globally enabled — if they were disabled
// after a command was queued, it's returned as empty so nothing executes.
agentCommandsRouter.get("/agent/commands", (req, res) => {
  const site = authenticate(req, res);
  if (!site) return;
  if (getSetting("remote_actions_enabled", "0") !== "1") return res.json({ commands: [] });

  res.json({ commands: claimPendingCommands(site.id) });
});

// The agent calls this before showing/applying an update. If Fleet Learning
// has flagged this exact upgrade path as bad on another site, hold=true and
// the WP-admin banner explains why.
agentCommandsRouter.get("/update-check", (req, res) => {
  const site = authenticate(req, res);
  if (!site) return;
  const { plugin, from, to } = req.query;
  if (!plugin || !from || !to) {
    return res.status(400).json({ error: "plugin, from, and to query params are required" });
  }
  res.json(updateCheck(site.id, plugin, from, to));
});

agentCommandsRouter.post("/agent/commands/:id/result", (req, res) => {
  const site = authenticate(req, res);
  if (!site) return;

  const { status, result } = req.body || {};
  if (!["done", "failed"].includes(status)) return res.status(400).json({ error: "status must be done or failed" });

  const changed = completeCommand(Number(req.params.id), site.id, status, result);
  if (changed !== 1) {
    // not this site's command, or not currently running
    return res.status(404).json({ error: "command not found for this site" });
  }
  res.json({ ok: true });
});
