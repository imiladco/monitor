import { Router } from "express";
import fs from "node:fs";
import crypto from "node:crypto";
import QRCode from "qrcode";
import { sendTelegram, callTelegramApi } from "../notify/telegram.js";
import { CATEGORIES } from "../telegramCategories.js";
import { generateSecret, otpauthUrl, verifyToken } from "../totp.js";
import {
  listSites,
  getSiteById,
  createSite,
  updateSite,
  deleteSite,
  setSitePaused,
  setSitePublic,
  uptimePercent,
  latestCheck,
  checkHistory,
  eventTimeline,
  latestSnapshot,
  latestScreenshot,
  vitalsHistory,
  getSetting,
  setSetting,
  listTelegramTopics,
  setTelegramTopic,
  createMaintenanceWindow,
  listMaintenanceWindows,
  deleteMaintenanceWindow,
  isInMaintenanceWindow,
  createPortCheck,
  listPortChecks,
  deletePortCheck,
  downtimeIncidents,
  createCommand,
  listCommands,
  upsertVulnerability,
  deleteVulnerability,
  resolveSiteVulnerability,
  activeSiteVulnerabilities,
  recentBadVerdicts,
  listSiteHolds,
  releaseHold,
} from "../db.js";
import { fleetVulnerabilities, runVulnerabilityScan } from "../vuln/index.js";

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
      recentChecks: checkHistory(site.id, "uptime", 30).reverse(),
      paused: Boolean(site.paused),
      public: Boolean(site.public),
      client: site.client,
    };
  });
  res.json(sites);
});

apiRouter.post("/sites", (req, res) => {
  const { name, url, checkoutUrl, keyword, keywordMode, client } = req.body || {};
  if (!name || !url) return res.status(400).json({ error: "name and url are required" });
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: "invalid url" });
  }
  const site = createSite({
    name,
    url,
    checkoutUrl,
    keyword,
    keywordMode,
    client,
    apiKey: crypto.randomBytes(24).toString("hex"),
  });
  res.status(201).json({ id: site.id });
});

apiRouter.put("/sites/:id", (req, res) => {
  const site = getSiteById(req.params.id);
  if (!site) return res.status(404).json({ error: "not found" });
  const { name, url, checkoutUrl, keyword, keywordMode, client } = req.body || {};
  if (!name || !url) return res.status(400).json({ error: "name and url are required" });
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: "invalid url" });
  }
  updateSite(site.id, { name, url, checkoutUrl, keyword, keywordMode, client });
  res.json({ ok: true });
});

apiRouter.delete("/sites/:id", (req, res) => {
  const site = getSiteById(req.params.id);
  if (!site) return res.status(404).json({ error: "not found" });
  deleteSite(site.id);
  res.json({ ok: true });
});

apiRouter.patch("/sites/:id/pause", (req, res) => {
  const site = getSiteById(req.params.id);
  if (!site) return res.status(404).json({ error: "not found" });
  setSitePaused(site.id, Boolean(req.body?.paused));
  res.json({ ok: true });
});

apiRouter.patch("/sites/:id/public", (req, res) => {
  const site = getSiteById(req.params.id);
  if (!site) return res.status(404).json({ error: "not found" });
  setSitePublic(site.id, Boolean(req.body?.public));
  res.json({ ok: true });
});

apiRouter.get("/settings/remote-actions", (req, res) => {
  res.json({ enabled: getSetting("remote_actions_enabled", "0") === "1" });
});

apiRouter.put("/settings/remote-actions", (req, res) => {
  setSetting("remote_actions_enabled", req.body?.enabled ? "1" : "0");
  res.json({ ok: true });
});

const ALLOWED_COMMAND_TYPES = new Set(["update_plugin", "update_theme", "update_core", "clear_cache"]);

apiRouter.get("/sites/:id/commands", (req, res) => {
  const site = getSiteById(req.params.id);
  if (!site) return res.status(404).json({ error: "not found" });
  res.json(listCommands(site.id));
});

apiRouter.post("/sites/:id/commands", (req, res) => {
  if (getSetting("remote_actions_enabled", "0") !== "1") {
    return res.status(403).json({ error: "اقدامات از راه دور غیرفعاله — از تنظیمات فعالش کن" });
  }
  const site = getSiteById(req.params.id);
  if (!site) return res.status(404).json({ error: "not found" });

  const { type, params } = req.body || {};
  if (!ALLOWED_COMMAND_TYPES.has(type)) return res.status(400).json({ error: "نوع دستور نامعتبر" });

  const command = createCommand({ siteId: site.id, type, params });
  res.status(201).json(command);
});

