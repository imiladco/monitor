import { env } from "../config.js";
import { getSetting, getTelegramTopic, isInMaintenanceWindow } from "../db.js";
import { sendWebhook } from "./webhook.js";
import { logger } from "../logger.js";

export async function sendTelegram(text, category = null) {
  // Fan out to a generic webhook if configured — independent of Telegram, so
  // it fires even when Telegram isn't set up. Fire-and-forget.
  sendWebhook({ text, category }).catch(() => {});

  const botToken = getSetting("telegram_bot_token", env.telegramBotToken);
  const groupId = getSetting("telegram_group_id", "");
  const fallbackChatId = getSetting("telegram_chat_id", env.telegramChatId);

  const chatId = groupId || fallbackChatId;
  const topic = groupId && category ? getTelegramTopic(category) : null;

  if (!botToken || !chatId) {
    logger.warn("telegram: bot token/chat id not set, skipping alert", { text });
    return { ok: false, error: "توکن یا chat id تنظیم نشده" };
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...(topic ? { message_thread_id: topic.thread_id } : {}),
      }),
    });
  } catch (err) {
    logger.error("telegram: request failed", { error: err.message });
    return { ok: false, error: err.message };
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    logger.error("telegram: send failed", { status: res.status, description: body.description });
    return { ok: false, error: body.description || `HTTP ${res.status}` };
  }

  return { ok: true };
}

// Wraps sendTelegram with a maintenance-window check so scheduled,
// planned work (deploys, updates) doesn't page anyone — the underlying
// event is still recorded in the timeline, just not pushed to Telegram.
export async function notifySite(siteId, text, category = null) {
  if (isInMaintenanceWindow(siteId)) {
    logger.info("telegram: suppressed by maintenance window", { siteId });
    return { ok: true, suppressed: true };
  }
  return sendTelegram(text, category);
}

export async function callTelegramApi(method, params) {
  const botToken = getSetting("telegram_bot_token", env.telegramBotToken);
  if (!botToken) return { ok: false, error: "توکن ربات تنظیم نشده" };

  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) {
    return { ok: false, error: data.description || `HTTP ${res.status}` };
  }
  return { ok: true, result: data.result };
}
