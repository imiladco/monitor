import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DB_PATH = path.join(os.tmpdir(), `site-monitor-vuln-test-${process.pid}-${Date.now()}.db`);

const {
  createSite,
  saveSnapshot,
  upsertVulnerability,
  activeSiteVulnerabilities,
  fleetVulnerabilities,
} = await import("../db.js");
const { matchSite } = await import("../vuln/index.js");

function siteWithPlugins(name, plugins) {
  const site = createSite({ name, url: `https://${name}.example.com`, apiKey: `k-${name}` });
  saveSnapshot(site.id, { plugins });
  return site;
}

test("matchSite detects a vulnerable installed plugin version", () => {
  upsertVulnerability({
    source: "local",
    source_id: "test-woo-1",
    plugin_slug: "woocommerce",
    affected_versions: ">= 3.3 <= 5.5",
    fixed_in: "5.5.1",
    severity: "critical",
    title: "Woo test vuln",
  });

  const site = siteWithPlugins("vulnerable", [{ slug: "woocommerce", name: "WooCommerce", version: "5.4", active: true }]);
  const detected = matchSite(site);
  assert.equal(detected.length, 1);
  assert.equal(detected[0].vuln.plugin_slug, "woocommerce");

  const active = activeSiteVulnerabilities(site.id);
  assert.equal(active.length, 1);
  assert.equal(active[0].installed_version, "5.4");
});

test("matchSite ignores a patched (out-of-range) version", () => {
  const site = siteWithPlugins("patched", [{ slug: "woocommerce", name: "WooCommerce", version: "5.5.1", active: true }]);
  const detected = matchSite(site);
  assert.equal(detected.length, 0);
  assert.equal(activeSiteVulnerabilities(site.id).length, 0);
});

test("matchSite is idempotent — re-running doesn't re-report the same finding", () => {
  const site = siteWithPlugins("idempotent", [{ slug: "woocommerce", name: "WooCommerce", version: "5.4", active: true }]);
  assert.equal(matchSite(site).length, 1); // first run detects
  assert.equal(matchSite(site).length, 0); // second run: already recorded
  assert.equal(activeSiteVulnerabilities(site.id).length, 1);
});

test("matchSite auto-resolves a finding once the plugin is updated past the range", () => {
  const site = siteWithPlugins("upgrading", [{ slug: "woocommerce", name: "WooCommerce", version: "5.4", active: true }]);
  assert.equal(matchSite(site).length, 1);
  assert.equal(activeSiteVulnerabilities(site.id).length, 1);

  // simulate the agent reporting an upgraded version
  saveSnapshot(site.id, { plugins: [{ slug: "woocommerce", name: "WooCommerce", version: "5.6", active: true }] });
  matchSite(site);
  assert.equal(activeSiteVulnerabilities(site.id).length, 0);
});

test("fleetVulnerabilities aggregates active findings across sites", () => {
  const before = fleetVulnerabilities().length;
  siteWithPlugins("fleet-a", [{ slug: "woocommerce", name: "WooCommerce", version: "5.4", active: true }]);
  // matched via matchSite in the detect test path
  const siteB = siteWithPlugins("fleet-b", [{ slug: "woocommerce", name: "WooCommerce", version: "4.0", active: true }]);
  matchSite(siteB);
  assert.ok(fleetVulnerabilities().length > before);
});

test.after(() => {
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${process.env.DB_PATH}${suffix}`, { force: true });
});
