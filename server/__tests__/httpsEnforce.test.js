import { test } from "node:test";
import assert from "node:assert/strict";

import { createHttpsEnforce } from "../httpsEnforce.js";

const loadWith = async (forceHttps) => createHttpsEnforce(forceHttps);

function mockReq({ secure = false, method = "GET", host = "panel.example.com", originalUrl = "/api/sites" } = {}) {
  return { secure, method, headers: { host }, originalUrl };
}
function mockRes() {
  const res = { statusCode: 200, headers: {}, redirectedTo: null };
  res.set = (k, v) => ((res.headers[k] = v), res);
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  res.redirect = (code, loc) => ((res.statusCode = code), (res.redirectedTo = loc), res);
  return res;
}

test("no-op when FORCE_HTTPS is off", async () => {
  const mw = await loadWith(false);
  const res = mockRes();
  let next = false;
  mw(mockReq({ secure: false }), res, () => (next = true));
  assert.equal(next, true);
  assert.equal(res.redirectedTo, null);
  assert.equal(res.headers["Strict-Transport-Security"], undefined);
});

test("redirects insecure GET to https with 308", async () => {
  const mw = await loadWith(true);
  const res = mockRes();
  mw(mockReq({ secure: false, method: "GET", originalUrl: "/settings" }), res, () => {});
  assert.equal(res.statusCode, 308);
  assert.equal(res.redirectedTo, "https://panel.example.com/settings");
});

test("403s insecure non-GET instead of replaying it", async () => {
  const mw = await loadWith(true);
  const res = mockRes();
  let next = false;
  mw(mockReq({ secure: false, method: "POST" }), res, () => (next = true));
  assert.equal(res.statusCode, 403);
  assert.equal(next, false);
});

test("passes secure requests through and sets HSTS", async () => {
  const mw = await loadWith(true);
  const res = mockRes();
  let next = false;
  mw(mockReq({ secure: true }), res, () => (next = true));
  assert.equal(next, true);
  assert.match(res.headers["Strict-Transport-Security"], /max-age=31536000/);
});
