import { test } from "node:test";
import assert from "node:assert/strict";
import { MonitorClient } from "../client.js";
import { tools } from "../tools/index.js";

// A fake fetch that records the URL/headers and returns a canned body.
function fakeFetch(expectedBodyByPath) {
  const calls = [];
  const impl = async (url, opts) => {
    calls.push({ url, opts });
    const pathAndQuery = url.replace(/^.*\/api\/mcp/, "");
    const body = expectedBodyByPath[pathAndQuery] ?? { ok: true, echoedPath: pathAndQuery };
    return { ok: true, status: 200, json: async () => body };
  };
  impl.calls = calls;
  return impl;
}

test("MonitorClient requires baseUrl and apiKey", () => {
  assert.throws(() => new MonitorClient({ apiKey: "k" }), /MONITOR_BASE_URL/);
  assert.throws(() => new MonitorClient({ baseUrl: "http://x" }), /MONITOR_API_KEY/);
});

test("MonitorClient sends the bearer token and hits /api/mcp", async () => {
  const impl = fakeFetch({});
  const client = new MonitorClient({ baseUrl: "http://mon.test/", apiKey: "secret", fetchImpl: impl });
  await client.get("/sites");
  assert.equal(impl.calls[0].url, "http://mon.test/api/mcp/sites");
  assert.equal(impl.calls[0].opts.headers.Authorization, "Bearer secret");
});

test("MonitorClient surfaces a 401 as an unauthorized error", async () => {
  const impl = async () => ({ ok: false, status: 401, json: async () => ({}) });
  const client = new MonitorClient({ baseUrl: "http://mon.test", apiKey: "bad", fetchImpl: impl });
  await assert.rejects(() => client.get("/sites"), /unauthorized/);
});

test("every tool has a name, description, and handler", () => {
  for (const t of tools) {
    assert.ok(t.name, "tool missing name");
    assert.ok(t.description, `${t.name} missing description`);
    assert.equal(typeof t.handler, "function", `${t.name} handler not a function`);
  }
  // the fixed set from the spec (get_error_logs intentionally excluded)
  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, [
    "get_fleet_summary",
    "get_incidents",
    "get_plugin_across_fleet",
    "get_site_details",
    "get_timeline",
    "get_uptime_history",
    "get_vulnerabilities",
    "list_sites",
    "search_across_fleet",
  ]);
});

test("get_site_details builds the right path", async () => {
  const impl = fakeFetch({ "/sites/7": { id: 7, label: "Seven" } });
  const client = new MonitorClient({ baseUrl: "http://mon.test", apiKey: "k", fetchImpl: impl });
  const tool = tools.find((t) => t.name === "get_site_details");
  const out = await tool.handler(client, { site_id: 7 });
  assert.equal(out.label, "Seven");
  assert.equal(impl.calls[0].url, "http://mon.test/api/mcp/sites/7");
});

test("search_across_fleet composes the query string from structured args", async () => {
  const impl = fakeFetch({});
  const client = new MonitorClient({ baseUrl: "http://mon.test", apiKey: "k", fetchImpl: impl });
  const tool = tools.find((t) => t.name === "search_across_fleet");
  await tool.handler(client, { plugin: "woocommerce" });
  assert.match(impl.calls[0].url, /\/search\?plugin=woocommerce$/);
  await tool.handler(client, { ssl_within_days: 7 });
  assert.match(impl.calls[1].url, /\/search\?ssl_within_days=7$/);
});

test("get_uptime_history passes the days param", async () => {
  const impl = fakeFetch({});
  const client = new MonitorClient({ baseUrl: "http://mon.test", apiKey: "k", fetchImpl: impl });
  const tool = tools.find((t) => t.name === "get_uptime_history");
  await tool.handler(client, { site_id: 3, days: 30 });
  assert.equal(impl.calls[0].url, "http://mon.test/api/mcp/sites/3/uptime?days=30");
});
