import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { checkUptime } from "../checks/uptime.js";

let server;
let base;

before(async () => {
  server = http.createServer((req, res) => {
    if (req.url === "/json") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ data: { errors: null, ok: true } }));
    }
    if (req.url === "/teapot") {
      res.writeHead(418);
      return res.end("short and stout");
    }
    if (req.url === "/slow") {
      return setTimeout(() => {
        res.writeHead(200);
        res.end("eventually");
      }, 80);
    }
    if (req.url === "/echo" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      return req.on("end", () => {
        res.writeHead(200);
        res.end(`got:${body}`);
      });
    }
    if (req.url === "/auth") {
      if (req.headers.authorization !== "Basic " + Buffer.from("u:p").toString("base64")) {
        res.writeHead(401);
        return res.end("no");
      }
      res.writeHead(200);
      return res.end("welcome");
    }
    res.writeHead(200);
    res.end("<html>hello world</html>");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

test("expectedStatus treats a non-2xx as up when it matches", async () => {
  const r = await checkUptime(`${base}/teapot`, { expectedStatus: "418" });
  assert.equal(r.up, true);
  assert.equal(r.statusCode, 418);
});

test("expectedStatus marks a mismatch down", async () => {
  const r = await checkUptime(`${base}/`, { expectedStatus: "500-599" });
  assert.equal(r.up, false);
  assert.match(r.error, /خارج از محدوده/);
});

test("keyword regex assertion", async () => {
  const ok = await checkUptime(`${base}/`, { keyword: "hello\\s+world", keywordIsRegex: true });
  assert.equal(ok.up, true);
  const bad = await checkUptime(`${base}/`, { keyword: "^goodbye$", keywordIsRegex: true });
  assert.equal(bad.up, false);
});

test("JSON path assertion (absent) — errors must not exist", async () => {
  // errors is present (null) → 'absent' assertion should fail
  const r = await checkUptime(`${base}/json`, { jsonAssert: { path: "data.errors", mode: "absent" } });
  assert.equal(r.up, false);
  // a truly missing path passes 'absent'
  const ok = await checkUptime(`${base}/json`, { jsonAssert: { path: "data.missing", mode: "absent" } });
  assert.equal(ok.up, true);
});

test("JSON path assertion (exists)", async () => {
  const r = await checkUptime(`${base}/json`, { jsonAssert: { path: "data.ok", mode: "exists" } });
  assert.equal(r.up, true);
});

test("POST with body reaches the server", async () => {
  const r = await checkUptime(`${base}/echo`, { method: "POST", body: "ping", keyword: "got:ping" });
  assert.equal(r.up, true);
});

test("basic auth header is sent", async () => {
  const r = await checkUptime(`${base}/auth`, { basicAuth: { user: "u", pass: "p" }, keyword: "welcome" });
  assert.equal(r.up, true);
});

test("maxResponseMs assertion fails an over-budget response", async () => {
  const r = await checkUptime(`${base}/slow`, { maxResponseMs: 10 });
  assert.equal(r.up, false);
  assert.match(r.error, /زمان پاسخ/);
});
