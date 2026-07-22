import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.resolve("data/monitor.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
// Enforce ON DELETE CASCADE (off by default in SQLite) — without this,
// deleting a site leaves orphan checks/events/snapshots/etc. behind.
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  checkout_url TEXT,
  api_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  ok INTEGER NOT NULL,
  response_ms INTEGER,
  status_code INTEGER,
  ssl_days_left INTEGER,
  error TEXT,
  checked_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_checks_site_time ON checks(site_id, checked_at);

CREATE TABLE IF NOT EXISTS screenshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  diff_percent REAL,
  lcp_ms INTEGER,
  cls REAL,
  ttfb_ms INTEGER,
  captured_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_screenshots_site_time ON screenshots(site_id, captured_at);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  severity TEXT NOT NULL DEFAULT 'info',
  source TEXT NOT NULL DEFAULT 'external',
  occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_site_time ON events(site_id, occurred_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS telegram_topics (
  category TEXT PRIMARY KEY,
  thread_id INTEGER,
  name TEXT
);

CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  captured_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_snapshots_site_time ON snapshots(site_id, captured_at);

CREATE TABLE IF NOT EXISTS maintenance_windows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE,
  note TEXT,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_maintenance_site_time ON maintenance_windows(site_id, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS port_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Remote actions (update plugin/theme/core, clear cache) executed by the
-- WP agent. Gated globally off by default via the remote_actions_enabled
-- setting — see server/routes/agentCommands.js.
CREATE TABLE IF NOT EXISTS commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  params TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  result TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_commands_site_status ON commands(site_id, status);

-- CVE / vulnerability cross-reference (v2 phase A). local-first: seeded from
-- data/local-vulnerabilities.seed.json, optionally augmented by an external
-- feed. Matched against each site's installed plugins from agent snapshots.
CREATE TABLE IF NOT EXISTS vulnerabilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  plugin_slug TEXT,
  theme_slug TEXT,
  affected_versions TEXT NOT NULL,
  fixed_in TEXT,
  severity TEXT NOT NULL DEFAULT 'medium',
  title TEXT NOT NULL,
  description TEXT,
  cve_id TEXT,
  reference_url TEXT,
  published_at TEXT,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source, source_id)
);
CREATE INDEX IF NOT EXISTS idx_vuln_plugin ON vulnerabilities(plugin_slug);

CREATE TABLE IF NOT EXISTS site_vulnerabilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  vulnerability_id INTEGER NOT NULL REFERENCES vulnerabilities(id) ON DELETE CASCADE,
  installed_version TEXT,
  detected_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  notified_at TEXT,
  UNIQUE(site_id, vulnerability_id)
);
CREATE INDEX IF NOT EXISTS idx_sitevuln_site ON site_vulnerabilities(site_id, resolved_at);

-- Fleet Learning / Update Guard (v2 phase B). Deterministic, no AI.
-- pending_verdicts is a persistent queue so a delayed evaluation survives
-- a server restart.
CREATE TABLE IF NOT EXISTS pending_verdicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  plugin_slug TEXT NOT NULL,
  from_version TEXT NOT NULL,
  to_version TEXT NOT NULL,
  event_at TEXT NOT NULL,
  evaluate_after TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pending_verdicts_due ON pending_verdicts(evaluate_after);

CREATE TABLE IF NOT EXISTS plugin_update_verdicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_slug TEXT NOT NULL,
  from_version TEXT NOT NULL,
  to_version TEXT NOT NULL,
  verdict TEXT NOT NULL,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  evidence_site_ids TEXT,
  notes TEXT,
  UNIQUE(plugin_slug, from_version, to_version)
);

CREATE TABLE IF NOT EXISTS update_holds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  plugin_slug TEXT NOT NULL,
  target_version TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  released_at TEXT,
  released_by TEXT,
  UNIQUE(site_id, plugin_slug, target_version)
);
CREATE INDEX IF NOT EXISTS idx_update_holds_site ON update_holds(site_id, released_at);

-- MCP access keys (v2 phase C). Separate from the admin password so MCP
-- access can be granted/revoked independently. Only the SHA-256 hash is
-- stored; the raw key is shown once at creation.
CREATE TABLE IF NOT EXISTS mcp_api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);

