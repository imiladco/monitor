import { test } from "node:test";
import assert from "node:assert/strict";
import { generateSecret, verifyToken, otpauthUrl } from "../totp.js";

// RFC 6238 SHA1 test vector: secret "12345678901234567890" (ASCII) base32-encoded,
// at T=59 seconds (counter=1) the expected code is 287082.
test("verifyToken matches the RFC 6238 SHA1 test vector", () => {
  const asciiSecret = "12345678901234567890";
  const base32Secret = base32EncodeForTest(Buffer.from(asciiSecret, "ascii"));

  const originalNow = Date.now;
  Date.now = () => 59 * 1000;
  try {
    assert.equal(verifyToken(base32Secret, "287082"), true);
    assert.equal(verifyToken(base32Secret, "000000"), false);
  } finally {
    Date.now = originalNow;
  }
});

test("generateSecret produces a usable base32 secret round-trippable by verifyToken", () => {
  const secret = generateSecret();
  assert.match(secret, /^[A-Z2-7]+$/);
  // A freshly generated secret shouldn't happen to match a fixed wrong code.
  assert.equal(verifyToken(secret, "123456") === true, false);
});

test("otpauthUrl embeds the secret and issuer", () => {
  const url = otpauthUrl("ABCDEFGH", { label: "admin", issuer: "SiteMonitor" });
  assert.match(url, /^otpauth:\/\/totp\//);
  assert.ok(url.includes("secret=ABCDEFGH"));
  assert.ok(url.includes("SiteMonitor"));
});

function base32EncodeForTest(buffer) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  let output = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) output += alphabet[parseInt(bits.slice(i, i + 5), 2)];
  const remainder = bits.length % 5;
  if (remainder) output += alphabet[parseInt(bits.slice(-remainder).padEnd(5, "0"), 2)];
  return output;
}
