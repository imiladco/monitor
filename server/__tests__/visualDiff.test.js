import { test } from "node:test";
import assert from "node:assert/strict";
import { PNG } from "pngjs";
import { diffPercent } from "../checks/visualDiff.js";

function solidPng(width, height, [r, g, b]) {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = r;
    png.data[i + 1] = g;
    png.data[i + 2] = b;
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

test("diffPercent: identical images have 0% diff", () => {
  const a = solidPng(20, 20, [10, 10, 10]);
  const b = solidPng(20, 20, [10, 10, 10]);
  assert.equal(diffPercent(a, b), 0);
});

test("diffPercent: completely different images report ~100% diff", () => {
  const a = solidPng(20, 20, [0, 0, 0]);
  const b = solidPng(20, 20, [255, 255, 255]);
  assert.ok(diffPercent(a, b) > 95);
});

test("diffPercent: mismatched dimensions return null", () => {
  const a = solidPng(20, 20, [0, 0, 0]);
  const b = solidPng(30, 30, [0, 0, 0]);
  assert.equal(diffPercent(a, b), null);
});
