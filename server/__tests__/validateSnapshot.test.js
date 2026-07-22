import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSnapshot } from "../validateSnapshot.js";

test("rejects non-object payloads", () => {
  assert.equal(validateSnapshot(null).ok, false);
  assert.equal(validateSnapshot("nope").ok, false);
  assert.equal(validateSnapshot(42).ok, false);
  assert.equal(validateSnapshot([]).ok, false);
});

test("passes a well-formed snapshot through, preserving diff-relevant fields", () => {
  const { ok, snapshot } = validateSnapshot({
    wpVersion: "6.5.2",
    theme: { name: "Astra", version: "4.1" },
    plugins: [{ slug: "woocommerce", name: "WooCommerce", version: "9.0", active: true }],
    users: [{ id: 1, login: "admin", roles: ["administrator"] }],
    dbSizeMb: 120.5,
  });
  assert.equal(ok, true);
  assert.equal(snapshot.wpVersion, "6.5.2");
  assert.deepEqual(snapshot.theme, { name: "Astra", version: "4.1" });
  assert.deepEqual(snapshot.plugins[0], { slug: "woocommerce", name: "WooCommerce", version: "9.0", active: true });
  assert.equal(snapshot.users[0].login, "admin");
  assert.deepEqual(snapshot.users[0].roles, ["administrator"]);
  assert.equal(snapshot.dbSizeMb, 120.5);
});

test("rejects oversized plugin and user arrays", () => {
  const plugins = Array.from({ length: 501 }, (_, i) => ({ slug: `p${i}`, version: "1" }));
  assert.equal(validateSnapshot({ plugins }).ok, false);
  const users = Array.from({ length: 2001 }, (_, i) => ({ id: i }));
  assert.equal(validateSnapshot({ users }).ok, false);
});

test("rejects wrong types for array/object fields", () => {
  assert.equal(validateSnapshot({ plugins: "x" }).ok, false);
  assert.equal(validateSnapshot({ users: {} }).ok, false);
  assert.equal(validateSnapshot({ theme: "x" }).ok, false);
  assert.equal(validateSnapshot({ coreIntegrity: "x" }).ok, false);
  assert.equal(validateSnapshot({ updatesAvailable: {} }).ok, false);
});

test("truncates overlong strings and coerces plugin.active to boolean", () => {
  const long = "x".repeat(1000);
  const { snapshot } = validateSnapshot({
    plugins: [{ slug: long, name: long, version: long, active: "yes" }],
  });
  assert.equal(snapshot.plugins[0].slug.length, 128);
  assert.equal(snapshot.plugins[0].version.length, 32);
  assert.equal(snapshot.plugins[0].active, true);
});

test("drops unknown keys and coerces bad numbers to null", () => {
  const { snapshot } = validateSnapshot({ evil: "payload", dbSizeMb: "not-a-number" });
  assert.equal("evil" in snapshot, false);
  assert.equal(snapshot.dbSizeMb, null);
});

test("normalizes coreIntegrity modified files with caps", () => {
  const { snapshot } = validateSnapshot({
    coreIntegrity: {
      modifiedFiles: [{ file: "wp-load.php", issue: "modified" }],
      checkedAt: "2026-01-01",
    },
  });
  assert.deepEqual(snapshot.coreIntegrity.modifiedFiles[0], { file: "wp-load.php", issue: "modified" });
  assert.equal(snapshot.coreIntegrity.checkedAt, "2026-01-01");
});
