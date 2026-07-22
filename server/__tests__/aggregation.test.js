import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DB_PATH = path.join(os.tmpdir(), `site-monitor-agg-test-${process.pid}-${Date.now()}.db`);

const { db, createSite, recordCheck, aggregateUptimeDaily, getUptimeDaily, dbFileSizeBytes } = await import("../db.js");

test("aggregateUptimeDaily rolls up checks into per-day uptime %", () => {
  const site = createSite({ name: "agg", url: "https://agg.example.com", apiKey: "agg-1" });
  // 8 up, 2 down today
  for (let i = 0; i < 8; i++) recordCheck(site.id, { type: "uptime", ok: true, responseMs: 100 });
  for (let i = 0; i < 2; i++) recordCheck(site.id, { type: "uptime", ok: false });

  const n = aggregateUptimeDaily();
  assert.ok(n >= 1);
  const rows = getUptimeDaily(site.id, 7);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].total_checks, 10);
  assert.equal(rows[0].up_checks, 8);
  assert.equal(rows[0].uptime_pct, 80);
  assert.equal(rows[0].avg_response_ms, 100); // avg of the up checks
});

test("aggregateUptimeDaily is idempotent (upsert refreshes the same day)", () => {
  const site = createSite({ name: "agg2", url: "https://agg2.example.com", apiKey: "agg-2" });
  for (let i = 0; i < 5; i++) recordCheck(site.id, { type: "uptime", ok: true, responseMs: 50 });
  aggregateUptimeDaily();
  // add more checks and re-run — the row updates rather than duplicating
  for (let i = 0; i < 5; i++) recordCheck(site.id, { type: "uptime", ok: false });
  aggregateUptimeDaily();
  const rows = getUptimeDaily(site.id, 7);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].total_checks, 10);
  assert.equal(rows[0].uptime_pct, 50);
});

test("dbFileSizeBytes returns a positive size", () => {
  assert.ok(dbFileSizeBytes() > 0);
});

test.after(() => {
  db.close();
  fs.rmSync(process.env.DB_PATH, { force: true });
  fs.rmSync(`${process.env.DB_PATH}-wal`, { force: true });
  fs.rmSync(`${process.env.DB_PATH}-shm`, { force: true });
});
