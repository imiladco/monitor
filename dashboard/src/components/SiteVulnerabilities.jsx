import { useEffect, useState } from "react";
import { api } from "../api.js";

const severityStyle = {
  critical: "bg-bad/20 text-bad",
  high: "bg-warn/20 text-warn",
  medium: "bg-accent/20 text-accent",
  low: "bg-panel2 text-gray-400",
};
const severityLabel = { critical: "بحرانی", high: "بالا", medium: "متوسط", low: "پایین" };

export default function SiteVulnerabilities({ siteId }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    api.siteVulnerabilities(siteId).then(setRows);
  }, [siteId]);

  if (!rows || rows.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl border border-border bg-panel p-4">
      <h3 className="mb-3 font-medium text-gray-100">🛡 آسیب‌پذیری‌های شناخته‌شده ({rows.length})</h3>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.link_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-panel2 px-3 py-2 text-xs">
            <span className="flex items-center gap-2 text-gray-300">
              <span className={`rounded-full px-2 py-0.5 ${severityStyle[row.severity] || severityStyle.low}`}>
                {severityLabel[row.severity] || row.severity}
              </span>
              {row.title} — نصب‌شده <span dir="ltr">{row.installed_version}</span>
              {row.fixed_in && <> · رفع در <span dir="ltr">{row.fixed_in}</span></>}
            </span>
            {row.reference_url && (
              <a href={row.reference_url} target="_blank" rel="noreferrer" className="text-accent">
                منبع
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
