import { test } from "node:test";
import assert from "node:assert/strict";

process.env.ADMIN_PASSWORD = "test-secret-password";
const { requireAdmin } = await import("../auth.js");

function mockReq({ header = null, query = {} } = {}) {
  return { header: () => header, query };
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

test("requireAdmin rejects a missing password", () => {
  const res = mockRes();
  let nextCalled = false;
  requireAdmin(mockReq(), res, () => (nextCalled = true));
  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});

test("requireAdmin rejects a wrong password", () => {
  const res = mockRes();
  let nextCalled = false;
  requireAdmin(mockReq({ header: "wrong" }), res, () => (nextCalled = true));
  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});

test("requireAdmin accepts the correct password via header", () => {
  const res = mockRes();
  let nextCalled = false;
  requireAdmin(mockReq({ header: "test-secret-password" }), res, () => (nextCalled = true));
  assert.equal(nextCalled, true);
});

test("requireAdmin accepts the correct password via query string (for <img> tags)", () => {
  const res = mockRes();
  let nextCalled = false;
  requireAdmin(mockReq({ query: { pw: "test-secret-password" } }), res, () => (nextCalled = true));
  assert.equal(nextCalled, true);
});
