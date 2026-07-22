import { useEffect, useState } from "react";
import { api } from "../api.js";

const verdictStyle = {
  bad: "border-bad/40 bg-bad/10 text-bad",
  suspicious: "border-warn/40 bg-warn/10 text-warn",
};
const verdictLabel = { bad: "خراب", suspicious: "مشکوک" };

export default function FleetAlerts() {
  const [alerts, setAlerts] = useState(null);

  useEffect(() => {
    api.fleetAlerts().then(setAlerts).catch(() => setAlerts([]));
  }, []);

  if (!alerts || alerts.length === 0) return null;

  return (
    <div className="mb-6 rounded-2xl border border-border bg-panel p-5">
      <h3 className="mb-1 font-medium text-gray-100">⚡️ هشدارهای Fleet Learning</h3>
      <p className="mb-3 text-xs text-gray-500">
        این آپدیت‌ها روی حداقل یه سایت مشکل ایجاد کردن و روی بقیه‌ی سایت‌های در معرض hold شدن.
      </p>
      <div className="space-y-2">
        {alerts.map((a) => (
          <div key={a.id} className={`rounded-lg border px-3 py-2 text-xs ${verdictStyle[a.verdict] || ""}`}>
            <span className="font-medium">{verdictLabel[a.verdict] || a.verdict}</span> —{" "}
            <span dir="ltr">
              {a.plugin_slug} {a.from_version} → {a.to_version}
            </span>
            {a.notes && <span className="text-gray-400"> · {a.notes}</span>}
            <span className="text-gray-500"> · {a.evidence_site_ids?.length || 0} سایت شاهد</span>
          </div>
        ))}
      </div>
    </div>
  );
}
