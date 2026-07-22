import fs from "node:fs";
import { env } from "./config.js";
import { pruneOldData } from "./db.js";
import { logger } from "./logger.js";

// Prune aged check/event/screenshot history and unlink the screenshot files
// that went with the removed rows. Runs on the daily maintenance cron.
export function runRetention() {
  const { checks, events, screenshots, screenshotPaths } = pruneOldData(env.dataRetentionDays);

  let filesRemoved = 0;
  for (const p of screenshotPaths) {
    try {
      fs.rmSync(p, { force: true });
      filesRemoved += 1;
    } catch {
      // file already gone (e.g. the per-site 20-file cap beat us to it)
    }
  }

  if (checks || events || screenshots) {
    logger.info("retention: pruned old data", {
      retentionDays: env.dataRetentionDays,
      checks,
      events,
      screenshots,
      filesRemoved,
    });
  }
  return { checks, events, screenshots, filesRemoved };
}
