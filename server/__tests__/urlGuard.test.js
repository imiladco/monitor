import { test } from "node:test";
import assert from "node:assert/strict";
import { isBlockedUrl, ipIsPrivate } from "../checks/urlGuard.js";

test("ipIsPrivate flags loopback, private, link-local and metadata ranges", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.1", "172.16.5.5", "172.31.255.255", "169.254.169.254", "100.64.0.1", "0.0.0.0"]) {
    assert.equal(ipIsPrivate(ip), true, `${ip} should be private`);
  }
});

test("ipIsPrivate allows public v4 addresses (incl. 172.32/8 and 100.128/9)", () => {
  for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "172.15.0.1", "100.128.0.1"]) {
    assert.equal(ipIsPrivate(ip), false, `${ip} should be public`);
  }
});

test("ipIsPrivate handles IPv6 loopback, ULA, link-local and v4-mapped", () => {
  assert.equal(ipIsPrivate("::1"), true);
  assert.equal(ipIsPrivate("fe80::1"), true);
  assert.equal(ipIsPrivate("fd00::1"), true);
  assert.equal(ipIsPrivate("::ffff:127.0.0.1"), true);
  assert.equal(ipIsPrivate("2606:4700:4700::1111"), false);
});

test("isBlockedUrl blocks internal literal-IP targets", async () => {
  for (const url of [
    "http://127.0.0.1:4000/api/sites",
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.5/",
    "https://192.168.1.1/admin",
    "http://[::1]:4000/",
  ]) {
    assert.equal(await isBlockedUrl(url), true, `${url} should be blocked`);
  }
});

test("isBlockedUrl allows public literal-IP targets", async () => {
  assert.equal(await isBlockedUrl("https://8.8.8.8/"), false);
  assert.equal(await isBlockedUrl("http://1.1.1.1/"), false);
});

test("isBlockedUrl blocks non-http(s) schemes and garbage", async () => {
  assert.equal(await isBlockedUrl("file:///etc/passwd"), true);
  assert.equal(await isBlockedUrl("ftp://example.com/"), true);
  assert.equal(await isBlockedUrl("not a url"), true);
});
