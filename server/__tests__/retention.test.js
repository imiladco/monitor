import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DB_PATH = path.join(os.tmpdir(), `site-monitor-retention-test-${process.pid}-${Date.now()}.db`);

const { db, createSite, recordCheck, recordEvent, recordScreenshot, pruneOldData } = await import("../db.js");

function lastId(table, siteId) {
  return db.prepare(`SELECT MAX(id) id FROM ${table} WHERE site_id = ?`).get(siteId).id;
}
function backdate(table, timeCol, id, daysAgo) {
  db.prepare(`UPDATE ${table} SET ${timeCol} = datetime('now', ?) WHERE id = ?`).run(`-${daysAgo} days`, id);
}

test("pruneOldData drops rows older than the window and keeps recent ones", () => {
  const site = createSite({ name: "R", url: "https://r.example.com", apiKey: "r-key" });

  recordCheck(site.id, { type: "uptime", ok: true });
  const oldCheckId = lastId("checks", site.id);
  recordCheck(site.id, { type: "uptime", ok: true });
  backdate("checks", "checked_at", oldCheckId, 200);

  recordEvent(site.id, { type: "x", title: "old", severity: "info" });
  const oldEventId = lastId("events", site.id);
  recordEvent(site.id, { type: "x", title: "new", severity: "info" });
  backdate("events", "occurred_at", oldEventId, 200);

  const res = pruneOldData(180);
  assert.equal(res.checks, 1);
  assert.equal(res.events, 1);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM checks WHERE site_id = ?").get(site.id).c, 1);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM events WHERE site_id = ?").get(site.id).c, 1);
});

test("pruneOldData returns paths of pruned screenshots for unlinking", () => {
  const site = createSite({ name: "S", url: "https://s.example.com", apiKey: "s-key" });
  recordScreenshot(site.id, { path: "/data/screenshots/old.png", diffPercent: null });
  const shotId = lastId("screenshots", site.id);
  backdate("screenshots", "captured_at", shotId, 300);

  const res = pruneOldData(180);
  assert.equal(res.screenshots, 1);
  assert.deepEqual(res.screenshotPaths, ["/data/screenshots/old.png"]);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM screenshots WHERE site_id = ?").get(site.id).c, 0);
});

test.after(() => {
  fs.rmSync(process.env.DB_PATH, { force: true });
  fs.rmSync(`${process.env.DB_PATH}-wal`, { force: true });
  fs.rmSync(`${process.env.DB_PATH}-shm`, { force: true });
});
