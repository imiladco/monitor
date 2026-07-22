import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { db } from "./db.js";
import { logger } from "./logger.js";

const BACKUP_DIR = path.resolve("data/backups");
const RETENTION_DAYS = 14;

// Metadata about the most recent backup file (newest by mtime), or null.
export function latestBackupInfo() {
  try {
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith(".db"))
      .map((f) => {
        const st = fs.statSync(path.join(BACKUP_DIR, f));
        return { file: f, mtimeMs: st.mtimeMs, size: st.size };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    if (files.length === 0) return null;
    const latest = files[0];
    return {
      file: latest.file,
      at: new Date(latest.mtimeMs).toISOString(),
      sizeMb: Number((latest.size / 1e6).toFixed(1)),
    };
  } catch {
    return null;
  }
}

// Restore-readiness check: open the newest backup read-only and run a quick
// integrity check. Cheap confidence that the backup isn't corrupt.
export function verifyLatestBackup() {
  const info = latestBackupInfo();
  if (!info) return false;
  let ro;
  try {
    ro = new Database(path.join(BACKUP_DIR, info.file), { readonly: true });
    const row = ro.prepare("PRAGMA quick_check").get();
    return Object.values(row)[0] === "ok";
  } catch (err) {
    logger.error("backup: verification failed", { file: info.file, error: err.message });
    return false;
  } finally {
    ro?.close();
  }
}

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