-- Admin dashboard sessions. Replaces sending the admin password on every
-- request: /login (password + TOTP) mints an opaque high-entropy token
-- stored here and set as an httpOnly cookie; requireAdmin validates it.
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
`);

// Lightweight migration: add columns that didn't exist in earlier releases
// without wiping existing installs' data.
const existingSiteColumns = new Set(db.prepare("PRAGMA table_info(sites)").all().map((c) => c.name));
const siteColumnsToAdd = {
  paused: "INTEGER NOT NULL DEFAULT 0",
  keyword: "TEXT",
  keyword_mode: "TEXT NOT NULL DEFAULT 'present'",
  public: "INTEGER NOT NULL DEFAULT 0",
  client: "TEXT",
};
for (const [column, definition] of Object.entries(siteColumnsToAdd)) {
  if (!existingSiteColumns.has(column)) {
    db.exec(`ALTER TABLE sites ADD COLUMN ${column} ${definition}`);
  }
}

const existingCommandColumns = new Set(db.prepare("PRAGMA table_info(commands)").all().map((c) => c.name));
if (!existingCommandColumns.has("claimed_at")) {
  db.exec("ALTER TABLE commands ADD COLUMN claimed_at TEXT");
}

export function upsertSite({ name, url, checkoutUrl, apiKey }) {
  const existing = db.prepare("SELECT * FROM sites WHERE url = ?").get(url);
  if (existing) {
    db.prepare("UPDATE sites SET name = ?, checkout_url = ? WHERE id = ?").run(
      name,
      checkoutUrl || null,
      existing.id
    );
    return db.prepare("SELECT * FROM sites WHERE id = ?").get(existing.id);
  }
  const info = db
    .prepare("INSERT INTO sites (name, url, checkout_url, api_key) VALUES (?, ?, ?, ?)")
    .run(name, url, checkoutUrl || null, apiKey);
  return db.prepare("SELECT * FROM sites WHERE id = ?").get(info.lastInsertRowid);
}

export function listSites() {
  return db.prepare("SELECT * FROM sites ORDER BY name").all();
}

export function createSite({ name, url, checkoutUrl, apiKey, keyword, keywordMode, client }) {
  const info = db
    .prepare(
      "INSERT INTO sites (name, url, checkout_url, api_key, keyword, keyword_mode, client) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(name, url, checkoutUrl || null, apiKey, keyword || null, keywordMode || "present", client || null);
  return db.prepare("SELECT * FROM sites WHERE id = ?").get(info.lastInsertRowid);
}

export function updateSite(id, { name, url, checkoutUrl, keyword, keywordMode, client }) {
  db.prepare(
    "UPDATE sites SET name = ?, url = ?, checkout_url = ?, keyword = ?, keyword_mode = ?, client = ? WHERE id = ?"
  ).run(name, url, checkoutUrl || null, keyword || null, keywordMode || "present", client || null, id);
  return db.prepare("SELECT * FROM sites WHERE id = ?").get(id);
}

export function listClients() {
  return db
    .prepare("SELECT DISTINCT client FROM sites WHERE client IS NOT NULL AND client != '' ORDER BY client")
    .all()
    .map((r) => r.client);
}

export function deleteSite(id) {
  db.prepare("DELETE FROM sites WHERE id = ?").run(id);
}

export function setSitePaused(id, paused) {
  db.prepare("UPDATE sites SET paused = ? WHERE id = ?").run(paused ? 1 : 0, id);
}

export function setSitePublic(id, isPublic) {
  db.prepare("UPDATE sites SET public = ? WHERE id = ?").run(isPublic ? 1 : 0, id);
}

export function listPublicSites() {
  return db.prepare("SELECT * FROM sites WHERE public = 1 ORDER BY name").all();
}

export function uptimePercent(siteId, days) {
  const row = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN ok = 1 THEN 1 ELSE 0 END) AS up
       FROM checks
       WHERE site_id = ? AND type = 'uptime' AND checked_at >= datetime('now', ?)`
    )
    .get(siteId, `-${days} days`);
  if (!row || !row.total) return null;
  return Number(((row.up / row.total) * 100).toFixed(2));
}

