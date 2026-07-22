import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRateLimiter } from "../rateLimit.js";

function mockReq(ip = "1.2.3.4") {
  return { ip, socket: { remoteAddress: ip } };
}

function mockRes() {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.headers = {};
  res.set = (k, v) => {
    res.headers[k] = v;
    return res;
  };
  res.status = (c) => {
    res.statusCode = c;
    return res;
  };
  res.json = (b) => {
    res.body = b;
    return res;
  };
  return res;
}

function run(limiter, ip, { finishStatus } = {}) {
  const req = mockReq(ip);
  const res = mockRes();
  let nextCalled = false;
  limiter(req, res, () => (nextCalled = true));
  if (nextCalled && finishStatus != null) {
    res.statusCode = finishStatus;
    res.emit("finish");
  }
  return { res, nextCalled };
}

test("blocks after max requests within the window", () => {
  const limiter = createRateLimiter({ windowMs: 60000, max: 3 });
  for (let i = 0; i < 3; i++) assert.equal(run(limiter, "10.0.0.1").nextCalled, true);
  const blocked = run(limiter, "10.0.0.1");
  assert.equal(blocked.nextCalled, false);
  assert.equal(blocked.res.statusCode, 429);
  assert.ok(blocked.res.headers["Retry-After"]);
});

test("limits are per-IP", () => {
  const limiter = createRateLimiter({ windowMs: 60000, max: 1 });
  assert.equal(run(limiter, "10.0.0.1").nextCalled, true);
  assert.equal(run(limiter, "10.0.0.1").nextCalled, false);
  assert.equal(run(limiter, "10.0.0.2").nextCalled, true); // different IP unaffected
});

test("skipSuccessfulRequests: only failures count toward the limit", () => {
  const limiter = createRateLimiter({ windowMs: 60000, max: 2, skipSuccessfulRequests: true });
  // Ten successful logins in a row must not exhaust the limit.
  for (let i = 0; i < 10; i++) assert.equal(run(limiter, "10.0.0.9", { finishStatus: 200 }).nextCalled, true);
  // Two failures are allowed, the third is blocked.
  assert.equal(run(limiter, "10.0.0.9", { finishStatus: 401 }).nextCalled, true);
  assert.equal(run(limiter, "10.0.0.9", { finishStatus: 401 }).nextCalled, true);
  assert.equal(run(limiter, "10.0.0.9").nextCalled, false);
});

test("window resets after it elapses", () => {
  let now = 1_000_000;
  const realNow = Date.now;
  Date.now = () => now;
  try {
    const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
    assert.equal(run(limiter, "10.0.0.5").nextCalled, true);
    assert.equal(run(limiter, "10.0.0.5").nextCalled, false);
    now += 1001; // window elapsed
    assert.equal(run(limiter, "10.0.0.5").nextCalled, true);
  } finally {
    Date.now = realNow;
  }
});