apiRouter.get("/settings", (req, res) => {
  res.json({
    telegramBotToken: getSetting("telegram_bot_token", "") ? "••••••••" : "",
    telegramChatId: getSetting("telegram_chat_id", ""),
    telegramGroupId: getSetting("telegram_group_id", ""),
    hasTelegramBotToken: Boolean(getSetting("telegram_bot_token", "")),
  });
});

apiRouter.put("/settings", (req, res) => {
  const { telegramBotToken, telegramChatId, telegramGroupId } = req.body || {};
  if (typeof telegramBotToken === "string" && telegramBotToken && telegramBotToken !== "••••••••") {
    setSetting("telegram_bot_token", telegramBotToken);
  }
  if (typeof telegramChatId === "string") {
    setSetting("telegram_chat_id", telegramChatId);
  }
  if (typeof telegramGroupId === "string") {
    setSetting("telegram_group_id", telegramGroupId);
  }
  res.json({ ok: true });
});

apiRouter.get("/settings/branding", (req, res) => {
  res.json({
    name: getSetting("brand_name", ""),
    logoUrl: getSetting("brand_logo_url", ""),
  });
});

apiRouter.put("/settings/branding", (req, res) => {
  const { name, logoUrl } = req.body || {};
  if (typeof name === "string") setSetting("brand_name", name);
  if (typeof logoUrl === "string") setSetting("brand_logo_url", logoUrl);
  res.json({ ok: true });
});

apiRouter.post("/settings/test-telegram", async (req, res) => {
  const result = await sendTelegram("🔔 پیام تست از Site Monitor — اتصال تلگرام درست کار می‌کنه.");
  res.json(result);
});

apiRouter.get("/settings/2fa", (req, res) => {
  res.json({ enabled: getSetting("totp_enabled", "") === "1" });
});

// Generates a new secret and returns a scannable QR code, but doesn't
// enable 2FA yet — that only happens once /confirm verifies the user
// actually has it set up correctly in their authenticator app.
apiRouter.post("/settings/2fa/setup", async (req, res) => {
  const secret = generateSecret();
  setSetting("totp_secret_pending", secret);
  const url = otpauthUrl(secret, { label: "admin", issuer: "Site Monitor" });
  const qrDataUrl = await QRCode.toDataURL(url);
  res.json({ secret, qrDataUrl });
});

apiRouter.post("/settings/2fa/confirm", (req, res) => {
  const pending = getSetting("totp_secret_pending", "");
  if (!pending) return res.status(400).json({ error: "اول باید Setup رو بزنی" });
  if (!verifyToken(pending, req.body?.code)) {
    return res.status(400).json({ error: "کد اشتباهه" });
  }
  setSetting("totp_secret", pending);
  setSetting("totp_enabled", "1");
  setSetting("totp_secret_pending", "");
  res.json({ ok: true });
});

apiRouter.post("/settings/2fa/disable", (req, res) => {
  const secret = getSetting("totp_secret", "");
  if (getSetting("totp_enabled", "") !== "1") return res.json({ ok: true });
  if (!secret || !verifyToken(secret, req.body?.code)) {
    return res.status(400).json({ error: "برای غیرفعال کردن، کد فعلی اپ Authenticator رو وارد کن" });
  }
  setSetting("totp_enabled", "0");
  setSetting("totp_secret", "");
  res.json({ ok: true });
});

// Finds the most recent group/supergroup chat the bot has seen a message in
// (getUpdates only surfaces chats it has interacted with — the user must
// have added the bot and sent at least one message in the group first).
apiRouter.post("/settings/telegram-discover-group", async (req, res) => {
  const result = await callTelegramApi("getUpdates", { limit: 100 });
  if (!result.ok) return res.json(result);

  const groupUpdate = [...result.result]
    .reverse()
    .find((u) => ["group", "supergroup"].includes(u.message?.chat?.type));

  if (!groupUpdate) {
    return res.json({
      ok: false,
      error: "هیچ گروهی پیدا نشد — مطمئن شو ربات رو به گروه اضافه کردی و حداقل یه پیام توی گروه فرستادی",
    });
  }

  const chat = groupUpdate.message.chat;
  res.json({ ok: true, chatId: String(chat.id), title: chat.title });
});