export function getTelegramTopic(category) {
  return db.prepare("SELECT * FROM telegram_topics WHERE category = ?").get(category);
}

export function listTelegramTopics() {
  return db.prepare("SELECT * FROM telegram_topics").all();
}

export function setTelegramTopic(category, threadId, name) {
  db.prepare(
    `INSERT INTO telegram_topics (category, thread_id, name) VALUES (?, ?, ?)
     ON CONFLICT(category) DO UPDATE SET thread_id = excluded.thread_id, name = excluded.name`
  ).run(category, threadId, name);
}

export function getSetting(key, fallback = null) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}

export function getSiteByApiKey(apiKey) {
  return db.prepare("SELECT * FROM sites WHERE api_key = ?").get(apiKey);
}

export function getSiteById(id) {
  return db.prepare("SELECT * FROM sites WHERE id = ?").get(id);
}

export function recordCheck(siteId, check) {
  db.prepare(
    `INSERT INTO checks (site_id, type, ok, response_ms, status_code, ssl_days_left, error)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    siteId,
    check.type,
    check.ok ? 1 : 0,
    check.responseMs ?? null,
    check.statusCode ?? null,
    check.sslDaysLeft ?? null,
    check.error ?? null
  );
}

export function latestCheck(siteId, type) {
  return db
    .prepare(
      "SELECT * FROM checks WHERE site_id = ? AND type = ? ORDER BY checked_at DESC LIMIT 1"
    )
    .get(siteId, type);
}

export function checkHistory(siteId, type, limit = 100) {
  return db
    .prepare(
      "SELECT * FROM checks WHERE site_id = ? AND type = ? ORDER BY checked_at DESC LIMIT ?"
    )
    .all(siteId, type, limit);
}

export function recordEvent(siteId, { type, title, detail, severity = "info", source = "external" }) {
  db.prepare(
    `INSERT INTO events (site_id, type, title, detail, severity, source) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(siteId, type, title, detail ? JSON.stringify(detail) : null, severity, source);
}

export function eventTimeline(siteId, limit = 200) {
  return db
    .prepare("SELECT * FROM events WHERE site_id = ? ORDER BY occurred_at DESC LIMIT ?")
    .all(siteId, limit)
    .map((e) => ({ ...e, detail: e.detail ? JSON.parse(e.detail) : null }));
}

export function recordScreenshot(siteId, { path, diffPercent, lcpMs, cls, ttfbMs }) {
  db.prepare(
    `INSERT INTO screenshots (site_id, path, diff_percent, lcp_ms, cls, ttfb_ms) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(siteId, path, diffPercent ?? null, lcpMs ?? null, cls ?? null, ttfbMs ?? null);
}

export function latestScreenshot(siteId) {
  return db
    .prepare("SELECT * FROM screenshots WHERE site_id = ? ORDER BY captured_at DESC LIMIT 1")
    .get(siteId);
}

export function vitalsHistory(siteId, limit = 60) {
  return db
    .prepare(
      "SELECT lcp_ms, cls, ttfb_ms, captured_at FROM screenshots WHERE site_id = ? ORDER BY captured_at DESC LIMIT ?"
    )
    .all(siteId, limit)
    .reverse();
}

export function latestSnapshot(siteId) {
  const row = db
    .prepare("SELECT * FROM snapshots WHERE site_id = ? ORDER BY captured_at DESC LIMIT 1")
    .get(siteId);
  if (!row) return null;
  return { ...row, data: JSON.parse(row.data) };
}

export function saveSnapshot(siteId, data) {
  db.prepare("INSERT INTO snapshots (site_id, data) VALUES (?, ?)").run(siteId, JSON.stringify(data));
}

export function downtimeIncidents(siteId, days) {
  const rows = db
    .prepare(
      `SELECT * FROM events WHERE site_id = ? AND type = 'uptime_change' AND occurred_at >= datetime('now', ?) ORDER BY occurred_at ASC`
    )
    .all(siteId, `-${days} days`);

  const incidents = [];
  let open = null;
  for (const row of rows) {
    const isDown = row.severity === "critical";
    if (isDown && !open) {
      open = { startedAt: row.occurred_at, reason: row.title };
    } else if (!isDown && open) {
      incidents.push({ ...open, endedAt: row.occurred_at });
      open = null;
    }
  }
  if (open) incidents.push({ ...open, endedAt: null });
  return incidents;
}

export function createCommand({ siteId, type, params }) {
  const info = db
    .prepare("INSERT INTO commands (site_id, type, params) VALUES (?, ?, ?)")
    .run(siteId, type, params ? JSON.stringify(params) : null);
  return db.prepare("SELECT * FROM commands WHERE id = ?").get(info.lastInsertRowid);
}

export function listCommands(siteId, limit = 50) {
  return db
    .prepare("SELECT * FROM commands WHERE site_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(siteId, limit)
    .map((c) => ({ ...c, params: c.params ? JSON.parse(c.params) : null }));
}

// Fetches this site's pending commands and atomically marks them "running"
// so a slow/duplicate agent poll doesn't pick the same command up twice.
export function claimPendingCommands(siteId) {
  const pending = db.prepare("SELECT * FROM commands WHERE site_id = ? AND status = 'pending'").all(siteId);
  const markRunning = db.prepare("UPDATE commands SET status = 'running', claimed_at = datetime('now') WHERE id = ?");
  for (const c of pending) markRunning.run(c.id);
  return pending.map((c) => ({ ...c, status: "running", params: c.params ? JSON.parse(c.params) : null }));
}

// Scoped to the calling agent's own site and to a currently-running command,
// so one site's agent can't complete (or guess the id of) another site's
// command. Returns the number of rows changed (0 = not found / not theirs).
export function completeCommand(id, siteId, status, result) {
  const info = db
    .prepare(
      "UPDATE commands SET status = ?, result = ?, completed_at = datetime('now') WHERE id = ? AND site_id = ? AND status = 'running'"
    )
    .run(status, result ?? null, id, siteId);
  return info.changes;
}

// Requeues commands stuck in 'running' past the lease (agent crashed or its
// result never arrived), so they don't hang forever.
export function recoverStuckCommands(leaseMinutes = 15) {
  const info = db
    .prepare(
      `UPDATE commands SET status = 'pending', claimed_at = NULL
       WHERE status = 'running' AND claimed_at IS NOT NULL
         AND claimed_at <= datetime('now', ?)`
    )
    .run(`-${leaseMinutes} minutes`);
  return info.changes;
}

// --- Admin sessions ---------------------------------------------------------

export function createSession(token, ttlHours) {
  const n = Number(ttlHours);
  const modifier = `${n >= 0 ? "+" : ""}${n} hours`; // avoid an invalid "+-1 hours"
  db.prepare("INSERT INTO sessions (token, expires_at) VALUES (?, datetime('now', ?))").run(token, modifier);
}

export function getValidSession(token) {
  if (!token) return null;
  return (
    db.prepare("SELECT token FROM sessions WHERE token = ? AND expires_at > datetime('now')").get(token) || null
  );
}

export function deleteSession(token) {
  if (!token) return;
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function pruneExpiredSessions() {
  return db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run().changes;
}

// Retention: drop check/event history and screenshot rows older than the
// window so the SQLite file doesn't grow without bound. Returns counts plus
// the on-disk paths of the pruned screenshots, so the caller can unlink them.
export function pruneOldData(retentionDays = 180) {
  const cutoff = `-${Number(retentionDays)} days`;
  const oldShots = db
    .prepare("SELECT id, path FROM screenshots WHERE captured_at < datetime('now', ?)")
    .all(cutoff);
  const delShot = db.prepare("DELETE FROM screenshots WHERE id = ?");

  const result = db.transaction(() => {
    const checks = db.prepare("DELETE FROM checks WHERE checked_at < datetime('now', ?)").run(cutoff).changes;
    const events = db.prepare("DELETE FROM events WHERE occurred_at < datetime('now', ?)").run(cutoff).changes;
    for (const s of oldShots) delShot.run(s.id);
    return { checks, events, screenshots: oldShots.length };
  })();

  return { ...result, screenshotPaths: oldShots.map((s) => s.path) };
}

export function lastCheckTimestamp() {
  const row = db.prepare("SELECT MAX(checked_at) AS t FROM checks").get();
  return row?.t ?? null;
}

export function createMaintenanceWindow({ siteId, note, startsAt, endsAt }) {
  const info = db
    .prepare("INSERT INTO maintenance_windows (site_id, note, starts_at, ends_at) VALUES (?, ?, ?, ?)")
    .run(siteId ?? null, note || null, startsAt, endsAt);
  return db.prepare("SELECT * FROM maintenance_windows WHERE id = ?").get(info.lastInsertRowid);
}

export function listMaintenanceWindows(siteId) {
  if (siteId) {
    return db
      .prepare("SELECT * FROM maintenance_windows WHERE site_id = ? OR site_id IS NULL ORDER BY starts_at DESC")
      .all(siteId);
  }
  return db.prepare("SELECT * FROM maintenance_windows ORDER BY starts_at DESC").all();
}

export function deleteMaintenanceWindow(id) {
  db.prepare("DELETE FROM maintenance_windows WHERE id = ?").run(id);
}

export function isInMaintenanceWindow(siteId) {
  const row = db
    .prepare(
      `SELECT 1 FROM maintenance_windows
       WHERE (site_id = ? OR site_id IS NULL)
         AND datetime('now') BETWEEN starts_at AND ends_at
       LIMIT 1`
    )
    .get(siteId);
  return Boolean(row);
}

export function createPortCheck({ siteId, label, host, port }) {
  const info = db
    .prepare("INSERT INTO port_checks (site_id, label, host, port) VALUES (?, ?, ?, ?)")
    .run(siteId, label, host, port);
  return db.prepare("SELECT * FROM port_checks WHERE id = ?").get(info.lastInsertRowid);
}

export function listPortChecks(siteId) {
  return db.prepare("SELECT * FROM port_checks WHERE site_id = ? ORDER BY id").all(siteId);
}

export function deletePortCheck(id) {
  db.prepare("DELETE FROM port_checks WHERE id = ?").run(id);
}

export function listAllPortChecks() {
  return db
    .prepare(
      `SELECT port_checks.*, sites.name AS site_name, sites.paused AS site_paused
       FROM port_checks JOIN sites ON sites.id = port_checks.site_id`
    )
    .all();
}

/* --- Vulnerabilities (v2 phase A) --- */

export function upsertVulnerability(v) {
  db.prepare(
    `INSERT INTO vulnerabilities
       (source, source_id, plugin_slug, theme_slug, affected_versions, fixed_in, severity, title, description, cve_id, reference_url, published_at)
     VALUES (@source, @source_id, @plugin_slug, @theme_slug, @affected_versions, @fixed_in, @severity, @title, @description, @cve_id, @reference_url, @published_at)
     ON CONFLICT(source, source_id) DO UPDATE SET
       plugin_slug=excluded.plugin_slug, theme_slug=excluded.theme_slug,
       affected_versions=excluded.affected_versions, fixed_in=excluded.fixed_in,
       severity=excluded.severity, title=excluded.title, description=excluded.description,
       cve_id=excluded.cve_id, reference_url=excluded.reference_url,
       published_at=excluded.published_at, fetched_at=datetime('now')`
  ).run({
    source: v.source,
    source_id: v.source_id,
    plugin_slug: v.plugin_slug ?? null,
    theme_slug: v.theme_slug ?? null,
    affected_versions: v.affected_versions,
    fixed_in: v.fixed_in ?? null,
    severity: v.severity ?? "medium",
    title: v.title,
    description: v.description ?? null,
    cve_id: v.cve_id ?? null,
    reference_url: v.reference_url ?? null,
    published_at: v.published_at ?? null,
  });
  return db.prepare("SELECT * FROM vulnerabilities WHERE source = ? AND source_id = ?").get(v.source, v.source_id);
}

export function listVulnerabilitiesForPlugin(pluginSlug) {
  return db.prepare("SELECT * FROM vulnerabilities WHERE plugin_slug = ?").all(pluginSlug);
}

export function deleteVulnerability(id) {
  db.prepare("DELETE FROM vulnerabilities WHERE id = ?").run(id);
}

// Returns true only when this is a *newly active* finding — either first-ever
// detection, or a previously-resolved one that's now affected again. Returns
// false when the finding is already active (so callers don't re-alert). SQLite
// upsert reports changes=1 for both insert and update, so we branch explicitly.
export function recordSiteVulnerability(siteId, vulnerabilityId, installedVersion) {
  const existing = db
    .prepare("SELECT id, resolved_at FROM site_vulnerabilities WHERE site_id = ? AND vulnerability_id = ?")
    .get(siteId, vulnerabilityId);

  if (!existing) {
    db.prepare(
      "INSERT INTO site_vulnerabilities (site_id, vulnerability_id, installed_version) VALUES (?, ?, ?)"
    ).run(siteId, vulnerabilityId, installedVersion ?? null);
    return true;
  }

  const wasResolved = existing.resolved_at != null;
  db.prepare(
    "UPDATE site_vulnerabilities SET installed_version = ?, resolved_at = NULL WHERE id = ?"
  ).run(installedVersion ?? null, existing.id);
  return wasResolved;
}

export function resolveSiteVulnerability(siteId, vulnerabilityId) {
  db.prepare(
    "UPDATE site_vulnerabilities SET resolved_at = datetime('now') WHERE site_id = ? AND vulnerability_id = ? AND resolved_at IS NULL"
  ).run(siteId, vulnerabilityId);
}

export function markSiteVulnerabilityNotified(id) {
  db.prepare("UPDATE site_vulnerabilities SET notified_at = datetime('now') WHERE id = ?").run(id);
}

export function activeSiteVulnerabilities(siteId) {
  return db
    .prepare(
      `SELECT sv.id AS link_id, sv.installed_version, sv.detected_at, v.*
       FROM site_vulnerabilities sv JOIN vulnerabilities v ON v.id = sv.vulnerability_id
       WHERE sv.site_id = ? AND sv.resolved_at IS NULL
       ORDER BY CASE v.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`
    )
    .all(siteId);
}

// Fleet-wide active vulnerabilities, one row per (vuln, site) pair.
export function fleetVulnerabilities() {
  return db
    .prepare(
      `SELECT sv.id AS link_id, sv.site_id, sv.installed_version, sv.detected_at, sv.notified_at,
              s.name AS site_name, v.*
       FROM site_vulnerabilities sv
       JOIN vulnerabilities v ON v.id = sv.vulnerability_id
       JOIN sites s ON s.id = sv.site_id
       WHERE sv.resolved_at IS NULL
       ORDER BY CASE v.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, sv.detected_at DESC`
    )
    .all();
}

/* --- Fleet Learning / Update Guard (v2 phase B) --- */

export function enqueuePendingVerdict({ siteId, pluginSlug, fromVersion, toVersion, eventAt, evaluateAfter }) {
  db.prepare(
    `INSERT INTO pending_verdicts (site_id, plugin_slug, from_version, to_version, event_at, evaluate_after)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(siteId, pluginSlug, fromVersion, toVersion, eventAt, evaluateAfter);
}

export function duePendingVerdicts() {
  return db.prepare("SELECT * FROM pending_verdicts WHERE evaluate_after <= datetime('now')").all();
}

export function deletePendingVerdict(id) {
  db.prepare("DELETE FROM pending_verdicts WHERE id = ?").run(id);
}

// Uptime checks in a window, oldest first. Used to judge a post-update window.
export function checksInWindow(siteId, type, startIso, endIso) {
  return db
    .prepare(
      "SELECT * FROM checks WHERE site_id = ? AND type = ? AND checked_at >= ? AND checked_at < ? ORDER BY checked_at ASC"
    )
    .all(siteId, type, startIso, endIso);
}

export function recordVerdict({ pluginSlug, fromVersion, toVersion, verdict, evidenceSiteIds, notes }) {
  db.prepare(
    `INSERT INTO plugin_update_verdicts (plugin_slug, from_version, to_version, verdict, evidence_site_ids, notes)
     VALUES (@pluginSlug, @fromVersion, @toVersion, @verdict, @evidenceSiteIds, @notes)
     ON CONFLICT(plugin_slug, from_version, to_version) DO UPDATE SET
       verdict=excluded.verdict, evidence_site_ids=excluded.evidence_site_ids,
       notes=excluded.notes, last_updated_at=datetime('now')`
  ).run({
    pluginSlug,
    fromVersion,
    toVersion,
    verdict,
    evidenceSiteIds: JSON.stringify(evidenceSiteIds || []),
    notes: notes || null,
  });
  return db
    .prepare("SELECT * FROM plugin_update_verdicts WHERE plugin_slug = ? AND from_version = ? AND to_version = ?")
    .get(pluginSlug, fromVersion, toVersion);
}

export function getVerdict(pluginSlug, fromVersion, toVersion) {
  return db
    .prepare("SELECT * FROM plugin_update_verdicts WHERE plugin_slug = ? AND from_version = ? AND to_version = ?")
    .get(pluginSlug, fromVersion, toVersion);
}

export function recentBadVerdicts(limit = 50) {
  return db
    .prepare(
      "SELECT * FROM plugin_update_verdicts WHERE verdict IN ('bad','suspicious') ORDER BY last_updated_at DESC LIMIT ?"
    )
    .all(limit)
    .map((v) => ({ ...v, evidence_site_ids: v.evidence_site_ids ? JSON.parse(v.evidence_site_ids) : [] }));
}

export function createHold({ siteId, pluginSlug, targetVersion, reason }) {
  db.prepare(
    `INSERT INTO update_holds (site_id, plugin_slug, target_version, reason)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(site_id, plugin_slug, target_version) DO UPDATE SET
       reason=excluded.reason, released_at=NULL, released_by=NULL, created_at=datetime('now')`
  ).run(siteId, pluginSlug, targetVersion, reason || null);
}

export function activeHold(siteId, pluginSlug, targetVersion) {
  return db
    .prepare(
      "SELECT * FROM update_holds WHERE site_id = ? AND plugin_slug = ? AND target_version = ? AND released_at IS NULL"
    )
    .get(siteId, pluginSlug, targetVersion);
}

export function listSiteHolds(siteId) {
  return db
    .prepare("SELECT * FROM update_holds WHERE site_id = ? AND released_at IS NULL ORDER BY created_at DESC")
    .all(siteId);
}

export function releaseHold(id, releasedBy) {
  db.prepare("UPDATE update_holds SET released_at = datetime('now'), released_by = ? WHERE id = ?").run(
    releasedBy || "admin",
    id
  );
}

// Sites (other than the origin) whose installed version of the plugin equals
// fromVersion — candidates to hold from applying toVersion. Reads the latest
// agent snapshot per site.
export function sitesWithPluginVersion(pluginSlug, version, excludeSiteId) {
  const results = [];
  for (const site of listSites()) {
    if (site.id === excludeSiteId) continue;
    const snap = latestSnapshot(site.id);
    const plugin = snap?.data?.plugins?.find((p) => p.slug === pluginSlug);
    if (plugin && plugin.version === version) results.push(site);
  }
  return results;
}

/* --- MCP access keys (v2 phase C) --- */

export function createMcpKey(name, keyHash) {
  const info = db.prepare("INSERT INTO mcp_api_keys (name, key_hash) VALUES (?, ?)").run(name, keyHash);
  return db.prepare("SELECT id, name, created_at, last_used_at FROM mcp_api_keys WHERE id = ?").get(info.lastInsertRowid);
}

export function listMcpKeys() {
  return db.prepare("SELECT id, name, created_at, last_used_at FROM mcp_api_keys ORDER BY created_at DESC").all();
}

export function deleteMcpKey(id) {
  db.prepare("DELETE FROM mcp_api_keys WHERE id = ?").run(id);
}

export function findMcpKeyByHash(keyHash) {
  return db.prepare("SELECT * FROM mcp_api_keys WHERE key_hash = ?").get(keyHash);
}

export function touchMcpKey(id) {
  db.prepare("UPDATE mcp_api_keys SET last_used_at = datetime('now') WHERE id = ?").run(id);
}
