import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DB_PATH = path.join(os.tmpdir(), `site-monitor-test-${process.pid}-${Date.now()}.db`);

const {
  createSite,
  updateSite,
  deleteSite,
  listSites,
  setSitePaused,
  setSitePublic,
  listPublicSites,
  recordCheck,
  recordEvent,
  uptimePercent,
  downtimeIncidents,
  getSetting,
  setSetting,
  createMaintenanceWindow,
  listMaintenanceWindows,
  deleteMaintenanceWindow,
  isInMaintenanceWindow,
  createPortCheck,
  listPortChecks,
  deletePortCheck,
  listAllPortChecks,
} = await import("../db.js");

test("createSite + listSites round-trip", () => {
  const site = createSite({ name: "Test Site", url: "https://example.com", apiKey: "key1" });
  const sites = listSites();
  assert.equal(sites.length, 1);
  assert.equal(sites[0].id, site.id);
  assert.equal(sites[0].name, "Test Site");
  assert.equal(sites[0].paused, 0);
  assert.equal(sites[0].public, 0);
});

test("updateSite changes fields", () => {
  const site = createSite({ name: "Old Name", url: "https://old.example.com", apiKey: "key2" });
  updateSite(site.id, { name: "New Name", url: "https://new.example.com", keyword: "hi", keywordMode: "present" });
  const updated = listSites().find((s) => s.id === site.id);
  assert.equal(updated.name, "New Name");
  assert.equal(updated.keyword, "hi");
});

test("setSitePaused / setSitePublic toggle correctly", () => {
  const site = createSite({ name: "Toggle Site", url: "https://toggle.example.com", apiKey: "key3" });
  setSitePaused(site.id, true);
  setSitePublic(site.id, true);
  const updated = listSites().find((s) => s.id === site.id);
  assert.equal(updated.paused, 1);
  assert.equal(updated.public, 1);
  assert.ok(listPublicSites().some((s) => s.id === site.id));

  setSitePublic(site.id, false);
  assert.ok(!listPublicSites().some((s) => s.id === site.id));
});

test("deleteSite removes it", () => {
  const site = createSite({ name: "Delete Me", url: "https://delete.example.com", apiKey: "key4" });
  deleteSite(site.id);
  assert.ok(!listSites().some((s) => s.id === site.id));
});

test("uptimePercent computes correctly from recorded checks", () => {
  const site = createSite({ name: "Uptime Site", url: "https://uptime.example.com", apiKey: "key5" });
  for (let i = 0; i < 8; i++) recordCheck(site.id, { type: "uptime", ok: true });
  for (let i = 0; i < 2; i++) recordCheck(site.id, { type: "uptime", ok: false });
  assert.equal(uptimePercent(site.id, 7), 80);
});

test("uptimePercent returns null with no check history", () => {
  const site = createSite({ name: "No Checks", url: "https://nochecks.example.com", apiKey: "key6" });
  assert.equal(uptimePercent(site.id, 7), null);
});

test("getSetting / setSetting round-trip and fallback", () => {
  assert.equal(getSetting("nonexistent_key", "fallback"), "fallback");
  setSetting("my_key", "my_value");
  assert.equal(getSetting("my_key", "fallback"), "my_value");
});

test("downtimeIncidents pairs down/up events into incidents with duration", () => {
  const site = createSite({ name: "Incident Site", url: "https://incident.example.com", apiKey: "key7" });
  recordEvent(site.id, { type: "uptime_change", title: "down", severity: "critical" });
  recordEvent(site.id, { type: "uptime_change", title: "up", severity: "info" });
  const incidents = downtimeIncidents(site.id, 7);
  assert.equal(incidents.length, 1);
  assert.ok(incidents[0].startedAt);
  assert.ok(incidents[0].endedAt);
});

test("downtimeIncidents leaves an unresolved down event open-ended", () => {
  const site = createSite({ name: "Still Down Site", url: "https://stilldown.example.com", apiKey: "key8" });
  recordEvent(site.id, { type: "uptime_change", title: "down", severity: "critical" });
  const incidents = downtimeIncidents(site.id, 7);
  assert.equal(incidents.length, 1);
  assert.equal(incidents[0].endedAt, null);
});

test("maintenance windows: global window applies to any site, site-specific only to its own", () => {
  const siteA = createSite({ name: "Site A", url: "https://a.example.com", apiKey: "key9" });
  const siteB = createSite({ name: "Site B", url: "https://b.example.com", apiKey: "key10" });

  const past = { startsAt: "2000-01-01 00:00:00", endsAt: "2000-01-01 01:00:00" };
  const future = { startsAt: "2999-01-01 00:00:00", endsAt: "2999-01-01 01:00:00" };
  const activeWindow = {
    startsAt: new Date(Date.now() - 60000).toISOString().slice(0, 19).replace("T", " "),
    endsAt: new Date(Date.now() + 60000).toISOString().slice(0, 19).replace("T", " "),
  };

  assert.equal(isInMaintenanceWindow(siteA.id), false);

  const globalWindow = createMaintenanceWindow({ siteId: null, note: "global", ...activeWindow });
  assert.equal(isInMaintenanceWindow(siteA.id), true);
  assert.equal(isInMaintenanceWindow(siteB.id), true);
  deleteMaintenanceWindow(globalWindow.id);
  assert.equal(isInMaintenanceWindow(siteA.id), false);

  const siteWindow = createMaintenanceWindow({ siteId: siteA.id, note: "site-only", ...activeWindow });
  assert.equal(isInMaintenanceWindow(siteA.id), true);
  assert.equal(isInMaintenanceWindow(siteB.id), false);

  createMaintenanceWindow({ siteId: siteA.id, note: "past", ...past });
  createMaintenanceWindow({ siteId: siteA.id, note: "future", ...future });
  const windows = listMaintenanceWindows(siteA.id);
  assert.equal(windows.length, 3);

  deleteMaintenanceWindow(siteWindow.id);
});

test("port checks: create, list, delete", () => {
  const site = createSite({ name: "Port Site", url: "https://port.example.com", apiKey: "key11" });
  const check = createPortCheck({ siteId: site.id, label: "MySQL", host: "127.0.0.1", port: 3306 });
  assert.equal(listPortChecks(site.id).length, 1);
  assert.ok(listAllPortChecks().some((p) => p.id === check.id && p.site_name === "Port Site"));
  deletePortCheck(check.id);
  assert.equal(listPortChecks(site.id).length, 0);
});

test.after(() => {
  fs.rmSync(process.env.DB_PATH, { force: true });
  fs.rmSync(`${process.env.DB_PATH}-wal`, { force: true });
  fs.rmSync(`${process.env.DB_PATH}-shm`, { force: true });
});
