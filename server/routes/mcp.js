import { Router } from "express";
import { requireMcpKey } from "../mcpAuth.js";
import {
  listSites,
  getSiteById,
  latestCheck,
  checkHistory,
  eventTimeline,
  latestSnapshot,
  uptimePercent,
  downtimeIncidents,
  activeSiteVulnerabilities,
  fleetVulnerabilities,
  listSiteHolds,
} from "../db.js";

export const mcpRouter = Router();
mcpRouter.use(requireMcpKey);

function siteSummary(site) {
  const uptime = latestCheck(site.id, "uptime");
  const ssl = latestCheck(site.id, "ssl");
  const snapshot = latestSnapshot(site.id);
  const flags = [];
  if (site.paused) flags.push("paused");
  if (uptime && !uptime.ok) flags.push("down");
  if (ssl?.ssl_days_left != null && ssl.ssl_days_left <= 14) flags.push("ssl_expiring");
  if (snapshot?.data?.updatesAvailable?.length) flags.push(`${snapshot.data.updatesAvailable.length}_updates`);
  const vulnCount = activeSiteVulnerabilities(site.id).length;
  if (vulnCount) flags.push(`${vulnCount}_vulns`);
  return {
    id: site.id,
    label: site.name,
    url: site.url,
    client: site.client || null,
    online: uptime ? Boolean(uptime.ok) : null,
    last_check_at: uptime?.checked_at ?? null,
    health_flags: flags,
  };
}

// list_sites
mcpRouter.get("/sites", (req, res) => {
  res.json({ sites: listSites().map(siteSummary) });
});

// get_site_details
mcpRouter.get("/sites/:id", (req, res) => {
  const site = getSiteById(req.params.id);
  if (!site) return res.status(404).json({ error: "not found" });
  const snapshot = latestSnapshot(site.id);
  const ssl = latestCheck(site.id, "ssl");
  res.json({
    id: site.id,
    label: site.name,
    url: site.url,
    client: site.client || null,
    paused: Boolean(site.paused),
    wp_version: snapshot?.data?.wpVersion ?? null,
    theme: snapshot?.data?.theme ?? null,
    plugins: snapshot?.data?.plugins ?? [],
    pending_updates: snapshot?.data?.updatesAvailable ?? [],
    ssl_days_left: ssl?.ssl_days_left ?? null,
    uptime_percent: { "7d": uptimePercent(site.id, 7), "30d": uptimePercent(site.id, 30), "90d": uptimePercent(site.id, 90) },
    active_vulnerabilities: activeSiteVulnerabilities(site.id).map((v) => ({
      title: v.title,
      severity: v.severity,
      plugin: v.plugin_slug,
      installed_version: v.installed_version,
      fixed_in: v.fixed_in,
    })),
    update_holds: listSiteHolds(site.id).map((h) => ({ plugin: h.plugin_slug, target_version: h.target_version, reason: h.reason })),
  });
});

// get_uptime_history
mcpRouter.get("/sites/:id/uptime", (req, res) => {
  const site = getSiteById(req.params.id);
  if (!site) return res.status(404).json({ error: "not found" });
  const days = Math.min(Number(req.query.days) || 7, 90);
  const limit = Math.min(days * 24 * 12, 5000); // ~5-min cadence cap
  const checks = checkHistory(site.id, "uptime", limit)
    .reverse()
    .map((c) => ({ at: c.checked_at, ok: Boolean(c.ok), response_ms: c.response_ms, status: c.status_code }));
  res.json({ days, uptime_percent: uptimePercent(site.id, days), checks });
});

// get_timeline
mcpRouter.get("/sites/:id/timeline", (req, res) => {
  const site = getSiteById(req.params.id);
  if (!site) return res.status(404).json({ error: "not found" });
  const events = eventTimeline(site.id, 200).map((e) => ({ at: e.occurred_at, type: e.type, title: e.title, severity: e.severity }));
  res.json({ events });
});

// get_incidents
mcpRouter.get("/incidents", (req, res) => {
  const days = Math.min(Number(req.query.days) || 30, 365);
  const siteId = req.query.site_id ? Number(req.query.site_id) : null;
  const sites = siteId ? [getSiteById(siteId)].filter(Boolean) : listSites();
  const incidents = [];
  for (const site of sites) {
    for (const inc of downtimeIncidents(site.id, days)) {
      incidents.push({ site: site.name, started_at: inc.startedAt, ended_at: inc.endedAt, reason: inc.reason });
    }
  }
  res.json({ incidents });
});

// get_fleet_summary
mcpRouter.get("/fleet-summary", (req, res) => {
  const sites = listSites();
  let online = 0;
  let offline = 0;
  let pendingUpdates = 0;
  for (const site of sites) {
    const uptime = latestCheck(site.id, "uptime");
    if (uptime) (uptime.ok ? online++ : offline++);
    const snapshot = latestSnapshot(site.id);
    pendingUpdates += snapshot?.data?.updatesAvailable?.length || 0;
  }
  res.json({
    total_sites: sites.length,
    online,
    offline,
    pending_updates: pendingUpdates,
    active_vulnerabilities: fleetVulnerabilities().length,
  });
});

// search_across_fleet — structured, not free text
mcpRouter.get("/search", (req, res) => {
  const { plugin, slow_ms, ssl_within_days } = req.query;
  const results = [];
  for (const site of listSites()) {
    const snapshot = latestSnapshot(site.id);
    const uptime = latestCheck(site.id, "uptime");
    const ssl = latestCheck(site.id, "ssl");

    if (plugin) {
      const p = snapshot?.data?.plugins?.find((x) => x.slug === plugin);
      if (!p) continue;
      results.push({ site: site.name, plugin: p.slug, version: p.version });
      continue;
    }
    if (slow_ms) {
      if (uptime?.response_ms != null && uptime.response_ms >= Number(slow_ms)) {
        results.push({ site: site.name, response_ms: uptime.response_ms });
      }
      continue;
    }
    if (ssl_within_days) {
      if (ssl?.ssl_days_left != null && ssl.ssl_days_left <= Number(ssl_within_days)) {
        results.push({ site: site.name, ssl_days_left: ssl.ssl_days_left });
      }
      continue;
    }
  }
  res.json({ results });
});

// get_plugin_across_fleet
mcpRouter.get("/plugin/:slug", (req, res) => {
  const slug = req.params.slug;
  const sites = [];
  for (const site of listSites()) {
    const snapshot = latestSnapshot(site.id);
    const plugin = snapshot?.data?.plugins?.find((p) => p.slug === slug);
    if (!plugin) continue;
    const update = snapshot?.data?.updatesAvailable?.find((u) => u.slug === slug);
    const holds = listSiteHolds(site.id).filter((h) => h.plugin_slug === slug);
    sites.push({
      site: site.name,
      version: plugin.version,
      active: plugin.active,
      update_available: update ? update.newVersion : null,
      held: holds.length > 0,
    });
  }
  res.json({ plugin: slug, sites });
});

// get_vulnerabilities
mcpRouter.get("/vulnerabilities", (req, res) => {
  res.json({
    vulnerabilities: fleetVulnerabilities().map((v) => ({
      site: v.site_name,
      title: v.title,
      severity: v.severity,
      plugin: v.plugin_slug,
      installed_version: v.installed_version,
      fixed_in: v.fixed_in,
      cve_id: v.cve_id,
    })),
  });
});
