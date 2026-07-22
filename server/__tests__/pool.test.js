import { test } from "node:test";
import assert from "node:assert/strict";
import { runPool } from "../pool.js";

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

test("never exceeds the concurrency limit", async () => {
  let active = 0;
  let peak = 0;
  await runPool(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
    active += 1;
    peak = Math.max(peak, active);
    await tick();
    active -= 1;
  });
  assert.ok(peak <= 4, `peak was ${peak}`);
});

test("returns results in input order", async () => {
  const out = await runPool([1, 2, 3, 4], 2, async (n) => {
    await tick(n % 2 ? 10 : 1); // finish out of order
    return n * 10;
  });
  assert.deepEqual(out.map((r) => r.value), [10, 20, 30, 40]);
});

test("captures per-item errors without rejecting the whole run", async () => {
  const out = await runPool([1, 2, 3], 3, async (n) => {
    if (n === 2) throw new Error("boom");
    return n;
  });
  assert.equal(out[0].value, 1);
  assert.equal(out[1].error.message, "boom");
  assert.equal(out[2].value, 3);
});

test("handles an empty list", async () => {
  assert.deepEqual(await runPool([], 5, async () => 1), []);
});
