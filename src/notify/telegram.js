import { env } from "../config.js";

export async function sendTelegram(text) {
  if (!env.telegramBotToken || !env.telegramChatId) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set, skipping alert:\n", text);
    return;
  }

  const url = `https://api.telegram.org/bot${env.telegramBotToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: env.telegramChatId,
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
