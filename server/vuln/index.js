import fs from "node:fs";
import path from "node:path";
import { env } from "../config.js";
import { logger } from "../logger.js";
import { versionInRange, compareVersions } from "./versionRange.js";
import {
  upsertVulnerability,
  listVulnerabilitiesForPlugin,
  listSites,
  latestSnapshot,
  recordSiteVulnerability,
  resolveSiteVulnerability,
  activeSiteVulnerabilities,
  fleetVulnerabilities,
  markSiteVulnerabilityNotified,
  db,
} from "../db.js";
import { notifySite } from "../notify/telegram.js";

const SEVERITY_ORDER = { low: 0, medium: 1, high: 2, critical: 3 };
const SEED_PATH = path.resolve("data/local-vulnerabilities.seed.json");

// Seeds the curated local vulnerability DB on boot. Idempotent via
// (source, source_id) — editing the seed file and rebooting updates records.
export function seedLocalVulnerabilities() {
  if (!fs.existsSync(SEED_PATH)) return;
  let entries;
  try {
    entries = JSON.parse(fs.readFileSync(SEED_PATH, "utf8"));
  } catch (err) {
    logger.error("vuln: failed to parse local seed", { error: err.message });
    return;
  }
  for (const e of entries) {
    upsertVulnerability({
      source: "local",
      source_id: e.source_id,
      plugin_slug: e.pluginSlug ?? null,
      theme_slug: e.themeSlug ?? null,
      affected_versions: e.affectedVersions,
      fixed_in: e.fixedIn ?? null,
      severity: e.severity ?? "medium",
      title: e.title,
      description: e.description ?? null,
      cve_id: e.cveId ?? null,
      reference_url: e.referenceUrl ?? null,
      published_at: e.publishedAt ?? null,
    });
  }
  logger.info("vuln: local seed loaded", { count: entries.length });
}

// Optional external feed. Expects a JSON array of records already shaped like
// the internal form (source_id, pluginSlug, affectedVersions, ...). Any feed
// with a different shape needs its own adapter here; absent/unconfigured, the
// feature runs on the local DB alone.
export async function syncExternalFeed() {
  if (!env.externalVulnFeedUrl) return { imported: 0, skipped: true };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(env.externalVulnFeedUrl, {
      signal: controller.signal,
      headers: env.externalVulnFeedKey ? { Authorization: `Bearer ${env.externalVulnFeedKey}` } : {},
    });
    if (!res.ok) {
      logger.error("vuln: external feed http error", { status: res.status });
      return { imported: 0, error: `HTTP ${res.status}` };
    }
    const records = await res.json();
    if (!Array.isArray(records)) {
      logger.error("vuln: external feed not an array");
      return { imported: 0, error: "invalid feed shape" };
    }
    let imported = 0;
    for (const e of records) {
      if (!e.source_id || !e.affectedVersions) continue;
      upsertVulnerability({
        source: "external",
        source_id: e.source_id,
        plugin_slug: e.pluginSlug ?? null,
        theme_slug: e.themeSlug ?? null,
        affected_versions: e.affectedVersions,
        fixed_in: e.fixedIn ?? null,
        severity: e.severity ?? "medium",
        title: e.title ?? e.source_id,
        description: e.description ?? null,
        cve_id: e.cveId ?? null,
        reference_url: e.referenceUrl ?? null,
        published_at: e.publishedAt ?? null,
      });
      imported++;
    }
    logger.info("vuln: external feed synced", { imported });
    return { imported };
  } catch (err) {
    logger.error("vuln: external feed fetch failed", { error: err.message });
    return { imported: 0, error: err.message };
  } finally {
    clearTimeout(timeout);
  }
}

function installedPlugins(site) {
  const snapshot = latestSnapshot(site.id);
  return snapshot?.data?.plugins || [];
}

// For one site: match its installed plugins against known vulnerabilities,
// create/resolve site_vulnerability links, and return the newly-detected ones
// (for alerting). Pure DB work — no network.
export function matchSite(site) {
  const plugins = installedPlugins(site);
  const pluginBySlug = new Map(plugins.map((p) => [p.slug, p]));
  const newlyDetected = [];

  // detect
  for (const [slug, plugin] of pluginBySlug) {
    for (const vuln of listVulnerabilitiesForPlugin(slug)) {
      const affected = versionInRange(plugin.version, vuln.affected_versions);
      if (affected) {
        const inserted = recordSiteVulnerability(site.id, vuln.id, plugin.version);
        if (inserted) newlyDetected.push({ vuln, installedVersion: plugin.version });
      }
    }
  }

  // resolve: any previously-active link whose plugin is now gone or patched
  for (const active of activeSiteVulnerabilities(site.id)) {
    const plugin = active.plugin_slug ? pluginBySlug.get(active.plugin_slug) : null;
    const stillAffected = plugin && versionInRange(plugin.version, active.affected_versions);
    if (!stillAffected) {
      resolveSiteVulnerability(site.id, active.id);
    }
  }

  return newlyDetected;
}

export async function runVulnerabilityScan() {
  if (!env.vulnSyncEnabled) return;
  await syncExternalFeed();

  const minSeverity = SEVERITY_ORDER[env.vulnAlertMinSeverity] ?? SEVERITY_ORDER.high;

  for (const site of listSites()) {
    let detected;
    try {
      detected = matchSite(site);
    } catch (err) {
      logger.error("vuln: match failed", { site: site.name, error: err.message });
      continue;
    }
    for (const { vuln, installedVersion } of detected) {
      if ((SEVERITY_ORDER[vuln.severity] ?? 0) >= minSeverity) {
        const link = db
          .prepare("SELECT id FROM site_vulnerabilities WHERE site_id = ? AND vulnerability_id = ?")
          .get(site.id, vuln.id);
        await notifySite(
          site.id,
          `🛡 <b>${site.name}</b> — آسیب‌پذیری ${vuln.severity}: ${vuln.title} (نسخه‌ی نصب‌شده ${installedVersion}${
            vuln.fixed_in ? `، رفع در ${vuln.fixed_in}` : ""
          })`,
          "security"
        );
        if (link) markSiteVulnerabilityNotified(link.id);
      }
    }
  }
}

export { fleetVulnerabilities, activeSiteVulnerabilities, compareVersions };
