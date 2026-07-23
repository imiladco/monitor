import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveDns } from "../checks/dns.js";

test("resolveDns returns sorted A records for localhost", async () => {
  const r = await resolveDns("localhost");
  // localhost resolves to a loopback A and/or AAAA depending on the host.
  assert.ok(Array.isArray(r.a) && Array.isArray(r.aaaa));
  assert.ok(Array.isArray(r.ns) && Array.isArray(r.mx));
  if (r.a.length) assert.ok(r.a.includes("127.0.0.1"));
});

test("resolveDns returns empty arrays for an unresolvable name (never throws)", async () => {
  const r = await resolveDns("no-such-host.invalid");
  assert.deepEqual(r, { a: [], aaaa: [], ns: [], mx: [] });
});

test("resolveDns sorts records order-independently", async () => {
  const r = await resolveDns("localhost");
  const sorted = [...r.a].sort();
  assert.deepEqual(r.a, sorted);
});
