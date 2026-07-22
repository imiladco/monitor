import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DB_PATH = path.join(os.tmpdir(), `site-monitor-mcp-test-${process.pid}-${Date.now()}.db`);

const { createMcpKey, listMcpKeys, deleteMcpKey, findMcpKeyByHash, touchMcpKey } = await import("../db.js");
const { hashMcpKey, requireMcpKey } = await import("../mcpAuth.js");

function mockReq(authHeader) {
  return { header: (name) => (name === "Authorization" ? authHeader : null) };
}
function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  return res;
}

test("createMcpKey stores only the hash; raw key never persisted", () => {
  const raw = "mcp_secret_abc";
  const rec = createMcpKey("laptop", hashMcpKey(raw));
  assert.ok(rec.id);
  assert.equal(rec.name, "laptop");
  // the stored record has no plaintext key field
  assert.equal(rec.key, undefined);
  // but the hash is findable
  assert.ok(findMcpKeyByHash(hashMcpKey(raw)));
  assert.equal(findMcpKeyByHash(hashMcpKey("wrong")), undefined);
});

test("requireMcpKey rejects missing/invalid, accepts a valid bearer", () => {
  const raw = "mcp_valid_key_xyz";
  createMcpKey("ci", hashMcpKey(raw));

  let res = mockRes();
  requireMcpKey(mockReq(null), res, () => assert.fail("should not call next"));
  assert.equal(res.statusCode, 401);

  res = mockRes();
  requireMcpKey(mockReq("Bearer nope"), res, () => assert.fail("should not call next"));
  assert.equal(res.statusCode, 401);

  res = mockRes();
  let called = false;
  requireMcpKey(mockReq(`Bearer ${raw}`), res, () => (called = true));
  assert.equal(called, true);
});

test("touchMcpKey updates last_used_at", () => {
  const raw = "mcp_touch_key";
  const rec = createMcpKey("touch", hashMcpKey(raw));
  assert.equal(rec.last_used_at, null);
  touchMcpKey(rec.id);
  const after = listMcpKeys().find((k) => k.id === rec.id);
  assert.ok(after.last_used_at);
});

test("deleteMcpKey revokes access", () => {
  const raw = "mcp_revoke_key";
  const rec = createMcpKey("revoke", hashMcpKey(raw));
  deleteMcpKey(rec.id);
  assert.equal(findMcpKeyByHash(hashMcpKey(raw)), undefined);
});

test.after(() => {
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${process.env.DB_PATH}${suffix}`, { force: true });
});
