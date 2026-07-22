import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DB_PATH = path.join(os.tmpdir(), `site-monitor-incident-test-${process.pid}-${Date.now()}.db`);
// Deterministic thresholds (also the defaults, set explicitly for clarity).
process.env.INCIDENT_CONFIRM_CHECKS = "2";
process.env.INCIDENT_FLAP_THRESHOLD = "3";
process.env.INCIDENT_FLAP_WINDOW_MIN = "30";

const { createSite, recordCheck, getOpenIncident, siteIncidents } = await import("../db.js");
const { processCheckResult } = await import("../incident/index.js");

// Mirror the scheduler: record the check row, then run the engine.
async function check(site, up) {
  recordCheck(site.id, { type: "uptime", ok: up });
  return processCheckResult(site, { type: "uptime", up, downCause: "HTTP 500", recoveryDetail: "100ms" });
}

test("a single failure does not open an incident (confirmation guard)", async () => {
  const site = createSite({ name: "one-blip", url: "https://blip.example.com", apiKey: "inc-1" });
  const action = await check(site, false);
  assert.equal(action, "confirming");
  assert.equal(getOpenIncident(site.id, "uptime"), undefined);
});

test("two consecutive failures open one confirmed incident", async () => {
  const site = createSite({ name: "down", url: "https://down.example.com", apiKey: "inc-2" });
  assert.equal(await check(site, false), "confirming");
  assert.equal(await check(site, false), "opened");
  const open = getOpenIncident(site.id, "uptime");
  assert.ok(open);
  assert.equal(open.status, "open");
  assert.equal(open.type, "uptime");
});

test("further failures escalate the same incident (dedup, no second open)", async () => {
  const site = createSite({ name: "still-down", url: "https://still.example.com", apiKey: "inc-3" });
  await check(site, false);
  await check(site, false); // opened
  assert.equal(await check(site, false), "escalated");
  assert.equal(await check(site, false), "escalated");
  const all = siteIncidents(site.id);
  assert.equal(all.filter((i) => i.status !== "resolved").length, 1);
  assert.equal(getOpenIncident(site.id, "uptime").failure_count, 3); // 1 at open + 2 escalations
});

test("recovery resolves the open incident", async () => {
  const site = createSite({ name: "recovers", url: "https://rec.example.com", apiKey: "inc-4" });
  await check(site, false);
  await check(site, false); // opened
  assert.equal(await check(site, true), "resolved");
  assert.equal(getOpenIncident(site.id, "uptime"), undefined);
  const [latest] = siteIncidents(site.id);
  assert.equal(latest.status, "resolved");
  assert.ok(latest.resolved_at);
});

test("a site that opens incidents repeatedly is flagged as flapping", async () => {
  const site = createSite({ name: "flapper", url: "https://flap.example.com", apiKey: "inc-5" });
  // three open→resolve cycles put three incidents in the window
  for (let i = 0; i < 3; i++) {
    await check(site, false);
    await check(site, false); // open
    await check(site, true); // resolve
  }
  // the fourth outage should now be marked flapping
  await check(site, false);
  await check(site, false); // open #4
  const open = getOpenIncident(site.id, "uptime");
  assert.equal(open.flapping, 1);
});

test.after(() => {
  fs.rmSync(process.env.DB_PATH, { force: true });
  fs.rmSync(`${process.env.DB_PATH}-wal`, { force: true });
  fs.rmSync(`${process.env.DB_PATH}-shm`, { force: true });
});
