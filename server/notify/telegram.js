import { env } from "../config.js";
import { getSetting } from "../db.js";

export async function sendTelegram(text) {
  const botToken = getSetting("telegram_bot_token", env.telegramBotToken);
  const chatId = getSetting("telegram_chat_id", env.telegramChatId);

  if (!botToken || !chatId) {
    console.warn("[telegram] bot token / chat id not set (panel or .env), skipping alert:\n", text);
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
      }),
    });
  } catch (err) {
    console.error(`[telegram] request failed: ${err.message}`);
    return { ok: false, error: err.message };
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error(`[telegram] failed to send message: ${res.status} ${body.description || ""}`);
    return { ok: false, error: body.description || `HTTP ${res.status}` };
  }

  return { ok: true };
}
