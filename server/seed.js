import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { upsertSite, listSites } from "./db.js";

const SITES_PATH = path.resolve("config/sites.json");

export function seedSitesFromConfig() {
  if (!fs.existsSync(SITES_PATH)) {
    console.warn("[seed] config/sites.json not found, skipping. Copy config/sites.example.json first.");
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
