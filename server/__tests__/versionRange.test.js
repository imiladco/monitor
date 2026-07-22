import { test } from "node:test";
import assert from "node:assert/strict";
import { versionInRange, compareVersions } from "../vuln/versionRange.js";

test("compareVersions handles missing trailing segments as zero", () => {
  assert.equal(compareVersions("1.2", "1.2.0"), 0);
  assert.equal(compareVersions("1.2.1", "1.2"), 1);
  assert.equal(compareVersions("1.2", "1.10"), -1); // numeric, not lexicographic
  assert.equal(compareVersions("2.0", "1.9.9"), 1);
});

test("versionInRange: <= bound", () => {
  assert.equal(versionInRange("5.5", "<= 5.5"), true);
  assert.equal(versionInRange("5.5.1", "<= 5.5"), false);
  assert.equal(versionInRange("5.4.9", "<= 5.5"), true);
});

test("versionInRange: >= and > bounds", () => {
  assert.equal(versionInRange("3.0", ">= 3.0"), true);
  assert.equal(versionInRange("2.9", ">= 3.0"), false);
  assert.equal(versionInRange("3.0", "> 3.0"), false);
  assert.equal(versionInRange("3.0.1", "> 3.0"), true);
});

test("versionInRange: compound range (both must hold)", () => {
  assert.equal(versionInRange("3.6.1", ">= 3.6.0 < 3.6.3"), true);
  assert.equal(versionInRange("3.6.3", ">= 3.6.0 < 3.6.3"), false); // fixed_in excluded
  assert.equal(versionInRange("3.5.9", ">= 3.6.0 < 3.6.3"), false);
});

test("versionInRange: wildcard", () => {
  assert.equal(versionInRange("1.2.7", "1.2.*"), true);
  assert.equal(versionInRange("1.3.0", "1.2.*"), false);
  assert.equal(versionInRange("1.2", "1.2.*"), true);
});

test("versionInRange: single exact version", () => {
  assert.equal(versionInRange("4.1", "4.1"), true);
  assert.equal(versionInRange("4.1.0", "4.1"), true);
  assert.equal(versionInRange("4.1.1", "4.1"), false);
});

test("versionInRange: compact operators without spaces", () => {
  assert.equal(versionInRange("5.5", "<=5.5"), true);
  assert.equal(versionInRange("3.6.1", ">=3.6.0<3.6.3"), true);
});

test("versionInRange: empty/invalid inputs are safe", () => {
  assert.equal(versionInRange("", "<= 5.5"), false);
  assert.equal(versionInRange("1.0", ""), false);
  assert.equal(versionInRange(null, null), false);
});
