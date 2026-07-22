import { useEffect, useState } from "react";
import { api } from "../api.js";

function Stat({ label, value, tone = "text-content" }) {
  return (
    <div className="rounded-md border border-border bg-surface-2 px-3 py-2">
      <div className="text-[11px] text-muted">{label}</div>
      <div className={`tnum text-sm ${tone}`}>{value}</div>
    </div>
  );
}

function relative(iso) {
  if (!iso) return "بدون پشتیبان";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins} دقیقه پیش`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} ساعت پیش`;
  return `${Math.round(h / 24)} روز پیش`;
}

export default function SystemHealth() {
  const [s, setS] = useState(null);

  useEffect(() => {
    api.system().then(setS).catch(() => {});
  }, []);

  const diskLow = s && s.diskFreeMb != null && s.diskFreeMb < s.diskWarnMb;
  const backupStale = s && (!s.lastBackupAt || Date.now() - new Date(s.lastBackupAt).getTime() > 36 * 3600 * 1000);

  return (
    <div className="mt-4 max-w-md rounded-2xl border border-border bg-panel p-6">
      <h3 className="mb-3 font-medium text-gray-100">سلامت سیستم</h3>
      {!s ? (
        <div className="text-xs text-muted">در حال بارگذاری…</div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Stat label="حجم دیتابیس" value={`${s.dbSizeMb} MB`} />
          <Stat
            label="فضای آزاد دیسک"
            value={s.diskFreeMb != null ? `${s.diskFreeMb} / ${s.diskTotalMb} MB` : "—"}
            tone={diskLow ? "text-bad" : "text-content"}
          />
          <Stat
            label="آخرین پشتیبان"
            value={relative(s.lastBackupAt)}
            tone={backupStale ? "text-warn" : "text-content"}
          />
          <Stat label="حجم پشتیبان" value={s.lastBackupSizeMb != null ? `${s.lastBackupSizeMb} MB` : "—"} />
        </div>
      )}
    </div>
  );
}
