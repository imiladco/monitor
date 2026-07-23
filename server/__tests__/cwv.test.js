import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DB_PATH = path.join(os.tmpdir(), `site-monitor-cwv-test-${process.pid}-${Date.now()}.db`);

const { db, createSite, recordScreenshot, latestScreenshot, vitalsHistory } = await import("../db.js");

test("recordScreenshot persists extended vitals (FCP, TBT, resources)", () => {
  const site = createSite({ name: "cwv", url: "https://cwv.example.com", apiKey: "cwv-1" });
  recordScreenshot(site.id, {
    path: "/x.png",
    diffPercent: null,
    lcpMs: 2400,
    cls: 0.05,
    ttfbMs: 300,
    fcpMs: 1200,
    tbtMs: 180,
    resources: { count: 42, bytes: 1048576, js: 500000, css: 100000, img: 400000, other: 48576 },
  });
  const shot = latestScreenshot(site.id);
  assert.equal(shot.fcp_ms, 1200);
  assert.equal(shot.tbt_ms, 180);
  const resources = JSON.parse(shot.resources);
  assert.equal(resources.count, 42);
  assert.equal(resources.js, 500000);
});

test("vitalsHistory includes the new metrics", () => {
  const site = createSite({ name: "cwv2", url: "https://cwv2.example.com", apiKey: "cwv-2" });
  recordScreenshot(site.id, { path: "/y.png", lcpMs: 1000, cls: 0, ttfbMs: 100, fcpMs: 800, tbtMs: 20 });
  const [row] = vitalsHistory(site.id);
  assert.equal(row.fcp_ms, 800);
  assert.equal(row.tbt_ms, 20);
});

test("recordScreenshot still works without the extended fields (back-compat)", () => {
  const site = createSite({ name: "cwv3", url: "https://cwv3.example.com", apiKey: "cwv-3" });
  recordScreenshot(site.id, { path: "/z.png", lcpMs: 900, cls: 0, ttfbMs: 90 });
  const shot = latestScreenshot(site.id);
  assert.equal(shot.fcp_ms, null);
  assert.equal(shot.resources, null);
});

test.after(() => {
  db.close();
  fs.rmSync(process.env.DB_PATH, { force: true });
  fs.rmSync(`${process.env.DB_PATH}-wal`, { force: true });
  fs.rmSync(`${process.env.DB_PATH}-shm`, { force: true });
});
