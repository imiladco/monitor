import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.ADMIN_PASSWORD = "test-secret-password";
process.env.DB_PATH = path.join(os.tmpdir(), `site-monitor-auth-test-${process.pid}-${Date.now()}.db`);

const { requireAdmin } = await import("../auth.js");
const { createSession } = await import("../db.js");
const { SESSION_COOKIE, newSessionToken } = await import("../session.js");

function mockReq({ cookie = null } = {}) {
  return { headers: cookie ? { cookie } : {} };
}

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

test("requireAdmin rejects a request with no session cookie", () => {
  const res = mockRes();
  let nextCalled = false;
  requireAdmin(mockReq(), res, () => (nextCalled = true));
  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});

test("requireAdmin rejects an unknown/forged session token", () => {
  const res = mockRes();
  let nextCalled = false;
  requireAdmin(mockReq({ cookie: `${SESSION_COOKIE}=not-a-real-token` }), res, () => (nextCalled = true));
  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});

test("requireAdmin accepts a valid, unexpired session cookie", () => {
  const token = newSessionToken();
  createSession(token, 1);
  const res = mockRes();
  let nextCalled = false;
  requireAdmin(mockReq({ cookie: `other=x; ${SESSION_COOKIE}=${token}` }), res, () => (nextCalled = true));
  assert.equal(nextCalled, true);
});

test("requireAdmin rejects an expired session cookie", () => {
  const token = newSessionToken();
  createSession(token, -1); // already expired
  const res = mockRes();
  let nextCalled = false;
  requireAdmin(mockReq({ cookie: `${SESSION_COOKIE}=${token}` }), res, () => (nextCalled = true));
  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});

test.after(() => {
  fs.rmSync(process.env.DB_PATH, { force: true });
  fs.rmSync(`${process.env.DB_PATH}-wal`, { force: true });
  fs.rmSync(`${process.env.DB_PATH}-shm`, { force: true });
});
