import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DB_PATH = path.join(os.tmpdir(), `site-monitor-fleet-test-${process.pid}-${Date.now()}.db`);
// no telegram configured -> notifySite is a no-op

const { db, createSite, saveSnapshot } = await import("../db.js");
const { evaluatePendingVerdicts, updateCheck } = await import("../fleet/index.js");

// Helpers to seed checks/pending rows at explicit timestamps.
function insertCheck(siteId, offsetMinFromNow, { ok = true, responseMs = 200, statusCode = 200 } = {}) {
  const when = new Date(Date.now() + offsetMinFromNow * 60000).toISOString().slice(0, 19).replace("T", " ");
  db.prepare(
    "INSERT INTO checks (site_id, type, ok, response_ms, status_code, checked_at) VALUES (?, 'uptime', ?, ?, ?, ?)"
  ).run(siteId, ok ? 1 : 0, responseMs, statusCode, when);
}

function queueDueVerdict(siteId, slug, from, to, eventOffsetMin) {
  const eventAt = new Date(Date.now() + eventOffsetMin * 60000).toISOString().slice(0, 19).replace("T", " ");
  const evaluateAfter = new Date(Date.now() - 60000).toISOString().slice(0, 19).replace("T", " "); // already due
  db.prepare(
    "INSERT INTO pending_verdicts (site_id, plugin_slug, from_version, to_version, event_at, evaluate_after) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(siteId, slug, from, to, eventAt, evaluateAfter);
}

test("a clean update (no downtime, stable response) is judged safe", async () => {
  const site = createSite({ name: "clean", url: "https://clean.example.com", apiKey: "fk1" });
  for (let m = -60; m < 0; m += 5) insertCheck(site.id, m, { ok: true, responseMs: 200 }); // before
  for (let m = 1; m <= 60; m += 5) insertCheck(site.id, m, { ok: true, responseMs: 210 }); // after
  queueDueVerdict(site.id, "elementor", "3.6.0", "3.6.1", 0);

  await evaluatePendingVerdicts();
  const v = db.prepare("SELECT * FROM plugin_update_verdicts WHERE plugin_slug='elementor'").get();
  assert.equal(v.verdict, "safe");
});

test("an update followed by downtime is judged bad and holds other sites", async () => {
  const origin = createSite({ name: "origin", url: "https://origin.example.com", apiKey: "fk2" });
  // another site still on the vulnerable from_version -> should get a hold
  const other = createSite({ name: "other", url: "https://other.example.com", apiKey: "fk3" });
  saveSnapshot(other.id, { plugins: [{ slug: "badplugin", name: "Bad", version: "1.0", active: true }] });

  for (let m = -60; m < 0; m += 5) insertCheck(origin.id, m, { ok: true, responseMs: 200 }); // healthy before
  for (let m = 1; m <= 60; m += 5) insertCheck(origin.id, m, { ok: false, statusCode: 500 }); // broken after
  queueDueVerdict(origin.id, "badplugin", "1.0", "2.0", 0);

  await evaluatePendingVerdicts();

  const v = db.prepare("SELECT * FROM plugin_update_verdicts WHERE plugin_slug='badplugin'").get();
  assert.equal(v.verdict, "bad");

  const hold = db
    .prepare("SELECT * FROM update_holds WHERE site_id = ? AND plugin_slug='badplugin' AND released_at IS NULL")
    .get(other.id);
  assert.ok(hold, "expected a hold on the other site");
  assert.equal(hold.target_version, "2.0");
});

test("updateCheck reflects the hold for the agent's pre-update query", async () => {
  const other = db.prepare("SELECT * FROM sites WHERE name='other'").get();
  const result = updateCheck(other.id, "badplugin", "1.0", "2.0");
  assert.equal(result.hold, true);
  assert.equal(result.verdict, "bad");
  assert.ok(result.reason);
});

test("updateCheck returns unknown/no-hold for an unseen upgrade path", () => {
  const site = createSite({ name: "fresh", url: "https://fresh.example.com", apiKey: "fk4" });
  const result = updateCheck(site.id, "neverseen", "1.0", "1.1");
  assert.equal(result.verdict, "unknown");
  assert.equal(result.hold, false);
});

test("a severe slowdown (>2x) without downtime is judged suspicious", async () => {
  const site = createSite({ name: "slow", url: "https://slow.example.com", apiKey: "fk5" });
  for (let m = -60; m < 0; m += 5) insertCheck(site.id, m, { ok: true, responseMs: 150 });
  for (let m = 1; m <= 60; m += 5) insertCheck(site.id, m, { ok: true, responseMs: 500 }); // >2x
  queueDueVerdict(site.id, "slowplugin", "1.0", "1.1", 0);

  await evaluatePendingVerdicts();
  const v = db.prepare("SELECT * FROM plugin_update_verdicts WHERE plugin_slug='slowplugin'").get();
  assert.equal(v.verdict, "suspicious");
});

test("the pending queue is drained after evaluation", async () => {
  const remaining = db.prepare("SELECT COUNT(*) AS n FROM pending_verdicts").get();
  assert.equal(remaining.n, 0);
});

test.after(() => {
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${process.env.DB_PATH}${suffix}`, { force: true });
});
