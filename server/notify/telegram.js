import { env } from "../config.js";
import { getSetting } from "../db.js";

export async function sendTelegram(text) {
  const botToken = getSetting("telegram_bot_token", env.telegramBotToken);
  const chatId = getSetting("telegram_chat_id", env.telegramChatId);

  if (!botToken || !chatId) {
    console.warn("[telegram] bot token / chat id not set (panel or .env), skipping alert:\n", text);
    return;
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[telegram] failed to send message: ${res.status} ${body}`);
  }
}
