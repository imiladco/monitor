import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { upsertSite, listSites } from "./db.js";

const SITES_PATH = path.resolve("config/sites.json");

// Only used to bootstrap the very first run. Once sites exist, manage them
// from the dashboard — this won't touch sites added/edited/removed there.
export function seedSitesFromConfig() {
  if (listSites().length > 0) return;

  if (!fs.existsSync(SITES_PATH)) {
    console.warn("[seed] no sites yet and config/sites.json not found — add sites from the dashboard.");
    return;
  }
  const sites = JSON.parse(fs.readFileSync(SITES_PATH, "utf8"));
  for (const site of sites) {
    upsertSite({
      name: site.name,
      url: site.url,
      checkoutUrl: site.checkoutUrl,
      apiKey: crypto.randomBytes(24).toString("hex"),
    });
  }
  console.log(`[seed] ${sites.length} site(s) synced from config/sites.json`);
  for (const s of listSites()) {
    console.log(`  - ${s.name}: agent api key = ${s.api_key}`);
  }
}
