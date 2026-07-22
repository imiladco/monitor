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
  uptimePercent,
  getSetting,
  setSetting,
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

test.after(() => {
  fs.rmSync(process.env.DB_PATH, { force: true });
  fs.rmSync(`${process.env.DB_PATH}-wal`, { force: true });
  fs.rmSync(`${process.env.DB_PATH}-shm`, { force: true });
});
