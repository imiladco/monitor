import { claimJob, completeJob, failJob, recoverStuckJobs } from "../db.js";
import { logger } from "../logger.js";

// Registered job handlers keyed by type, plus a live per-type running count so
// the worker can enforce concurrency caps (e.g. browser jobs = 1).
const handlers = new Map();
const running = new Map();

export function registerJob(type, fn, { concurrency = 1, timeoutMs = 60000, backoffBaseSeconds = 30 } = {}) {
  handlers.set(type, { fn, concurrency, timeoutMs, backoffBaseSeconds });
  running.set(type, 0);
}

// Test/reset hook.
export function _resetJobs() {
  handlers.clear();
  running.clear();
}

function withTimeout(promise, ms, type) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`job ${type} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function runJob(type, job) {
  const h = handlers.get(type);
  running.set(type, running.get(type) + 1);
  try {
    await withTimeout(Promise.resolve().then(() => h.fn(job.payload, job)), h.timeoutMs, type);
    completeJob(job.id);
    logger.info("job: done", { type, id: job.id, attempts: job.attempts });
  } catch (err) {
    const backoff = Math.min(3600, h.backoffBaseSeconds * 2 ** Math.max(0, job.attempts - 1));
    const outcome = failJob(job.id, err.message, backoff);
    logger[outcome === "dead-letter" ? "error" : "warn"]("job: failed", {
      type,
      id: job.id,
      attempts: job.attempts,
      outcome,
      backoff,
      error: err.message,
    });
  } finally {
    running.set(type, running.get(type) - 1);
  }
}

// One scheduling pass: for each type, claim and start jobs up to its
// concurrency cap. runJob is fire-and-forget but increments the running count
// synchronously before its first await, so the cap holds.
let ticking = false;
export async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    for (const [type, h] of handlers) {
      while (running.get(type) < h.concurrency) {
        const leaseSeconds = Math.ceil(h.timeoutMs / 1000) + 30;
        const job = claimJob([type], leaseSeconds);
        if (!job) break;
        runJob(type, job);
      }
    }
  } finally {
    ticking = false;
  }
}

let interval = null;
export function startWorkers({ intervalMs = 2000 } = {}) {
  recoverStuckJobs();
  interval = setInterval(() => {
    tick().catch((err) => logger.error("job: tick failed", { error: err.message }));
  }, intervalMs);
  interval.unref?.();
  logger.info("jobs: worker started", { types: [...handlers.keys()] });
}

export function stopWorkers() {
  if (interval) clearInterval(interval);
  interval = null;
}

// Await all currently-running jobs to settle (used by tests).
export function drain() {
  return new Promise((resolve) => {
    const check = () => {
      const busy = [...running.values()].some((n) => n > 0);
      if (busy) setTimeout(check, 10);
      else resolve();
    };
    check();
  });
}
