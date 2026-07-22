import "dotenv/config";

export const env = {
  port: Number(process.env.PORT || 4000),
  adminPassword: process.env.ADMIN_PASSWORD,
  // Session cookie lifetime and the Secure flag. Secure must stay off while
  // the panel is served over plain HTTP (the browser drops Secure cookies on
  // http://), and be flipped on with SECURE_COOKIES=true once TLS is in front.
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS || 168),
  secureCookies: process.env.SECURE_COOKIES === "true",
  // When TLS is terminated in front (nginx/Caddy), set FORCE_HTTPS=true to
  // redirect plain-HTTP requests and send HSTS. Off by default so the panel
  // still works on http:// during initial setup.
  forceHttps: process.env.FORCE_HTTPS === "true",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramChatId: process.env.TELEGRAM_CHAT_ID,
  checkIntervalMinutes: Number(process.env.CHECK_INTERVAL_MINUTES || 5),
  dailySummaryHour: Number(process.env.DAILY_SUMMARY_HOUR ?? 9),
  sslWarnDays: Number(process.env.SSL_WARN_DAYS || 14),
  slowResponseMs: Number(process.env.SLOW_RESPONSE_MS || 3000),
  // Incident engine: how many consecutive failed checks confirm an outage
  // (blocks single-blip false positives), and the flapping window/threshold.
  // How many site/port checks run concurrently per sweep (was fully
  // sequential). Keeps big fleets from taking minutes per cycle.
  uptimeConcurrency: Number(process.env.UPTIME_CONCURRENCY || 8),
  portConcurrency: Number(process.env.PORT_CONCURRENCY || 10),
  incidentConfirmChecks: Number(process.env.INCIDENT_CONFIRM_CHECKS || 2),
  incidentFlapWindowMin: Number(process.env.INCIDENT_FLAP_WINDOW_MIN || 30),
  incidentFlapThreshold: Number(process.env.INCIDENT_FLAP_THRESHOLD || 3),
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 10000),
  dbGrowthWarnPercent: Number(process.env.DB_GROWTH_WARN_PERCENT || 20),
  deepCheckHour: Number(process.env.DEEP_CHECK_HOUR ?? 3),
  visualDiffWarnPercent: Number(process.env.VISUAL_DIFF_WARN_PERCENT || 15),
  lcpWarnMs: Number(process.env.LCP_WARN_MS || 4000),
  domainWarnDays: Number(process.env.DOMAIN_WARN_DAYS || 30),
  backupHour: Number(process.env.BACKUP_HOUR ?? 4),
  // How long to keep check/event history and screenshots. Must stay >= the
  // longest SLA-report window (90 days) or those reports lose older data.
  dataRetentionDays: Number(process.env.DATA_RETENTION_DAYS || 180),
  vulnSyncEnabled: process.env.VULN_SYNC_ENABLED !== "false",
  vulnSyncHour: Number(process.env.VULN_SYNC_HOUR ?? 5),
  vulnAlertMinSeverity: process.env.VULN_ALERT_MIN_SEVERITY || "high",
  externalVulnFeedUrl: process.env.EXTERNAL_VULN_FEED_URL || "",
  externalVulnFeedKey: process.env.EXTERNAL_VULN_FEED_KEY || "",
};
