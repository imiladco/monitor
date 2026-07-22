import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import Sparkline from "../components/Sparkline.jsx";
import Timeline from "../components/Timeline.jsx";

export default function SiteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [site, setSite] = useState(null);
  const [checks, setChecks] = useState(null);
  const [events, setEvents] = useState(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [saveError, setSaveError] = useState(null);

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

  async function saveEdit(e) {
    e.preventDefault();
    setSaveError(null);
    try {
      await api.updateSite(site.id, editForm);
      setEditing(false);
      setSite(await api.site(id));
    } catch (err) {
      setSaveError(err.message);
    }
  }

  async function remove() {
    if (!confirm(`سایت «${site.name}» حذف بشه؟ تاریخچه و تایم‌لاینش هم پاک می‌شه.`)) return;
    await api.deleteSite(site.id);
    navigate("/");
  }

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
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setEditForm({ name: site.name, url: site.url, checkoutUrl: site.checkoutUrl || "" });
              setEditing(true);
            }}
            className="rounded-lg bg-panel2 px-3 py-1.5 text-sm text-gray-300 hover:bg-border"
          >
            ویرایش
          </button>
          <button onClick={remove} className="rounded-lg bg-panel2 px-3 py-1.5 text-sm text-bad hover:bg-border">
            حذف
          </button>
          <div dir="ltr">
            <Sparkline points={checks || []} ok={lastCheck?.ok} width={220} height={48} />
          </div>
        </div>
      </div>

      {editing && (
        <form onSubmit={saveEdit} className="mt-4 rounded-xl border border-border bg-panel p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              required
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              className="rounded-lg border border-border bg-panel2 px-3 py-2 text-gray-100 outline-none focus:border-accent"
            />
            <input
              required
              dir="ltr"
              value={editForm.url}
              onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
              className="rounded-lg border border-border bg-panel2 px-3 py-2 text-gray-100 outline-none focus:border-accent"
            />
            <input
              dir="ltr"
              value={editForm.checkoutUrl}
              onChange={(e) => setEditForm({ ...editForm, checkoutUrl: e.target.value })}
              placeholder="آدرس چک‌اوت (اختیاری)"
              className="rounded-lg border border-border bg-panel2 px-3 py-2 text-gray-100 outline-none focus:border-accent"
            />
          </div>
          {saveError && <p className="mt-2 text-sm text-bad">{saveError}</p>}
          <div className="mt-3 flex gap-2">
            <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
              ذخیره
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg bg-panel2 px-4 py-2 text-sm text-gray-300"
            >
              انصراف
            </button>
          </div>
        </form>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="وضعیت" value={lastCheck ? (lastCheck.ok ? "آنلاین" : "آفلاین") : "-"} />
        <Stat label="سرعت پاسخ" value={lastCheck?.response_ms != null ? `${lastCheck.response_ms}ms` : "-"} />
        <Stat label="وردپرس" value={agent?.wpVersion || "متصل نیست"} />
        <Stat label="پوسته" value={agent?.theme?.name || "-"} />
        <Stat label="LCP" value={site.screenshot?.lcpMs != null ? `${site.screenshot.lcpMs}ms` : "-"} />
        <Stat label="CLS" value={site.screenshot?.cls != null ? site.screenshot.cls : "-"} />
        <Stat label="انقضای دامنه" value={site.domainDaysLeft != null ? `${site.domainDaysLeft} روز` : "-"} />
        <Stat
          label="تغییر ظاهری اخیر"
          value={site.screenshot?.diffPercent != null ? `${site.screenshot.diffPercent.toFixed(1)}٪` : "-"}
        />
      </div>

      {site.screenshot && (
        <div className="mt-6 overflow-hidden rounded-xl border border-border bg-panel">
          <img
            src={api.screenshotUrl(site.id, site.screenshot.capturedAt)}
            alt="آخرین اسکرین‌شات هوم‌پیج"
            className="w-full"
          />
          <div className="border-t border-border px-4 py-2 text-xs text-gray-500">
            آخرین اسکرین‌شات — {new Date(site.screenshot.capturedAt.replace(" ", "T") + "Z").toLocaleString("fa-IR")}
          </div>
        </div>
      )}

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
