import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { env } from "./config.js";
import { seedSitesFromConfig } from "./seed.js";
import { apiRouter } from "./routes/api.js";
import { ingestRouter } from "./routes/ingest.js";
import { runChecks, startScheduler } from "./scheduler.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.use("/api", apiRouter);
app.use("/api", ingestRouter);

const dashboardDist = path.resolve("dashboard/dist");
if (fs.existsSync(dashboardDist)) {
  app.use(express.static(dashboardDist));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(dashboardDist, "index.html"));
  });
}

async function main() {
  seedSitesFromConfig();

  const once = process.argv.includes("--once");
  await runChecks();
  if (once) {
    process.exit(0);
  }

  startScheduler();
  app.listen(env.port, () => {
    console.log(`[server] listening on http://localhost:${env.port}`);
    if (!fs.existsSync(dashboardDist)) {
      console.log(`[server] dashboard not built yet — run "npm run build" in dashboard/`);
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
