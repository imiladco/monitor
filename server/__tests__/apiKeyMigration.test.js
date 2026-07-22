import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";

// Simulate an existing install: a DB that already has a site row with a
// PLAINTEXT api_key and no "agent_keys_hashed" marker. Importing db.js must
// hash it in place, and the original raw key must still authenticate.
const DB_PATH = path.join(os.tmpdir(), `site-monitor-keymig-test-${process.pid}-${Date.now()}.db`);
const RAW_KEY = "legacy-plaintext-key-123";

const seed = new Database(DB_PATH);
seed.exec(`
  CREATE TABLE sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    checkout_url TEXT,
    api_key TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
`);
seed.prepare("INSERT INTO sites (name, url, api_key) VALUES ('Legacy', 'https://legacy.example.com', ?)").run(RAW_KEY);
seed.close();

process.env.DB_PATH = DB_PATH;
const { getSiteByApiKey, db } = await import("../db.js");

test("existing plaintext key is hashed in place on first load", () => {
  const stored = db.prepare("SELECT api_key FROM sites WHERE url = 'https://legacy.example.com'").get().api_key;
  const expected = crypto.createHash("sha256").update(RAW_KEY).digest("hex");
  assert.equal(stored, expected);
  assert.notEqual(stored, RAW_KEY);
});

test("the original raw key still authenticates after migration", () => {
  const site = getSiteByApiKey(RAW_KEY);
  assert.ok(site);
  assert.equal(site.url, "https://legacy.example.com");
});

test("migration marker is set so it doesn't run twice", () => {
  assert.equal(db.prepare("SELECT value FROM settings WHERE key = 'agent_keys_hashed'").get().value, "1");
});

test.after(() => {
  fs.rmSync(DB_PATH, { force: true });
  fs.rmSync(`${DB_PATH}-wal`, { force: true });
  fs.rmSync(`${DB_PATH}-shm`, { force: true });
});
