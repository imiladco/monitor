import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import UptimeBar from "../components/UptimeBar.jsx";
import ResponseTimeChart from "../components/ResponseTimeChart.jsx";
import Timeline from "../components/Timeline.jsx";
import MaintenanceWindows from "../components/MaintenanceWindows.jsx";
import PortChecks from "../components/PortChecks.jsx";
import SiteActions from "../components/SiteActions.jsx";
import SiteVulnerabilities from "../components/SiteVulnerabilities.jsx";
import SiteHolds from "../components/SiteHolds.jsx";
import HttpMonitorFields from "../components/HttpMonitorFields.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { useToast } from "../components/Toast.jsx";

export default function SiteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const [site, setSite] = useState(null);
  const [checks, setChecks] = useState(null);
  const [events, setEvents] = useState(null);
  const [copied, setCopied] = useState(false);
  const [revealedKey, setRevealedKey] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [remoteActionsEnabled, setRemoteActionsEnabled] = useState(false);

  useEffect(() => {
    api.remoteActionsStatus().then((s) => setRemoteActionsEnabled(s.enabled));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [s, c, e] = await Promise.all([api.site(id), api.checks(id, "uptime", 120), api.timeline(id)]);
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
      toast.success("ذخیره شد");
    } catch (err) {
      setSaveError(err.message);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: "حذف سایت",
      message: `سایت «${site.name}» حذف بشه؟ تاریخچه و تایم‌لاینش هم پاک می‌شه.`,
      danger: true,
    });
    if (!ok) return;
    await api.deleteSite(site.id);
    toast.success("سایت حذف شد");
    navigate("/");
  }

  async function togglePause() {
    await api.setPaused(site.id, !site.paused);
    setSite(await api.site(id));
    toast.info(site.paused ? "مانیتورینگ ادامه پیدا کرد" : "مانیتورینگ مکث شد");
  }

  async function togglePublic() {
    await api.setPublic(site.id, !site.public);
    setSite(await api.site(id));
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
        <div className="flex flex-wrap items-center gap-2">
          {site.paused && (
            <span className="rounded-lg bg-warn/20 px-2 py-1 text-xs text-warn">⏸ مکث شده</span>
          )}
          {site.inMaintenance && (
            <span className="rounded-lg bg-accent/20 px-2 py-1 text-xs text-accent">🔧 در حال تعمیرات</span>
          )}
          <button onClick={togglePublic} className="rounded-lg bg-panel2 px-3 py-1.5 text-sm text-gray-300 hover:bg-border">
            {site.public ? "✓ نمایش عمومی" : "نمایش عمومی خاموشه"}
          </button>
          <button onClick={togglePause} className="rounded-lg bg-panel2 px-3 py-1.5 text-sm text-gray-300 hover:bg-border">
            {site.paused ? "▶ ادامه" : "⏸ مکث"}
          </button>
          <button
            onClick={() => {
              setEditForm({
                name: site.name,
                url: site.url,
                checkoutUrl: site.checkoutUrl || "",
                keyword: site.keyword || "",
                keywordMode: site.keywordMode || "present",
                client: site.client || "",
                httpConfig: site.httpConfig || null,
              });
              setEditing(true);
            }}
            className="rounded-lg bg-panel2 px-3 py-1.5 text-sm text-gray-300 hover:bg-border"
          >
            ویرایش
          </button>
          <button onClick={remove} className="rounded-lg bg-panel2 px-3 py-1.5 text-sm text-bad hover:bg-border">
            حذف
          </button>
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
            <input
              value={editForm.client}
              onChange={(e) => setEditForm({ ...editForm, client: e.target.value })}
              placeholder="مشتری/پروژه (اختیاری)"
              className="rounded-lg border border-border bg-panel2 px-3 py-2 text-gray-100 outline-none focus:border-accent"
            />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <input
              value={editForm.keyword}
              onChange={(e) => setEditForm({ ...editForm, keyword: e.target.value })}
              placeholder="کلیدواژه (اختیاری، مثلاً «افزودن به سبد خرید»)"
              className="rounded-lg border border-border bg-panel2 px-3 py-2 text-gray-100 outline-none focus:border-accent sm:col-span-2"
            />
            <select
              value={editForm.keywordMode}
              onChange={(e) => setEditForm({ ...editForm, keywordMode: e.target.value })}
              className="rounded-lg border border-border bg-panel2 px-3 py-2 text-gray-100 outline-none focus:border-accent"
            >
              <option value="present">باید توی صفحه باشه</option>
              <option value="absent">نباید توی صفحه باشه</option>
            </select>
          </div>
          <HttpMonitorFields
            value={editForm.httpConfig}
            onChange={(hc) => setEditForm({ ...editForm, httpConfig: hc })}
          />
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

      <div className="mt-6 rounded-xl border border-border bg-panel p-4">
        <UptimeBar checks={checks || []} />
      </div>

      <div className="mt-4 rounded-xl border border-border bg-panel p-4">
        <div className="mb-1 text-xs text-gray-500">سرعت پاسخ</div>
        <ResponseTimeChart points={checks || []} />
      </div>

      <div className="mt-6 grid grid-cols-3 gap-4">
        <Stat label="آپ‌تایم ۷ روزه" value={site.uptime7d != null ? `${site.uptime7d}٪` : "-"} />
        <Stat label="آپ‌تایم ۳۰ روزه" value={site.uptime30d != null ? `${site.uptime30d}٪` : "-"} />
        <Stat label="آپ‌تایم ۹۰ روزه" value={site.uptime90d != null ? `${site.uptime90d}٪` : "-"} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="وضعیت" value={lastCheck ? (lastCheck.ok ? "آنلاین" : "آفلاین") : "-"} />
        <Stat label="سرعت پاسخ" value={lastCheck?.response_ms != null ? `${lastCheck.response_ms}ms` : "-"} />
        <Stat label="وردپرس" value={agent?.wpVersion || "متصل نیست"} />
        <Stat label="پوسته" value={agent?.theme?.name || "-"} />
        <Stat label="LCP" value={site.screenshot?.lcpMs != null ? `${site.screenshot.lcpMs}ms` : "-"} />
        <Stat label="CLS" value={site.screenshot?.cls != null ? site.screenshot.cls : "-"} />
        <Stat label="FCP" value={site.screenshot?.fcpMs != null ? `${site.screenshot.fcpMs}ms` : "-"} />
        <Stat label="TBT" value={site.screenshot?.tbtMs != null ? `${site.screenshot.tbtMs}ms` : "-"} />
        {site.screenshot?.resources && (
          <>
            <Stat label="تعداد درخواست" value={site.screenshot.resources.count} />
            <Stat
              label="حجم منابع"
              value={`${(site.screenshot.resources.bytes / 1024).toFixed(0)} KB`}
            />
          </>
        )}
        <Stat label="انقضای دامنه" value={site.domainDaysLeft != null ? `${site.domainDaysLeft} روز` : "-"} />
        <Stat
          label="تغییر ظاهری اخیر"
          value={site.screenshot?.diffPercent != null ? `${site.screenshot.diffPercent.toFixed(1)}٪` : "-"}
        />
      </div>

      {site.ssl && (
        <div className="mt-4 rounded-xl border border-border bg-panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-100">گواهی SSL</h3>
            {site.ssl.authorized === false ? (
              <span className="rounded bg-bad/20 px-2 py-0.5 text-xs text-bad">
                {site.ssl.hostnameMismatch ? "عدم تطابق دامنه" : "نامعتبر"}
              </span>
            ) : site.ssl.ok ? (
              <span className="rounded bg-good/20 px-2 py-0.5 text-xs text-good">معتبر</span>
            ) : (
              <span className="rounded bg-bad/20 px-2 py-0.5 text-xs text-bad">خطا</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="انقضا"
              value={site.ssl.daysLeft != null ? `${site.ssl.daysLeft} روز` : "-"}
            />
            <Stat label="صادرکننده" value={site.ssl.issuer || "-"} />
            <Stat label="نسخه TLS" value={site.ssl.tlsVersion || "-"} />
            <Stat label="دامنه گواهی" value={site.ssl.subject || "-"} />
          </div>
        </div>
      )}

      {site.dns && (site.dns.a?.length > 0 || site.dns.ns?.length > 0) && (
        <div className="mt-4 rounded-xl border border-border bg-panel p-4">
          <h3 className="mb-3 text-sm font-medium text-gray-100">رکوردهای DNS</h3>
          <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
            {[
              ["A", site.dns.a],
              ["AAAA", site.dns.aaaa],
              ["NS", site.dns.ns],
              ["MX", site.dns.mx],
            ]
              .filter(([, v]) => v && v.length)
              .map(([label, values]) => (
                <div key={label} className="rounded-md border border-border bg-panel2 px-3 py-2">
                  <div className="mb-1 text-[11px] text-muted">{label}</div>
                  <div className="tnum space-y-0.5 text-gray-300" dir="ltr">
                    {values.map((v) => (
                      <div key={v} className="truncate">{v}</div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <a href={api.slaReportUrl(site.id, 30)} className="rounded-lg bg-panel2 px-3 py-1.5 text-sm text-gray-300 hover:bg-border">
          دانلود گزارش SLA (۳۰ روز، CSV)
        </a>
        <a href={api.slaReportUrl(site.id, 90)} className="rounded-lg bg-panel2 px-3 py-1.5 text-sm text-gray-300 hover:bg-border">
          ۹۰ روز
        </a>
      </div>

      <SiteHolds siteId={site.id} />
      <SiteVulnerabilities siteId={site.id} />
      <SiteActions site={site} remoteActionsEnabled={remoteActionsEnabled} />
      <MaintenanceWindows siteId={site.id} />
      <PortChecks siteId={site.id} />

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
          تغییرات.
          {revealedKey ? (
            <>
              <p className="mt-2 text-xs text-good">
                کلید API — فقط همین یک‌بار نمایش داده می‌شه، همین حالا داخل تنظیمات پلاگین ذخیره‌ش کن:
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="break-all rounded bg-panel2 px-2 py-1 text-xs text-gray-300" dir="ltr">
                  {revealedKey}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(revealedKey);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  className="shrink-0 rounded-md bg-panel2 px-2 py-1 text-xs text-gray-300 hover:bg-border"
                >
                  {copied ? "کپی شد ✓" : "کپی"}
                </button>
              </div>
            </>
          ) : (
            <div className="mt-2">
              <button
                onClick={async () => {
                  const { apiKey } = await api.regenerateSiteKey(site.id);
                  setRevealedKey(apiKey);
                }}
                className="rounded-md bg-panel2 px-3 py-1.5 text-xs text-gray-200 hover:bg-border"
              >
                {site.hasAgentKey ? "تولید کلید API جدید" : "تولید کلید API"}
              </button>
              {site.hasAgentKey && (
                <p className="mt-1 text-xs text-gray-500">
                  کلید فقط به‌صورت هش ذخیره می‌شه و قابل بازیابی نیست؛ با تولید کلید جدید، کلید قبلی از کار می‌افته.
                </p>
              )}
            </div>
          )}
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
