import { Router } from "express";
import fs from "node:fs";
import crypto from "node:crypto";
import { sendTelegram, callTelegramApi } from "../notify/telegram.js";
import { CATEGORIES } from "../telegramCategories.js";
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
      recentChecks: checkHistory(site.id, "uptime", 30).reverse(),
      paused: Boolean(site.paused),
      public: Boolean(site.public),
    };
  });
  res.json(sites);
});

apiRouter.post("/sites", (req, res) => {
  const { name, url, checkoutUrl, keyword, keywordMode } = req.body || {};
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
    apiKey: crypto.randomBytes(24).toString("hex"),
  });
  res.status(201).json({ id: site.id });
});

apiRouter.put("/sites/:id", (req, res) => {
  const site = getSiteById(req.params.id);
  if (!site) return res.status(404).json({ error: "not found" });
  const { name, url, checkoutUrl, keyword, keywordMode } = req.body || {};
  if (!name || !url) return res.status(400).json({ error: "name and url are required" });
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: "invalid url" });
  }
  updateSite(site.id, { name, url, checkoutUrl, keyword, keywordMode });
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

apiRouter.post("/settings/test-telegram", async (req, res) => {
  const result = await sendTelegram("🔔 پیام تست از Site Monitor — اتصال تلگرام درست کار می‌کنه.");
  res.json(result);
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
    apiKey: site.api_key,
    agent: snapshot?.data ?? null,
    agentLastSeen: snapshot?.captured_at ?? null,
    domainDaysLeft: domain?.ssl_days_left ?? null,
    uptime7d: uptimePercent(site.id, 7),
    uptime30d: uptimePercent(site.id, 30),
    uptime90d: uptimePercent(site.id, 90),
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
