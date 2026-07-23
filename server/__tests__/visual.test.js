import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { diffImage } from "../checks/visualDiff.js";

function solidPng(width, height, [r, g, b]) {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    png.data[i * 4] = r;
    png.data[i * 4 + 1] = g;
    png.data[i * 4 + 2] = b;
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

test("diffImage returns 0% and a buffer for identical images", () => {
  const a = solidPng(10, 10, [255, 0, 0]);
  const r = diffImage(a, a);
  assert.equal(r.percent, 0);
  assert.ok(Buffer.isBuffer(r.diffBuffer));
});

test("diffImage returns ~100% for fully different images", () => {
  const red = solidPng(10, 10, [255, 0, 0]);
  const blue = solidPng(10, 10, [0, 0, 255]);
  const r = diffImage(red, blue);
  assert.ok(r.percent > 90);
});

test("diffImage returns null when dimensions differ", () => {
  assert.equal(diffImage(solidPng(10, 10, [0, 0, 0]), solidPng(20, 10, [0, 0, 0])), null);
});

// Exercise the runner's baseline + approve logic with capture stubbed out.
test("visual runner seeds a baseline then diffs and approves", async (t) => {
  const dbPath = path.join(os.tmpdir(), `visual-test-${process.pid}-${Date.now()}.db`);
  process.env.DB_PATH = dbPath;
  const cwd = process.cwd();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "visual-work-"));
  process.chdir(work); // data/visual is resolved relative to cwd

  const red = solidPng(20, 20, [255, 0, 0]);
  const blue = solidPng(20, 20, [0, 0, 255]);
  let nextBuffer = red;
  const fakeCapture = async () => ({ ok: true, buffer: nextBuffer });

  const db = await import("../db.js");
  const visual = await import("../visual.js");

  const site = db.createSite({ name: "vis", url: "https://vis.example.com", apiKey: "vis-1" });
  const target = db.createVisualTarget({ siteId: site.id, label: "home", url: site.url, threshold: 10 });

  // first capture → becomes baseline, no diff yet
  await visual.captureVisualTarget(db.getVisualTarget(target.id), site, fakeCapture);
  let cur = db.getVisualTarget(target.id);
  assert.ok(cur.baseline_path && fs.existsSync(cur.baseline_path));
  assert.equal(cur.last_diff, null);

  // second capture with a different image → large diff recorded
  nextBuffer = blue;
  await visual.captureVisualTarget(db.getVisualTarget(target.id), site, fakeCapture);
  cur = db.getVisualTarget(target.id);
  assert.ok(cur.last_diff > 90);

  // approve the latest as the new baseline → subsequent diff is 0
  assert.equal(visual.approveBaseline(target.id), true);
  await visual.captureVisualTarget(db.getVisualTarget(target.id), site, fakeCapture);
  cur = db.getVisualTarget(target.id);
  assert.equal(cur.last_diff, 0);

  db.db.close();
  process.chdir(cwd);
  for (const ext of ["", "-wal", "-shm"]) fs.rmSync(dbPath + ext, { force: true });
  fs.rmSync(work, { recursive: true, force: true });
});