apiRouter.get("/settings/telegram-topics", (req, res) => {
  const existing = new Map(listTelegramTopics().map((t) => [t.category, t]));
  res.json(
    CATEGORIES.map((c) => ({
      ...c,
      threadId: existing.get(c.key)?.thread_id ?? null,
      name: existing.get(c.key)?.name ?? null,
    }))
  );
});

// Auto-creates a forum topic per category in the configured group. Requires
// the bot to be an admin with "Manage Topics" rights and the group to have
// Topics enabled. Skips categories that already have a topic.
apiRouter.post("/settings/telegram-topics/setup", async (req, res) => {
  const groupId = getSetting("telegram_group_id", "");
  if (!groupId) return res.status(400).json({ error: "اول گروه رو تنظیم کن" });

  const existing = new Map(listTelegramTopics().map((t) => [t.category, t]));
  const results = [];

  for (const category of CATEGORIES) {
    if (existing.has(category.key)) {
      results.push({ key: category.key, ok: true, skipped: true });
      continue;
    }
    const created = await callTelegramApi("createForumTopic", {
      chat_id: groupId,
      name: `${category.icon} ${category.label}`,
    });
    if (created.ok) {
      setTelegramTopic(category.key, created.result.message_thread_id, category.label);
      results.push({ key: category.key, ok: true, threadId: created.result.message_thread_id });
    } else {
      results.push({ key: category.key, ok: false, error: created.error });
    }
  }

  res.json({ results });
});

apiRouter.put("/settings/telegram-topics/:category", (req, res) => {
  const category = CATEGORIES.find((c) => c.key === req.params.category);
  if (!category) return res.status(404).json({ error: "دسته‌بندی نامعتبر" });

  const threadId = Number(req.body?.threadId);
  if (!Number.isFinite(threadId)) return res.status(400).json({ error: "threadId نامعتبر" });

  setTelegramTopic(category.key, threadId, category.label);
  res.json({ ok: true });
});

