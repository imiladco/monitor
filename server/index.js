import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { env } from "./config.js";
import { seedSitesFromConfig } from "./seed.js";
import { apiRouter } from "./routes/api.js";
import { ingestRouter } from "./routes/ingest.js";
import { authRouter } from "./routes/auth.js";
import { publicStatusRouter } from "./routes/publicStatus.js";
import { agentCommandsRouter } from "./routes/agentCommands.js";
import { requireAdmin } from "./auth.js";
import { runChecks, startScheduler } from "./scheduler.js";
import { listSites, lastCheckTimestamp } from "./db.js";
import { logger, pruneOldLogs } from "./logger.js";

const VERSION = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url))).version;
const startedAt = Date.now();

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    version: VERSION,
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    sitesCount: listSites().length,
    lastCheckAt: lastCheckTimestamp(),
  });
});

app.use("/api/auth", authRouter);
app.use("/api", ingestRouter); // agent snapshots/events authenticate with their own per-site key
app.use("/api", publicStatusRouter); // status page authenticates via its own token in the URL
app.use("/api", agentCommandsRouter); // agent command polling authenticates with its own per-site key
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
  seedSitesFromConfig();

  const once = process.argv.includes("--once");
  await runChecks();
  if (once) {
    process.exit(0);
  }

  startScheduler();
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
