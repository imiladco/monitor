import fs from "node:fs";
import path from "node:path";
import { aggregateUptimeDaily, dbFileSizeBytes, vacuum } from "./db.js";
import { latestBackupInfo, verifyLatestBackup } from "./backup.js";
import { sendTelegram } from "./notify/telegram.js";
import { logger } from "./logger.js";

const DB_DIR = path.dirname(
  process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.resolve("data/monitor.db")
);
const DISK_WARN_MB = Number(process.env.DISK_WARN_MB || 500);

export function diskInfo() {
  try {
    const s = fs.statfsSync(DB_DIR);
    return {
      freeMb: Math.round((s.bavail * s.bsize) / 1e6),
      totalMb: Math.round((s.blocks * s.bsize) / 1e6),
    };
  } catch {
    return { freeMb: null, totalMb: null };
  }
}

// Snapshot of storage/backup health for the dashboard.
export function systemStatus() {
  const backup = latestBackupInfo();
  const disk = diskInfo();
  return {
    dbSizeMb: Number((dbFileSizeBytes() / 1e6).toFixed(1)),
    diskFreeMb: disk.freeMb,
    diskTotalMb: disk.totalMb,
    diskWarnMb: DISK_WARN_MB,
    lastBackupAt: backup?.at ?? null,
    lastBackupSizeMb: backup?.sizeMb ?? null,
  };
}

// Daily maintenance: roll up aggregates, reclaim space, verify the backup, and
// alert on low disk or a bad backup. Runs after the backup + retention prune.
export async function runSystemMaintenance() {
  const aggregatedRows = aggregateUptimeDaily();
  try {
    vacuum();
  } catch (err) {
    logger.error("system: VACUUM failed", { error: err.message });
  }
  const backupOk = verifyLatestBackup();
  const disk = diskInfo();
  logger.info("system: maintenance done", { aggregatedRows, backupOk, diskFreeMb: disk.freeMb });

  if (disk.freeMb != null && disk.freeMb < DISK_WARN_MB) {
    await sendTelegram(
      `⚠️ <b>هشدار فضای دیسک سرور</b>\nفضای آزاد: ${disk.freeMb}MB (کمتر از آستانه‌ی ${DISK_WARN_MB}MB)`,
      "status"
    );
  }
  if (!backupOk) {
    await sendTelegram("⚠️ <b>پشتیبان دیتابیس معتبر نیست</b>\nآخرین backup باز یا بررسی نشد — بررسی کن.", "status");
  }
  return { aggregatedRows, backupOk, disk };
}
