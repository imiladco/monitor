import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DB_PATH = path.join(os.tmpdir(), `site-monitor-test-${process.pid}-${Date.now()}.db`);

const {
  db,
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
  createCommand,
  listCommands,
  claimPendingCommands,
  completeCommand,
  recoverStuckCommands,
  getSiteByApiKey,
  regenerateSiteApiKey,
  listClients,
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

test("commands: queue, claim (moves pending->running, idempotent), and complete", () => {
  const site = createSite({ name: "Command Site", url: "https://command.example.com", apiKey: "key12" });
  const cmd = createCommand({ siteId: site.id, type: "update_plugin", params: { slug: "woocommerce" } });
  assert.equal(cmd.status, "pending");
  assert.deepEqual(JSON.parse(cmd.params), { slug: "woocommerce" });

  const claimed = claimPendingCommands(site.id);
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].id, cmd.id);
  assert.equal(claimed[0].status, "running");
  assert.deepEqual(claimed[0].params, { slug: "woocommerce" });

  // a second poll shouldn't re-claim the same (now-running) command
  assert.equal(claimPendingCommands(site.id).length, 0);

  const changed = completeCommand(cmd.id, site.id, "done", "updated to 9.0");
  assert.equal(changed, 1);
  const history = listCommands(site.id);
  assert.equal(history[0].status, "done");
  assert.equal(history[0].result, "updated to 9.0");
  assert.ok(history[0].completed_at);
});

test("completeCommand is scoped to the owning site (no cross-site completion)", () => {
  const owner = createSite({ name: "Owner", url: "https://owner.example.com", apiKey: "key-owner" });
  const attacker = createSite({ name: "Attacker", url: "https://attacker.example.com", apiKey: "key-attacker" });
  const cmd = createCommand({ siteId: owner.id, type: "update_plugin", params: null });
  claimPendingCommands(owner.id);

  // Another site's agent guessing the id can't complete it.
  assert.equal(completeCommand(cmd.id, attacker.id, "done", "hijacked"), 0);
  assert.equal(listCommands(owner.id)[0].status, "running");

  // The real owner can.
  assert.equal(completeCommand(cmd.id, owner.id, "done", "ok"), 1);

  // ...but only while it's running — a second completion is a no-op.
  assert.equal(completeCommand(cmd.id, owner.id, "done", "again"), 0);
});

test("recoverStuckCommands requeues only leases older than the window", () => {
  const site = createSite({ name: "Stuck Site", url: "https://stuck.example.com", apiKey: "key-stuck" });
  const fresh = createCommand({ siteId: site.id, type: "noop", params: null });
  const stale = createCommand({ siteId: site.id, type: "noop", params: null });
  claimPendingCommands(site.id); // both -> running, claimed_at = now

  // Backdate one claim well past the lease.
  db.prepare("UPDATE commands SET claimed_at = datetime('now', '-30 minutes') WHERE id = ?").run(stale.id);

  const recovered = recoverStuckCommands(15);
  assert.equal(recovered, 1);
  assert.equal(listCommands(site.id).find((c) => c.id === stale.id).status, "pending");
  assert.equal(listCommands(site.id).find((c) => c.id === fresh.id).status, "running");
});

test("agent keys are stored hashed: raw key resolves, but is never persisted in plaintext", () => {
  const raw = "raw-agent-secret-xyz";
  const site = createSite({ name: "Keyed", url: "https://keyed.example.com", apiKey: raw });

  // The agent authenticates with the raw key.
  assert.equal(getSiteByApiKey(raw)?.id, site.id);
  // The plaintext is nowhere in the row; the stored column is the SHA-256 hash.
  const stored = db.prepare("SELECT api_key FROM sites WHERE id = ?").get(site.id).api_key;
  assert.notEqual(stored, raw);
  assert.match(stored, /^[a-f0-9]{64}$/);
});

test("regenerateSiteApiKey rotates the key: new one works, old one stops", () => {
  const raw = "first-key";
  const site = createSite({ name: "Rotate", url: "https://rotate.example.com", apiKey: raw });
  assert.equal(getSiteByApiKey(raw)?.id, site.id);

  const newKey = regenerateSiteApiKey(site.id);
  assert.match(newKey, /^[a-f0-9]{48}$/);
  assert.equal(getSiteByApiKey(newKey)?.id, site.id);
  assert.equal(getSiteByApiKey(raw), undefined); // old key no longer valid
  assert.equal(regenerateSiteApiKey(999999), null); // unknown site
});

test("getSiteByApiKey ignores empty/missing keys", () => {
  assert.equal(getSiteByApiKey(""), undefined);
  assert.equal(getSiteByApiKey(null), undefined);
  assert.equal(getSiteByApiKey(undefined), undefined);
});

test("listClients returns distinct, sorted, non-empty client names", () => {
  createSite({ name: "Client Site 1", url: "https://c1.example.com", apiKey: "key13", client: "Acme" });
  createSite({ name: "Client Site 2", url: "https://c2.example.com", apiKey: "key14", client: "Acme" });
  createSite({ name: "Client Site 3", url: "https://c3.example.com", apiKey: "key15", client: "Beta Co" });
  createSite({ name: "No Client Site", url: "https://c4.example.com", apiKey: "key16" });

  assert.deepEqual(listClients(), ["Acme", "Beta Co"]);
});

test("updateSite can set and clear the client field", () => {
  const site = createSite({ name: "Reassignable", url: "https://reassign.example.com", apiKey: "key17" });
  updateSite(site.id, { name: "Reassignable", url: "https://reassign.example.com", client: "Gamma" });
  assert.equal(listSites().find((s) => s.id === site.id).client, "Gamma");

  updateSite(site.id, { name: "Reassignable", url: "https://reassign.example.com", client: "" });
  assert.equal(listSites().find((s) => s.id === site.id).client, null);
});

test.after(() => {
  fs.rmSync(process.env.DB_PATH, { force: true });
  fs.rmSync(`${process.env.DB_PATH}-wal`, { force: true });
  fs.rmSync(`${process.env.DB_PATH}-shm`, { force: true });
});
