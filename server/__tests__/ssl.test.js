import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import tls from "node:tls";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { checkSsl } from "../checks/ssl.js";

let server;
let port;
let haveCert = false;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ssl-test-"));

before(async () => {
  try {
    const key = path.join(dir, "k.pem");
    const cert = path.join(dir, "c.pem");
    execFileSync("openssl", [
      "req", "-x509", "-newkey", "rsa:2048", "-keyout", key, "-out", cert,
      "-days", "3650", "-nodes", "-subj", "/O=Test Org/CN=localhost",
      "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1",
    ], { stdio: "ignore" });
    server = tls.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, (s) => s.end());
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    port = server.address().port;
    haveCert = true;
  } catch (err) {
    haveCert = false; // openssl unavailable — tests below skip
    if (process.env.SSL_TEST_DEBUG) console.error("ssl test setup failed:", err);
  }
});

after(() => {
  server?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("checkSsl returns rich cert metadata", async (t) => {
  if (!haveCert) return t.skip("openssl unavailable");
  const r = await checkSsl("localhost", port);
  assert.equal(r.ok, true);
  assert.equal(r.issuer, "Test Org");
  assert.equal(r.subject, "localhost");
  assert.match(r.tlsVersion, /^TLS/);
  assert.ok(r.fingerprint && r.fingerprint.includes(":"));
  assert.ok(r.daysLeft > 3000);
});

test("checkSsl flags a self-signed cert as unauthorized (chain invalid, not a hostname mismatch)", async (t) => {
  if (!haveCert) return t.skip("openssl unavailable");
  const r = await checkSsl("localhost", port);
  assert.equal(r.authorized, false);
  assert.equal(r.hostnameMismatch, false);
  assert.ok(r.authorizationError);
});

test("checkSsl reports an error for an unreachable port", async () => {
  const r = await checkSsl("127.0.0.1", 1); // nothing listening
  assert.equal(r.ok, false);
  assert.ok(r.error);
});
