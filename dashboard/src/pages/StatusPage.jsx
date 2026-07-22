import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchPublicStatus } from "../api.js";
import UptimeBar from "../components/UptimeBar.jsx";

function StatusDot({ up }) {
  const color = up === null ? "bg-gray-500" : up ? "bg-good" : "bg-bad";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />;
}

export default function StatusPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const d = await fetchPublicStatus(token);
        if (!cancelled) setData(d);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }
    load();
    const interval = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-border bg-panel/60 backdrop-blur">
        <div className="mx-auto max-w-3xl px-6 py-4">
          <h1 className="text-base font-semibold text-gray-100">🛰️ وضعیت سرویس‌ها</h1>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-8">
        {error && <div className="text-bad">{error}</div>}
        {!error && !data && <div className="text-gray-500">در حال بارگذاری…</div>}
        {data && data.sites.length === 0 && (
          <div className="rounded-2xl border border-border bg-panel p-8 text-center text-gray-500">
            هنوز سایتی برای نمایش عمومی تنظیم نشده.
          </div>
        )}
        {data && (
          <div className="space-y-4">
            {data.sites.map((site) => (
              <div key={site.url} className="rounded-2xl border border-border bg-panel p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <StatusDot up={site.up} />
                    <h3 className="font-semibold text-gray-100">{site.name}</h3>
                  </div>
                  <span className="text-xs text-gray-500">
                    {site.up === null ? "بدون داده" : site.up ? "آنلاین" : "آفلاین"}
                  </span>
                </div>
                <div className="mt-4">
                  <UptimeBar checks={site.recentChecks} height={24} />
                </div>
                <div className="mt-3 flex justify-between text-xs text-gray-500">
                  <span>۷ روز: {site.uptime7d != null ? `${site.uptime7d}٪` : "-"}</span>
                  <span>۳۰ روز: {site.uptime30d != null ? `${site.uptime30d}٪` : "-"}</span>
                  <span>۹۰ روز: {site.uptime90d != null ? `${site.uptime90d}٪` : "-"}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
