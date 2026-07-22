import fs from "node:fs";
import path from "node:path";

const LOG_DIR = path.resolve("data/logs");
const RETENTION_DAYS = 30;

function todayFile() {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(LOG_DIR, `${date}.log`);
}

function write(level, message, meta) {
  const entry = { time: new Date().toISOString(), level, message, ...(meta ? { meta } : {}) };
  const line = JSON.stringify(entry);

  const consoleFn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  consoleFn(`[${entry.time}] [${level.toUpperCase()}] ${message}`, meta ?? "");

  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(todayFile(), line + "\n");
  } catch {
    // logging must never crash the app; if the disk write fails, the
    // console line above is still emitted.
  }
}

export const logger = {
  info: (message, meta) => write("info", message, meta),
  warn: (message, meta) => write("warn", message, meta),
  error: (message, meta) => write("error", message, meta),
};

export function pruneOldLogs() {
  try {
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    for (const file of fs.readdirSync(LOG_DIR)) {
      const full = path.join(LOG_DIR, file);
      if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
    }
  } catch {
    // no log dir yet, nothing to prune
  }
}
