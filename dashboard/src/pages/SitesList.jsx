import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import FleetAlerts from "../components/FleetAlerts.jsx";
import FleetIncidents from "../components/FleetIncidents.jsx";
import Sparkline from "../components/Sparkline.jsx";
import SitePanel from "../components/SitePanel.jsx";
import SiteHoverCard from "../components/SiteHoverCard.jsx";
import { OPEN_PALETTE_EVENT } from "../components/CommandPalette.jsx";
import { useToast } from "../components/Toast.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";

function AddSiteForm({ onAdded, onCancel }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: "", url: "", checkoutUrl: "", client: "" });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(null); // { name, apiKey } — shown once
  const [copied, setCopied] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await api.createSite(form);
      toast.success(`${form.name} اضافه شد`);
      setCreated({ name: form.name, apiKey: res.apiKey });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    return (
      <div className="mb-6 rounded-2xl border border-border bg-panel p-5 text-sm text-gray-300">
        <p className="mb-1 font-medium text-gray-100">«{created.name}» اضافه شد ✓</p>
        <p className="mb-2 text-xs text-good">
          کلید API — فقط همین یک‌بار نمایش داده می‌شه؛ همین حالا داخل تنظیمات پلاگین همراه ذخیره‌ش کن:
        </p>
        <div className="flex items-center gap-2">
          <code className="break-all rounded bg-panel2 px-2 py-1 text-xs text-gray-300" dir="ltr">
            {created.apiKey}
          </code>
          <button
            onClick={() => {
              navigator.clipboard.writeText(created.apiKey);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="shrink-0 rounded-md bg-panel2 px-2 py-1 text-xs text-gray-300 hover:bg-border"
          >
            {copied ? "کپی شد ✓" : "کپی"}
          </button>
        </div>
        <button
          onClick={onAdded}
          className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
        >
          تمام
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mb-6 rounded-2xl border border-border bg-panel p-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <input
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="اسم سایت"
          className="rounded-lg border border-border bg-panel2 px-3 py-2 text-gray-100 outline-none focus:border-accent"
        />
        <input
          required
          dir="ltr"
          value={form.url}
          onChange={(e) => setForm({ ...form, url: e.target.value })}
          placeholder="https://yoursite.com"
          className="rounded-lg border border-border bg-panel2 px-3 py-2 text-gray-100 outline-none focus:border-accent"
        />
        <input
          dir="ltr"
          value={form.checkoutUrl}
          onChange={(e) => setForm({ ...form, checkoutUrl: e.target.value })}
          placeholder="آدرس چک‌اوت (اختیاری)"
          className="rounded-lg border border-border bg-panel2 px-3 py-2 text-gray-100 outline-none focus:border-accent"
        />
        <input
          value={form.client}
          onChange={(e) => setForm({ ...form, client: e.target.value })}
          placeholder="مشتری/پروژه (اختیاری)"
          className="rounded-lg border border-border bg-panel2 px-3 py-2 text-gray-100 outline-none focus:border-accent"
        />
      </div>
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          افزودن سایت
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg bg-panel2 px-4 py-2 text-sm text-gray-300"
        >
          انصراف
        </button>
      </div>
    </form>
  );
}

function StatusDot({ up, paused }) {
  const color = paused ? "bg-muted" : up === null ? "bg-muted" : up ? "bg-ok" : "bg-bad";
  const label = paused ? "مکث" : up === null ? "بدون داده" : up ? "آنلاین" : "آفلاین";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} role="img" aria-label={label} />;
}

function sslColor(days) {
  if (days == null) return "text-content-secondary";
  if (days <= 7) return "text-bad";
  if (days <= 14) return "text-warn";
  return "text-content-secondary";
}

