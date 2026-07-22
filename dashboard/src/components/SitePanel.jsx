import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import ResponseTimeChart from "./ResponseTimeChart.jsx";
import Timeline from "./Timeline.jsx";
import SiteVulnerabilities from "./SiteVulnerabilities.jsx";

const TABS = [
  { key: "overview", label: "نمای کلی" },
  { key: "timeline", label: "تایم‌لاین" },
  { key: "updates", label: "آپدیت‌ها" },
  { key: "cve", label: "CVE" },
  { key: "settings", label: "تنظیمات" },
];

function Dot({ up, paused }) {
  const color = paused || up === null ? "bg-muted" : up ? "bg-ok" : "bg-bad";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />;
}

function Chip({ label, value }) {
  return (
    <div className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5">
      <div className="text-[10px] text-muted">{label}</div>
      <div className="tnum truncate text-xs text-content">{value ?? "—"}</div>
    </div>
  );
}

function Overview({ site, checks, events }) {
  const agent = site.agent;
  const activePlugins = agent?.plugins?.filter((p) => p.active).length ?? null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2">
        <Chip label="وردپرس" value={agent?.wpVersion} />
        <Chip label="پوسته" value={agent?.theme?.name} />
        <Chip label="پلاگین فعال" value={activePlugins} />
        <Chip label="حجم DB" value={agent?.dbSizeMb != null ? `${agent.dbSizeMb}MB` : null} />
      </div>

      <div className="flex items-center gap-4 rounded-md border border-border bg-surface px-3 py-2 text-xs">
        {[
          ["۷ روز", site.uptime7d],
          ["۳۰ روز", site.uptime30d],
          ["۹۰ روز", site.uptime90d],
        ].map(([label, v]) => (
          <div key={label}>
            <span className="text-muted">{label}: </span>
            <span className="tnum text-content">{v != null ? `${v}%` : "—"}</span>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-1 text-[11px] text-muted">زمان پاسخ (اخیر)</div>
        <ResponseTimeChart points={checks || []} height={120} />
      </div>

      <div>
        <div className="mb-2 text-[11px] text-muted">آخرین رویدادها</div>
        {events && events.length > 0 ? (
          <Timeline events={events.slice(0, 5)} />
        ) : (
          <div className="text-xs text-muted">رویدادی ثبت نشده.</div>
        )}
      </div>
    </div>
  );
}

function Updates({ site }) {
  const updates = site.agent?.updatesAvailable || [];
  if (updates.length === 0) return <div className="text-xs text-muted">آپدیتی در انتظار نیست.</div>;
  return (
    <div className="overflow-hidden rounded-md border border-border">
      {updates.map((u, i) => (
        <div key={i} className="flex items-center justify-between border-b border-border px-3 py-2 text-xs last:border-0">
          <span className="text-content">{u.name || u.slug}</span>
          <span className="tnum text-content-secondary" dir="ltr">
            {u.currentVersion} → <span className="text-info">{u.newVersion}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export default function SitePanel({ siteId, onClose }) {
  const [site, setSite] = useState(null);
  const [checks, setChecks] = useState(null);
  const [events, setEvents] = useState(null);
  const [tab, setTab] = useState("overview");
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    setEntered(true);
    const onKey = (e) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSite(null);
    setTab("overview");
    (async () => {
      const [s, c, e] = await Promise.all([
        api.site(siteId),
        api.checks(siteId, "uptime", 120),
        api.timeline(siteId, 100),
      ]);
      if (cancelled) return;
      setSite(s);
      setChecks(c);
      setEvents(e);
    })();
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  function close() {
    setEntered(false);
    setTimeout(onClose, 150);
  }

  return (
    <div
      className={`fixed inset-y-0 right-0 z-40 w-[520px] max-w-[92vw] border-l border-border-strong bg-surface shadow-2xl transition-transform duration-150 ease-standard ${
        entered ? "translate-x-0" : "translate-x-full"
      }`}
      role="dialog"
      aria-label="جزئیات سایت"
    >
      {site == null ? (
        <div className="space-y-3 p-5">
          <div className="h-5 w-40 animate-pulse rounded bg-surface-2" />
          <div className="h-3 w-56 animate-pulse rounded bg-surface-2" />
          <div className="mt-6 grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-surface-2" />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex h-full flex-col">
          <div className="border-b border-border px-5 py-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <Dot up={checks?.[0] ? Boolean(checks[0].ok) : null} paused={site.paused} />
                <h2 className="text-base font-semibold text-content">{site.name}</h2>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to={`/sites/${site.id}`}
                  className="rounded px-1.5 py-1 text-xs text-content-secondary hover:bg-surface-hover"
                  title="باز کردن صفحه‌ی کامل"
                >
                  ↗ کامل
                </Link>
                <button
                  onClick={close}
                  className="rounded px-2 py-1 text-content-secondary hover:bg-surface-hover"
                  aria-label="بستن"
                >
                  ✕
                </button>
              </div>
            </div>
            <a href={site.url} target="_blank" rel="noreferrer" className="tnum text-xs text-muted hover:text-accent" dir="ltr">
              {site.url}
            </a>
          </div>

          <div className="flex gap-1 border-b border-border px-3 py-1.5 text-xs">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`rounded px-2.5 py-1 ${
                  tab === t.key ? "bg-surface-hover text-content" : "text-content-secondary hover:text-content"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {tab === "overview" && <Overview site={site} checks={checks} events={events} />}
            {tab === "timeline" && (events?.length ? <Timeline events={events} /> : <div className="text-xs text-muted">رویدادی ثبت نشده.</div>)}
            {tab === "updates" && <Updates site={site} />}
            {tab === "cve" && <SiteVulnerabilities siteId={site.id} />}
            {tab === "settings" && (
              <div className="text-xs text-content-secondary">
                برای ویرایش کامل، پورت‌چک‌ها، بازه‌های تعمیر و اکشن‌های ریموت،{" "}
                <Link to={`/sites/${site.id}`} className="text-accent hover:underline">
                  صفحه‌ی کامل سایت
                </Link>{" "}
                رو باز کن.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
