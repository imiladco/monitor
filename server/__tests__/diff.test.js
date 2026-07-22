import { test } from "node:test";
import assert from "node:assert/strict";
import { diffSnapshot } from "../diff.js";

test("diffSnapshot: no events on identical snapshots", () => {
  const snap = {
    wpVersion: "6.5",
    theme: { name: "Astra", version: "1.0" },
    plugins: [{ slug: "woo", name: "WooCommerce", version: "8.0", active: true }],
    users: [{ id: 1, login: "admin", roles: ["administrator"] }],
    dbSizeMb: 100,
  };
  assert.deepEqual(diffSnapshot(snap, snap), []);
});

test("diffSnapshot: detects core update", () => {
  const events = diffSnapshot({ wpVersion: "6.5" }, { wpVersion: "6.5.1" });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "core_update");
});

test("diffSnapshot: detects new plugin, update, and removal", () => {
  const prev = {
    plugins: [
      { slug: "a", name: "A", version: "1.0", active: true },
      { slug: "b", name: "B", version: "1.0", active: true },
    ],
  };
  const next = {
    plugins: [
      { slug: "a", name: "A", version: "1.1", active: true },
      { slug: "c", name: "C", version: "1.0", active: true },
    ],
  };
  const events = diffSnapshot(prev, next);
  const types = events.map((e) => e.type).sort();
  assert.deepEqual(types, ["plugin_installed", "plugin_removed", "plugin_update"]);
});

test("diffSnapshot: new admin user is critical", () => {
  const prev = { users: [{ id: 1, login: "admin", roles: ["administrator"] }] };
  const next = {
    users: [
      { id: 1, login: "admin", roles: ["administrator"] },
      { id: 2, login: "hacker99", roles: ["administrator"] },
    ],
  };
  const events = diffSnapshot(prev, next);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "admin_user_created");
  assert.equal(events[0].severity, "critical");
});

test("diffSnapshot: new non-admin user does not alert", () => {
  const prev = { users: [{ id: 1, login: "admin", roles: ["administrator"] }] };
  const next = {
    users: [
      { id: 1, login: "admin", roles: ["administrator"] },
      { id: 2, login: "customer", roles: ["customer"] },
    ],
  };
  assert.deepEqual(diffSnapshot(prev, next), []);
});

test("diffSnapshot: db growth above threshold warns, below does not", () => {
  const big = diffSnapshot({ dbSizeMb: 100 }, { dbSizeMb: 200 });
  assert.equal(big.length, 1);
  assert.equal(big[0].type, "db_growth");

  const small = diffSnapshot({ dbSizeMb: 100 }, { dbSizeMb: 105 });
  assert.deepEqual(small, []);
});

test("diffSnapshot: newly modified core file is critical", () => {
  const prev = { coreIntegrity: { modifiedFiles: [] } };
  const next = { coreIntegrity: { modifiedFiles: [{ file: "wp-includes/functions.php", issue: "modified" }] } };
  const events = diffSnapshot(prev, next);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "core_integrity");
  assert.equal(events[0].severity, "critical");
});

test("diffSnapshot: already-known modified core file does not re-alert", () => {
  const modified = [{ file: "wp-includes/functions.php", issue: "modified" }];
  const prev = { coreIntegrity: { modifiedFiles: modified } };
  const next = { coreIntegrity: { modifiedFiles: modified } };
  assert.deepEqual(diffSnapshot(prev, next), []);
});

test("diffSnapshot: no prior snapshot treats every plugin as newly installed", () => {
  const next = { plugins: [{ slug: "a", name: "A", version: "1.0", active: true }] };
  const events = diffSnapshot(undefined, next);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "plugin_installed");
});