const PILLS = [
  { key: "all", label: "همه", match: () => true },
  { key: "online", label: "آنلاین", match: (s) => s.up === true },
  { key: "offline", label: "آفلاین", match: (s) => s.up === false },
  { key: "updates", label: "دارای آپدیت", match: (s) => s.updatesCount > 0 },
  { key: "cve", label: "دارای CVE", match: (s) => s.cveCount > 0 },
  { key: "ssl", label: "SSL نزدیک انقضا", match: (s) => s.sslDaysLeft != null && s.sslDaysLeft <= 14 },
];

const SORTS = {
  name: (a, b) => a.name.localeCompare(b.name, "fa"),
  status: (a, b) => Number(b.up) - Number(a.up),
  responseMs: (a, b) => (a.responseMs ?? Infinity) - (b.responseMs ?? Infinity),
  updatesCount: (a, b) => a.updatesCount - b.updatesCount,
  cveCount: (a, b) => a.cveCount - b.cveCount,
  sslDaysLeft: (a, b) => (a.sslDaysLeft ?? Infinity) - (b.sslDaysLeft ?? Infinity),
};

function RowMenu({ site, onChanged }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="rounded px-1.5 py-1 text-content-secondary hover:bg-surface-hover hover:text-content"
        aria-label="اکشن‌ها"
      >
        ⋯
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 w-36 overflow-hidden rounded-md border border-border-strong bg-surface-2 py-1 text-xs shadow-lg">
          <button
            className="block w-full px-3 py-1.5 text-right text-content hover:bg-surface-hover"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/sites/${site.id}`);
            }}
          >
            باز کردن
          </button>
          <button
            className="block w-full px-3 py-1.5 text-right text-content hover:bg-surface-hover"
            onClick={async (e) => {
              e.stopPropagation();
              setOpen(false);
              await api.setPaused(site.id, !site.paused);
              toast.info(site.paused ? "از مکث خارج شد" : "مکث شد");
              onChanged();
            }}
          >
            {site.paused ? "ادامه‌ی پایش" : "مکث پایش"}
          </button>
          <button
            className="block w-full px-3 py-1.5 text-right text-bad hover:bg-surface-hover"
            onClick={async (e) => {
              e.stopPropagation();
              setOpen(false);
              const ok = await confirm({ message: `سایت «${site.name}» حذف بشه؟ این کار برگشت‌ناپذیره.` });
              if (!ok) return;
              await api.deleteSite(site.id);
              toast.info("سایت حذف شد");
              onChanged();
            }}
          >
            حذف
          </button>
        </div>
      )}
    </div>
  );
}

function SiteRow({ site, onChanged, onOpen }) {
  return (
    <tr
      onClick={() => onOpen(site.id)}
      className="cursor-pointer border-b border-border hover:bg-surface-hover"
    >
      <td className="w-6 pr-0 pl-0 text-center">
        <StatusDot up={site.up} paused={site.paused} />
      </td>
      <td className="py-2 pl-3">
        <SiteHoverCard site={site} className="font-medium text-content">
          {site.name}
        </SiteHoverCard>
        {site.client && <div className="text-[11px] text-muted">{site.client}</div>}
      </td>
      <td className="py-2 pl-3">
        <span className="tnum text-xs text-content-secondary" dir="ltr">
          {site.url.replace(/^https?:\/\//, "")}
        </span>
      </td>
      <td className="py-2 pl-3">
        {site.recentChecks?.length > 1 ? (
          <Sparkline checks={site.recentChecks} />
        ) : (
          <span className="text-xs text-muted">—</span>
        )}
      </td>
      <td className="tnum py-2 pl-3 text-left text-xs text-content-secondary">
        {site.responseMs != null ? `${site.responseMs}ms` : "—"}
      </td>
      <td className="py-2 pl-3 text-center">
        {site.updatesCount > 0 ? (
          <span className="tnum inline-flex items-center gap-1 text-xs text-info" title="آپدیت‌های موجود">
            ⟳ {site.updatesCount}
          </span>
        ) : null}
      </td>
      <td className="py-2 pl-3 text-center">
        {site.cveCount > 0 ? (
          <span className="tnum inline-flex items-center gap-1 text-xs text-bad" title="آسیب‌پذیری فعال">
            ⚠ {site.cveCount}
          </span>
        ) : null}
      </td>
      <td className={`tnum py-2 pl-3 text-left text-xs ${sslColor(site.sslDaysLeft)}`}>
        {site.sslDaysLeft != null ? `${site.sslDaysLeft}d` : "—"}
      </td>
      <td className="w-8 py-2 text-center" onClick={(e) => e.stopPropagation()}>
        <RowMenu site={site} onChanged={onChanged} />
      </td>
    </tr>
  );
}

function SortHeader({ label, sortKey, sort, dir, onSort, align = "right", className = "" }) {
  const active = sort === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`cursor-pointer select-none whitespace-nowrap px-0 pl-3 py-2 font-medium text-muted hover:text-content-secondary text-${align} ${className}`}
    >
      {label}
      {active && <span className="mr-0.5 text-accent">{dir === "asc" ? "↑" : "↓"}</span>}
    </th>
  );
}

export default function SitesList() {
  const [sites, setSites] = useState(null);
  const [error, setError] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [clientFilter, setClientFilter] = useState("all");
  const [pill, setPill] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [params, setParams] = useSearchParams();

  const sort = params.get("sort") || "status";
  const dir = params.get("dir") || "asc";

  function onSort(key) {
    const nextDir = sort === key && dir === "asc" ? "desc" : "asc";
    const next = new URLSearchParams(params);
    next.set("sort", key);
    next.set("dir", nextDir);
    setParams(next, { replace: true });
  }

  async function load() {
    try {
      setSites(await api.sites());
      api.incidents("open").then(setIncidents).catch(() => {});
    } catch (err) {
      setError(err.message);
    }
  }

  async function acknowledge(id) {
    await api.acknowledgeIncident(id);
    setIncidents(await api.incidents("open"));
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  // One-shot triggers from the command palette (?add=1 / ?site=<id>), consumed
  // then stripped from the URL so they don't re-fire or clutter it.
  useEffect(() => {
    let changed = false;
    const next = new URLSearchParams(params);
    if (next.get("add") === "1") {
      setShowAdd(true);
      next.delete("add");
      changed = true;
    }
    const site = next.get("site");
    if (site) {
      setSelectedId(Number(site));
      next.delete("site");
      changed = true;
    }
    if (changed) setParams(next, { replace: true });
  }, [params, setParams]);

  const clients = useMemo(
    () => (sites ? [...new Set(sites.map((s) => s.client).filter(Boolean))].sort() : []),
    [sites]
  );

  const visible = useMemo(() => {
    if (!sites) return [];
    const pillFn = (PILLS.find((p) => p.key === pill) || PILLS[0]).match;
    const q = query.trim().toLowerCase();
    let rows = sites.filter((s) => {
      if (clientFilter !== "all" && s.client !== clientFilter) return false;
      if (!pillFn(s)) return false;
      if (q && !(`${s.name} ${s.url} ${s.client || ""}`.toLowerCase().includes(q))) return false;
      return true;
    });
    const cmp = SORTS[sort] || SORTS.status;
    rows = [...rows].sort(cmp);
    if (dir === "desc") rows.reverse();
    return rows;
  }, [sites, pill, query, clientFilter, sort, dir]);

  if (error) return <div className="text-bad">خطا در دریافت داده: {error}</div>;

  const upCount = sites ? sites.filter((s) => s.up).length : 0;
  const totalUpdates = sites ? sites.reduce((n, s) => n + s.updatesCount, 0) : 0;
  const totalCve = sites ? sites.reduce((n, s) => n + s.cveCount, 0) : 0;

  return (
    <div>
      <FleetAlerts />
      <FleetIncidents incidents={incidents} onAcknowledge={acknowledge} />

      {/* slim summary strip */}
      <div className="mb-4 flex items-center gap-5 rounded-lg border border-border bg-surface px-4 py-2 text-xs text-content-secondary">
        <span>
          <span className="tnum text-content">{upCount}</span> از{" "}
          <span className="tnum text-content">{sites?.length ?? "—"}</span> آنلاین
        </span>
        <span className="text-border-strong">|</span>
        <span>
          آپدیت: <span className="tnum text-info">{totalUpdates}</span>
        </span>
        <span>
          CVE: <span className="tnum text-bad">{totalCve}</span>
        </span>
        <span>
          رخداد باز: <span className="tnum text-bad">{incidents.length}</span>
        </span>
        <div className="mr-auto">
          {!showAdd && (
            <button
              onClick={() => setShowAdd(true)}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
            >
              + سایت جدید
            </button>
          )}
        </div>
      </div>

      {showAdd && (
        <AddSiteForm
          onAdded={() => {
            setShowAdd(false);
            load();
          }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {/* filter bar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجوی سایت…"
            className="w-56 rounded-md border border-border bg-surface-2 py-1.5 pr-3 pl-12 text-xs text-content outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
            title="باز کردن جستجوی فرمان"
            className="tnum absolute left-2 top-1/2 -translate-y-1/2 rounded border border-border px-1 text-[10px] text-muted hover:border-border-strong hover:text-content-secondary"
          >
            ⌘K
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {PILLS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPill(p.key)}
              className={`rounded-md border px-2.5 py-1 text-xs ${
                pill === p.key
                  ? "border-accent bg-accent/15 text-content"
                  : "border-border bg-surface-2 text-content-secondary hover:border-border-strong"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {clients.length > 0 && (
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-content-secondary outline-none"
          >
            <option value="all">همه‌ی مشتری‌ها</option>
            {clients.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
        <span className="mr-auto text-xs text-muted">
          <span className="tnum text-content-secondary">{visible.length}</span> سایت
        </span>
      </div>

      {sites == null ? (
        <div className="overflow-hidden rounded-lg border border-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
              <div className="h-2.5 w-2.5 rounded-full bg-surface-2" />
              <div className="h-3 w-32 animate-pulse rounded bg-surface-2" />
              <div className="h-3 w-40 animate-pulse rounded bg-surface-2" />
              <div className="mr-auto h-3 w-16 animate-pulse rounded bg-surface-2" />
            </div>
          ))}
        </div>
      ) : sites.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-10 text-center text-sm text-content-secondary">
          <div className="mb-2 text-2xl">🛰️</div>
          هنوز سایتی اضافه نکردی — از دکمه‌ی «+ سایت جدید» شروع کن.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[720px] border-collapse text-right text-sm">
            <thead>
              <tr className="border-b border-border-strong bg-surface text-xs">
                <th className="w-6" />
                <SortHeader label="سایت" sortKey="name" sort={sort} dir={dir} onSort={onSort} />
                <th className="px-0 pl-3 py-2 font-medium text-muted">URL</th>
                <th className="px-0 pl-3 py-2 font-medium text-muted">۲۴ ساعت</th>
                <SortHeader label="پاسخ" sortKey="responseMs" sort={sort} dir={dir} onSort={onSort} align="left" />
                <SortHeader label="آپدیت" sortKey="updatesCount" sort={sort} dir={dir} onSort={onSort} align="center" />
                <SortHeader label="CVE" sortKey="cveCount" sort={sort} dir={dir} onSort={onSort} align="center" />
                <SortHeader label="SSL" sortKey="sslDaysLeft" sort={sort} dir={dir} onSort={onSort} align="left" />
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {visible.map((site) => (
                <SiteRow key={site.id} site={site} onChanged={load} onOpen={setSelectedId} />
              ))}
            </tbody>
          </table>
          {visible.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-muted">هیچ سایتی با این فیلترها پیدا نشد.</div>
          )}
        </div>
      )}

      {selectedId != null && (
        <SitePanel key={selectedId} siteId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
