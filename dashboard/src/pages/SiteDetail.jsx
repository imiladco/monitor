import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import Sparkline from "../components/Sparkline.jsx";
import Timeline from "../components/Timeline.jsx";

export default function SiteDetail() {
  const { id } = useParams();
  const [site, setSite] = useState(null);
  const [checks, setChecks] = useState(null);
  const [events, setEvents] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [s, c, e] = await Promise.all([api.site(id), api.checks(id, "uptime", 60), api.timeline(id)]);
      if (cancelled) return;
      setSite(s);
      setChecks(c);
      setEvents(e);
    }
    load();
    const interval = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [id]);

  if (!site) return <div className="text-gray-500">در حال بارگذاری…</div>;

  const lastCheck = checks?.[checks.length - 1];
  const agent = site.agent;

  return (
    <div>
      <Link to="/" className="text-sm text-gray-500 hover:text-gray-300">
        ← بازگشت به لیست سایت‌ها
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-100">{site.name}</h2>
          <a href={site.url} target="_blank" rel="noreferrer" className="text-sm text-accent" dir="ltr">
            {site.url}
          </a>
        </div>
        <div className="text-left" dir="ltr">
          <Sparkline points={checks || []} ok={lastCheck?.ok} width={220} height={48} />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="وضعیت" value={lastCheck ? (lastCheck.ok ? "آنلاین" : "آفلاین") : "-"} />
        <Stat label="سرعت پاسخ" value={lastCheck?.response_ms != null ? `${lastCheck.response_ms}ms` : "-"} />
        <Stat label="وردپرس" value={agent?.wpVersion || "متصل نیست"} />
        <Stat label="پوسته" value={agent?.theme?.name || "-"} />
      </div>

      {!agent && (
        <div className="mt-6 rounded-xl border border-dashed border-border bg-panel/50 p-4 text-sm text-gray-400">
          پلاگین همراه (agent) هنوز به این سایت وصل نشده — بدون اون فقط آپ‌تایم و SSL دیده می‌شه، نه تایم‌لاین
          تغییرات. کلید API برای نصب:
          <div className="mt-2 flex items-center gap-2">
            <code className="break-all rounded bg-panel2 px-2 py-1 text-xs text-gray-300" dir="ltr">
              {site.apiKey}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(site.apiKey);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="shrink-0 rounded-md bg-panel2 px-2 py-1 text-xs text-gray-300 hover:bg-border"
            >
              {copied ? "کپی شد ✓" : "کپی"}
            </button>
          </div>
        </div>
      )}

      <h3 className="mb-4 mt-8 text-lg font-semibold text-gray-100">Time Machine — تایم‌لاین تغییرات</h3>
      <Timeline events={events} />
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 truncate font-medium text-gray-100">{value}</div>
    </div>
  );
}
