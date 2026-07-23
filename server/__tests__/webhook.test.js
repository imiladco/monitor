import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DB_PATH = path.join(os.tmpdir(), `site-monitor-webhook-test-${process.pid}-${Date.now()}.db`);

const { db, setSetting } = await import("../db.js");
const { sendWebhook } = await import("../notify/webhook.js");

let server;
let received = [];
let base;

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received.push({ url: req.url, body: body ? JSON.parse(body) : null });
      res.writeHead(req.url === "/fail" ? 500 : 200);
      res.end("ok");
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  db.close();
  for (const ext of ["", "-wal", "-shm"]) fs.rmSync(process.env.DB_PATH + ext, { force: true });
});

test("skips when no webhook_url is configured", async () => {
  setSetting("webhook_url", "");
  const r = await sendWebhook({ text: "hi" });
  assert.equal(r.skipped, true);
});

test("posts stripped-HTML JSON to the configured URL", async () => {
  received = [];
  setSetting("webhook_url", `${base}/hook`);
  const r = await sendWebhook({ text: "<b>Site</b> is down", category: "status", severity: "critical" });
  assert.equal(r.ok, true);
  assert.equal(received.length, 1);
  assert.equal(received[0].url, "/hook");
  assert.equal(received[0].body.text, "Site is down"); // HTML stripped
  assert.equal(received[0].body.category, "status");
  assert.equal(received[0].body.source, "site-monitor");
});

test("reports a non-2xx as failure without throwing", async () => {
  setSetting("webhook_url", `${base}/fail`);
  const r = await sendWebhook({ text: "x" });
  assert.equal(r.ok, false);
  assert.match(r.error, /HTTP 500/);
});