apiRouter.post("/settings/telegram-topics/:category/test", async (req, res) => {
  const category = CATEGORIES.find((c) => c.key === req.params.category);
  if (!category) return res.status(404).json({ error: "دسته‌بندی نامعتبر" });

  const result = await sendTelegram(`${category.icon} پیام تست برای دسته‌ی «${category.label}»`, category.key);
  res.json(result);
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
    keyword: site.keyword,
    keywordMode: site.keyword_mode,
    paused: Boolean(site.paused),
    public: Boolean(site.public),
    client: site.client,
    apiKey: site.api_key,
    agent: snapshot?.data ?? null,
    agentLastSeen: snapshot?.captured_at ?? null,
    domainDaysLeft: domain?.ssl_days_left ?? null,
    uptime7d: uptimePercent(site.id, 7),
    uptime30d: uptimePercent(site.id, 30),
    uptime90d: uptimePercent(site.id, 90),
    inMaintenance: isInMaintenanceWindow(site.id),
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

// site_id = null means "applies to all sites"
apiRouter.get("/sites/:id/maintenance-windows", (req, res) => {
  res.json(listMaintenanceWindows(Number(req.params.id)));
});

apiRouter.post("/maintenance-windows", (req, res) => {
  const { siteId, note, startsAt, endsAt } = req.body || {};
  if (!startsAt || !endsAt) return res.status(400).json({ error: "startsAt and endsAt are required" });
  if (new Date(endsAt) <= new Date(startsAt)) return res.status(400).json({ error: "endsAt must be after startsAt" });
  const window = createMaintenanceWindow({ siteId: siteId || null, note, startsAt, endsAt });
  res.status(201).json(window);
});

apiRouter.delete("/maintenance-windows/:id", (req, res) => {
  deleteMaintenanceWindow(req.params.id);
  res.json({ ok: true });
});

apiRouter.get("/sites/:id/port-checks", (req, res) => {
  const checks = listPortChecks(req.params.id).map((pc) => {
    const check = latestCheck(pc.site_id, `port:${pc.id}`);
    return { ...pc, up: check ? Boolean(check.ok) : null, lastCheckedAt: check?.checked_at ?? null };
  });
  res.json(checks);
});

apiRouter.post("/sites/:id/port-checks", (req, res) => {
  const site = getSiteById(req.params.id);
  if (!site) return res.status(404).json({ error: "not found" });
  const { label, host, port } = req.body || {};
  const portNum = Number(port);
  if (!label || !host || !Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
    return res.status(400).json({ error: "label, host, and a valid port (1-65535) are required" });
  }
  const check = createPortCheck({ siteId: site.id, label, host, port: portNum });
  res.status(201).json(check);
});

apiRouter.delete("/port-checks/:id", (req, res) => {
  deletePortCheck(req.params.id);
  res.json({ ok: true });
});

apiRouter.get("/sites/:id/sla-report", (req, res) => {
  const site = getSiteById(req.params.id);
  if (!site) return res.status(404).json({ error: "not found" });
  const days = Math.min(Number(req.query.days) || 30, 365);
  const incidents = downtimeIncidents(site.id, days);
  const uptime = uptimePercent(site.id, days);

  const rows = [
    ["site", site.name],
    ["period_days", days],
    ["uptime_percent", uptime ?? ""],
    [],
    ["started_at", "ended_at", "duration_minutes", "reason"],
    ...incidents.map((i) => {
      const durationMin = i.endedAt
        ? Math.round((new Date(`${i.endedAt}Z`) - new Date(`${i.startedAt}Z`)) / 60000)
        : "";
      return [i.startedAt, i.endedAt || "در حال وقوع", durationMin, i.reason];
    }),
  ];
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${site.name}-sla-${days}d.csv"`);
  res.send("﻿" + csv); // BOM so Excel opens UTF-8/Persian text correctly
});

function csvEscape(value) {
  const str = String(value ?? "");
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/* --- Vulnerabilities (v2 phase A) --- */

apiRouter.get("/vulnerabilities", (req, res) => {
  res.json(fleetVulnerabilities());
});

apiRouter.get("/sites/:id/vulnerabilities", (req, res) => {
  const site = getSiteById(req.params.id);
  if (!site) return res.status(404).json({ error: "not found" });
  res.json(activeSiteVulnerabilities(site.id));
});

// Manual entry — the competitive-differentiator path for Iranian-market
// plugins Patchstack/Wordfence don't cover. Stored as source='manual'.
apiRouter.post("/vulnerabilities", (req, res) => {
  const { pluginSlug, affectedVersions, fixedIn, severity, title, description, cveId, referenceUrl } = req.body || {};
  if (!pluginSlug || !affectedVersions || !title) {
    return res.status(400).json({ error: "pluginSlug، affectedVersions و title لازمن" });
  }
  const vuln = upsertVulnerability({
    source: "manual",
    source_id: `manual-${crypto.randomBytes(8).toString("hex")}`,
    plugin_slug: pluginSlug,
    affected_versions: affectedVersions,
    fixed_in: fixedIn || null,
    severity: severity || "medium",
    title,
    description: description || null,
    cve_id: cveId || null,
    reference_url: referenceUrl || null,
  });
  res.status(201).json(vuln);
});

apiRouter.delete("/vulnerabilities/:id", (req, res) => {
  deleteVulnerability(req.params.id);
  res.json({ ok: true });
});

// Mark a specific site's finding resolved (false positive). Takes the
// vulnerability id; scoped to the site.
apiRouter.post("/sites/:id/vulnerabilities/:vulnId/resolve", (req, res) => {
  const site = getSiteById(req.params.id);
  if (!site) return res.status(404).json({ error: "not found" });
  resolveSiteVulnerability(site.id, Number(req.params.vulnId));
  res.json({ ok: true });
});

apiRouter.post("/vulnerabilities/scan", async (req, res) => {
  await runVulnerabilityScan();
  res.json({ ok: true });
});

/* --- Fleet Learning (v2 phase B) --- */

apiRouter.get("/fleet-alerts", (req, res) => {
  res.json(recentBadVerdicts());
});

apiRouter.get("/sites/:id/holds", (req, res) => {
  const site = getSiteById(req.params.id);
  if (!site) return res.status(404).json({ error: "not found" });
  res.json(listSiteHolds(site.id));
});

apiRouter.post("/holds/:id/release", (req, res) => {
  releaseHold(Number(req.params.id), "admin");
  res.json({ ok: true });
});

function ensureStatusPageToken() {
  let token = getSetting("status_page_token", "");
  if (!token) {
    token = crypto.randomBytes(16).toString("hex");
    setSetting("status_page_token", token);
  }
  return token;
}

apiRouter.get("/settings/status-page", (req, res) => {
  res.json({ token: ensureStatusPageToken() });
});

apiRouter.post("/settings/status-page/regenerate", (req, res) => {
  const token = crypto.randomBytes(16).toString("hex");
  setSetting("status_page_token", token);
  res.json({ token });
});
