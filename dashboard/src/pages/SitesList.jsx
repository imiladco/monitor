import { useEffect, useState } from "react";
import { api } from "../api.js";
import SiteCard from "../components/SiteCard.jsx";

export default function SitesList() {
  const [sites, setSites] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api.sites();
        if (!cancelled) setSites(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }
    load();
    const interval = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (error) return <div className="text-bad">خطا در دریافت داده: {error}</div>;
  if (!sites) return <div className="text-gray-500">در حال بارگذاری…</div>;

  const upCount = sites.filter((s) => s.up).length;

  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-gray-100">سایت‌ها</h2>
        <span className="text-sm text-gray-500">
          {upCount} از {sites.length} آنلاین
        </span>
      </div>
      {sites.length === 0 ? (
        <div className="rounded-2xl border border-border bg-panel p-8 text-center text-gray-500">
          هیچ سایتی تعریف نشده. <code>config/sites.json</code> رو پر کن و سرور رو ری‌استارت کن.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sites.map((site) => (
            <SiteCard key={site.id} site={site} />
          ))}
        </div>
      )}
    </div>
  );
}
