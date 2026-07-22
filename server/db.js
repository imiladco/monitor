import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = path.resolve("data/monitor.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

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

CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  captured_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_snapshots_site_time ON snapshots(site_id, captured_at);
`);

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

export function createSite({ name, url, checkoutUrl, apiKey }) {
  const info = db
    .prepare("INSERT INTO sites (name, url, checkout_url, api_key) VALUES (?, ?, ?, ?)")
    .run(name, url, checkoutUrl || null, apiKey);
  return db.prepare("SELECT * FROM sites WHERE id = ?").get(info.lastInsertRowid);
}

export function updateSite(id, { name, url, checkoutUrl }) {
  db.prepare("UPDATE sites SET name = ?, url = ?, checkout_url = ? WHERE id = ?").run(
    name,
    url,
    checkoutUrl || null,
    id
  );
  return db.prepare("SELECT * FROM sites WHERE id = ?").get(id);
}

export function deleteSite(id) {
  db.prepare("DELETE FROM sites WHERE id = ?").run(id);
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
