import "dotenv/config";

export const env = {
  port: Number(process.env.PORT || 4000),
  adminPassword: process.env.ADMIN_PASSWORD,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramChatId: process.env.TELEGRAM_CHAT_ID,
  checkIntervalMinutes: Number(process.env.CHECK_INTERVAL_MINUTES || 5),
  dailySummaryHour: Number(process.env.DAILY_SUMMARY_HOUR ?? 9),
  sslWarnDays: Number(process.env.SSL_WARN_DAYS || 14),
  slowResponseMs: Number(process.env.SLOW_RESPONSE_MS || 3000),
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 10000),
  dbGrowthWarnPercent: Number(process.env.DB_GROWTH_WARN_PERCENT || 20),
  deepCheckHour: Number(process.env.DEEP_CHECK_HOUR ?? 3),
  visualDiffWarnPercent: Number(process.env.VISUAL_DIFF_WARN_PERCENT || 15),
  lcpWarnMs: Number(process.env.LCP_WARN_MS || 4000),
  domainWarnDays: Number(process.env.DOMAIN_WARN_DAYS || 30),
  backupHour: Number(process.env.BACKUP_HOUR ?? 4),
  vulnSyncEnabled: process.env.VULN_SYNC_ENABLED !== "false",
  vulnSyncHour: Number(process.env.VULN_SYNC_HOUR ?? 5),
  vulnAlertMinSeverity: process.env.VULN_ALERT_MIN_SEVERITY || "high",
  externalVulnFeedUrl: process.env.EXTERNAL_VULN_FEED_URL || "",
  externalVulnFeedKey: process.env.EXTERNAL_VULN_FEED_KEY || "",
};
