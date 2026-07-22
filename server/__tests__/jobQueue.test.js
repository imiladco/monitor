import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DB_PATH = path.join(os.tmpdir(), `site-monitor-jobs-test-${process.pid}-${Date.now()}.db`);

const { db, enqueueJob, claimJob, completeJob, failJob, recoverStuckJobs, jobStats } = await import("../db.js");
const queue = await import("../jobs/queue.js");

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

test("claimJob picks highest priority, marks running, bumps attempts, dedupes", () => {
  enqueueJob({ type: "t", payload: { n: 1 }, priority: 0 });
  const hi = enqueueJob({ type: "t", payload: { n: 2 }, priority: 5 });
  const first = claimJob(["t"], 60);
  assert.equal(first.id, hi); // higher priority first
  assert.equal(first.status, "running");
  assert.equal(first.attempts, 1);
  assert.deepEqual(first.payload, { n: 2 });
  // a second claim gets the other job, not the same one
  const second = claimJob(["t"], 60);
  assert.notEqual(second.id, first.id);
  assert.equal(claimJob(["t"], 60), null); // nothing left claimable
});

test("failJob retries with backoff until max_attempts, then dead-letters", () => {
  const id = enqueueJob({ type: "r", maxAttempts: 2 });
  claimJob(["r"], 60); // attempt 1
  assert.equal(failJob(id, "boom", 0), "retry");
  const again = claimJob(["r"], 60); // attempt 2 (run_after was now+0)
  assert.equal(again.id, id);
  assert.equal(again.attempts, 2);
  assert.equal(failJob(id, "boom again", 0), "dead-letter");
  assert.equal(db.prepare("SELECT status FROM jobs WHERE id = ?").get(id).status, "failed");
});

test("recoverStuckJobs requeues running jobs whose lease expired", () => {
  const id = enqueueJob({ type: "s" });
  claimJob(["s"], 60);
  assert.equal(recoverStuckJobs(), 0); // lease still valid
  db.prepare("UPDATE jobs SET lease_until = datetime('now', '-1 minute') WHERE id = ?").run(id);
  assert.equal(recoverStuckJobs(), 1);
  assert.equal(db.prepare("SELECT status FROM jobs WHERE id = ?").get(id).status, "pending");
});

test("worker runs a handler and marks the job done", async () => {
  queue._resetJobs();
  const seen = [];
  queue.registerJob("work", async (payload) => seen.push(payload.x), { concurrency: 2 });
  enqueueJob({ type: "work", payload: { x: 1 } });
  enqueueJob({ type: "work", payload: { x: 2 } });
  await queue.tick();
  await queue.drain();
  assert.deepEqual(seen.sort(), [1, 2]);
  assert.equal(jobStats().done, 2);
});

test("worker respects the per-type concurrency cap", async () => {
  queue._resetJobs();
  let active = 0;
  let peak = 0;
  queue.registerJob(
    "cap",
    async () => {
      active += 1;
      peak = Math.max(peak, active);
      await tick(30);
      active -= 1;
    },
    { concurrency: 1 }
  );
  for (let i = 0; i < 4; i++) enqueueJob({ type: "cap" });
  // several ticks while jobs drain
  for (let i = 0; i < 8; i++) {
    await queue.tick();
    await tick(15);
  }
  await queue.drain();
  assert.equal(peak, 1, `peak concurrency was ${peak}`);
});

test("a throwing handler dead-letters after retries", async () => {
  queue._resetJobs();
  queue.registerJob("boom", async () => {
    throw new Error("always fails");
  }, { concurrency: 1, backoffBaseSeconds: 0 });
  const id = enqueueJob({ type: "boom", maxAttempts: 2 });
  for (let i = 0; i < 6; i++) {
    await queue.tick();
    await queue.drain();
    await tick(5);
  }
  assert.equal(db.prepare("SELECT status FROM jobs WHERE id = ?").get(id).status, "failed");
});

test.after(() => {
  db.close();
  fs.rmSync(process.env.DB_PATH, { force: true });
  fs.rmSync(`${process.env.DB_PATH}-wal`, { force: true });
  fs.rmSync(`${process.env.DB_PATH}-shm`, { force: true });
});
