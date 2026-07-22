import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { upsertSite, listSites } from "./db.js";
import { logger } from "./logger.js";

const SITES_PATH = path.resolve("config/sites.json");

// Only used to bootstrap the very first run. Once sites exist, manage them
// from the dashboard — this won't touch sites added/edited/removed there.
export function seedSitesFromConfig() {
  if (listSites().length > 0) return;

  if (!fs.existsSync(SITES_PATH)) {
    logger.warn("seed: no sites yet and config/sites.json not found — add sites from the dashboard");
    return;
  }
  const sites = JSON.parse(fs.readFileSync(SITES_PATH, "utf8"));
  for (const site of sites) {
    // Generate the raw key here so we can log it once for setup — the DB only
    // ever stores its hash.
    const apiKey = crypto.randomBytes(24).toString("hex");
    upsertSite({ name: site.name, url: site.url, checkoutUrl: site.checkoutUrl, apiKey });
    logger.info("seed: site agent key (shown once — copy into the WP agent now)", {
      site: site.name,
      apiKey,
    });
  }
  logger.info("seed: sites synced from config/sites.json", { count: sites.length });
}
