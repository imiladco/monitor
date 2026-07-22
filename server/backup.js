import fs from "node:fs";
import path from "node:path";
import { db } from "./db.js";
import { logger } from "./logger.js";

const BACKUP_DIR = path.resolve("data/backups");
const RETENTION_DAYS = 14;

export async function backupDatabase() {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const dest = path.join(BACKUP_DIR, `monitor-${date}.db`);
    await db.backup(dest);
    logger.info("backup: database backed up", { dest });
    pruneOldBackups();
  } catch (err) {
    logger.error("backup: failed", { error: err.message });
  }
}

function pruneOldBackups() {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const file of fs.readdirSync(BACKUP_DIR)) {
    const full = path.join(BACKUP_DIR, file);
    if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
  }
}
