import fs from "node:fs";
import path from "node:path";
import "dotenv/config";

const SITES_PATH = path.resolve("config/sites.json");

export function loadSites() {
  if (!fs.existsSync(SITES_PATH)) {
    throw new Error(
      `config/sites.json not found. Copy config/sites.example.json to config/sites.json and fill it in.`
    );
  }
  return JSON.parse(fs.readFileSync(SITES_PATH, "utf8"));
}

export const env = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramChatId: process.env.TELEGRAM_CHAT_ID,
  checkIntervalMinutes: Number(process.env.CHECK_INTERVAL_MINUTES || 5),
  dailySummaryHour: Number(process.env.DAILY_SUMMARY_HOUR ?? 9),
  sslWarnDays: Number(process.env.SSL_WARN_DAYS || 14),
  slowResponseMs: Number(process.env.SLOW_RESPONSE_MS || 3000),
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 10000),
};
