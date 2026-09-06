import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePageSpeed } from "../checks/pagespeed.js";

const fixture = {
  lighthouseResult: {
    categories: { performance: { score: 0.72 } },
    audits: {
      "first-contentful-paint": { numericValue: 1234.6 },
      "largest-contentful-paint": { numericValue: 2500.2 },
      "total-blocking-time": { numericValue: 180 },
      "speed-index": { numericValue: 3100.9 },
      "interactive": { numericValue: 3600 },
      "cumulative-layout-shift": { numericValue: 0.0456 },
    },
  },
};

test("parsePageSpeed extracts score (0-100) and rounded lab metrics", () => {
  const r = parsePageSpeed(fixture, "mobile");
  assert.equal(r.ok, true);
  assert.equal(r.strategy, "mobile");
  assert.equal(r.score, 72);
  assert.equal(r.fcpMs, 1235);
  assert.equal(r.lcpMs, 2500);
  assert.equal(r.tbtMs, 180);
  assert.equal(r.siMs, 3101);
  assert.equal(r.ttiMs, 3600);
  assert.equal(r.cls, 0.046);
});

test("parsePageSpeed errors on a response without lighthouseResult", () => {
  assert.equal(parsePageSpeed({}).ok, false);
  assert.equal(parsePageSpeed({ error: { message: "quota" } }).ok, false);
});

test("parsePageSpeed tolerates missing individual audits", () => {
  const r = parsePageSpeed({ lighthouseResult: { categories: { performance: { score: 1 } }, audits: {} } });
  assert.equal(r.score, 100);
  assert.equal(r.lcpMs, null);
  assert.equal(r.cls, null);
});
