import "dotenv/config";

export const env = {
  port: Number(process.env.PORT || 4000),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramChatId: process.env.TELEGRAM_CHAT_ID,
  checkIntervalMinutes: Number(process.env.CHECK_INTERVAL_MINUTES || 5),
  dailySummaryHour: Number(process.env.DAILY_SUMMARY_HOUR ?? 9),
  sslWarnDays: Number(process.env.SSL_WARN_DAYS || 14),
  slowResponseMs: Number(process.env.SLOW_RESPONSE_MS || 3000),
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 10000),
  dbGrowthWarnPercent: Number(process.env.DB_GROWTH_WARN_PERCENT || 20),
};
