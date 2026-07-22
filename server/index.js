import express from "express";
import path from "node:path";
import fs from "node:fs";
import { env } from "./config.js";
import { seedSitesFromConfig } from "./seed.js";
import { apiRouter } from "./routes/api.js";
import { ingestRouter } from "./routes/ingest.js";
import { authRouter } from "./routes/auth.js";
import { publicStatusRouter } from "./routes/publicStatus.js";
import { agentCommandsRouter } from "./routes/agentCommands.js";
import { mcpRouter } from "./routes/mcp.js";
import { requireAdmin } from "./auth.js";
import { httpsEnforce } from "./httpsEnforce.js";
import { runChecks, startScheduler } from "./scheduler.js";
import { listSites, lastCheckTimestamp, getSetting, pruneExpiredSessions } from "./db.js";
import { seedLocalVulnerabilities, runVulnerabilityScan } from "./vuln/index.js";
import { logger, pruneOldLogs } from "./logger.js";

const VERSION = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url))).version;
const startedAt = Date.now();

const app = express();
// Trust the reverse proxy (if any) so req.secure / req.ip reflect
// X-Forwarded-Proto / X-Forwarded-For when TLS is terminated in front.
app.set("trust proxy", env.forceHttps ? 1 : false);
// Redirect to HTTPS + send HSTS when FORCE_HTTPS is on (no-op otherwise).
app.use(httpsEnforce);
// No CORS: the dashboard is served from the same origin as the API, and the
// WordPress agent talks to it server-to-server (not from a browser), so no
// cross-origin access is needed. A private admin panel shouldn't invite it.
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    version: VERSION,
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    sitesCount: listSites().length,
    lastCheckAt: lastCheckTimestamp(),
  });
});

app.get("/api/branding", (req, res) => {
  res.json({
    name: getSetting("brand_name", "") || "Site Monitor",
    logoUrl: getSetting("brand_logo_url", ""),
  });
});

app.use("/api/auth", authRouter);
app.use("/api", ingestRouter); // agent snapshots/events authenticate with their own per-site key
app.use("/api", publicStatusRouter); // status page authenticates via its own token in the URL
app.use("/api", agentCommandsRouter); // agent command polling authenticates with its own per-site key
app.use("/api/mcp", mcpRouter); // MCP read endpoints authenticate with their own bearer key
app.use("/api", requireAdmin, apiRouter);

const dashboardDist = path.resolve("dashboard/dist");
if (fs.existsSync(dashboardDist)) {
  app.use(express.static(dashboardDist));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(dashboardDist, "index.html"));
  });
}

async function main() {
  pruneOldLogs();
  pruneExpiredSessions();
  seedSitesFromConfig();
  seedLocalVulnerabilities();

  const once = process.argv.includes("--once");
  await runChecks();
  if (once) {
    process.exit(0);
  }

  startScheduler();
  // run one scan shortly after boot so the UI isn't empty until VULN_SYNC_HOUR
  runVulnerabilityScan().catch((err) => logger.error("vuln: initial scan failed", { error: err.message }));
  app.listen(env.port, () => {
    logger.info("server: listening", { port: env.port, version: VERSION });
    if (!fs.existsSync(dashboardDist)) {
      logger.warn("server: dashboard not built yet — run npm run build:dashboard");
    }
  });
}

main().catch((err) => {
  logger.error("server: fatal startup error", { error: err.message });
  process.exit(1);
});
