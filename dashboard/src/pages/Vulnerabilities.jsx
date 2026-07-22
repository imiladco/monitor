import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { useToast } from "../components/Toast.jsx";

const severityStyle = {
  critical: "bg-bad/20 text-bad",
  high: "bg-warn/20 text-warn",
  medium: "bg-accent/20 text-accent",
  low: "bg-panel2 text-gray-400",
};
const severityLabel = { critical: "بحرانی", high: "بالا", medium: "متوسط", low: "پایین" };

function ManualEntry({ onAdded }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ pluginSlug: "", affectedVersions: "", fixedIn: "", severity: "high", title: "", referenceUrl: "" });
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.addVulnerability(form);
      setForm({ pluginSlug: "", affectedVersions: "", fixedIn: "", severity: "high", title: "", referenceUrl: "" });
      setOpen(false);
      toast.success("آسیب‌پذیری دستی اضافه شد — با اسکن بعدی مطابقت داده می‌شه");
      onAdded();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-panel2 px-3 py-1.5 text-sm text-gray-300 hover:bg-border">
        + افزودن دستی
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4 rounded-xl border border-border bg-panel p-4">
      <p className="mb-3 text-xs text-gray-500">
        برای پلاگین‌های بازار ایران که فیدهای خارجی نمی‌شناسن. مثال بازه: <code dir="ltr">{"<= 5.5"}</code> یا{" "}
        <code dir="ltr">{">= 3.6.0 < 3.6.3"}</code> یا <code dir="ltr">1.2.*</code>
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <input required value={form.pluginSlug} onChange={(e) => setForm({ ...form, pluginSlug: e.target.value })} placeholder="slug پلاگین" dir="ltr" className="rounded-lg border border-border bg-panel2 px-2 py-1.5 text-sm text-gray-100 outline-none focus:border-accent" />
        <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="عنوان" className="rounded-lg border border-border bg-panel2 px-2 py-1.5 text-sm text-gray-100 outline-none focus:border-accent" />
        <input required value={form.affectedVersions} onChange={(e) => setForm({ ...form, affectedVersions: e.target.value })} placeholder="نسخه‌های آسیب‌پذیر" dir="ltr" className="rounded-lg border border-border bg-panel2 px-2 py-1.5 text-sm text-gray-100 outline-none focus:border-accent" />
        <input value={form.fixedIn} onChange={(e) => setForm({ ...form, fixedIn: e.target.value })} placeholder="رفع در نسخه (اختیاری)" dir="ltr" className="rounded-lg border border-border bg-panel2 px-2 py-1.5 text-sm text-gray-100 outline-none focus:border-accent" />
        <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} className="rounded-lg border border-border bg-panel2 px-2 py-1.5 text-sm text-gray-100 outline-none focus:border-accent">
          <option value="critical">بحرانی</option>
          <option value="high">بالا</option>
          <option value="medium">متوسط</option>
          <option value="low">پایین</option>
        </select>
        <input value={form.referenceUrl} onChange={(e) => setForm({ ...form, referenceUrl: e.target.value })} placeholder="لینک منبع (اختیاری)" dir="ltr" className="rounded-lg border border-border bg-panel2 px-2 py-1.5 text-sm text-gray-100 outline-none focus:border-accent" />
      </div>
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">ذخیره</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-panel2 px-4 py-2 text-sm text-gray-300">انصراف</button>
      </div>
    </form>
  );
}

export default function VulnerabilitiesPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [severityFilter, setSeverityFilter] = useState("all");
  const [scanning, setScanning] = useState(false);

  async function load() {
    setRows(await api.vulnerabilities());
  }

  useEffect(() => {
    load();
  }, []);

  async function rescan() {
    setScanning(true);
    try {
      await api.rescanVulnerabilities();
      await load();
      toast.success("اسکن انجام شد");
    } finally {
      setScanning(false);
    }
  }

  async function resolve(row) {
    const ok = await confirm({ title: "علامت‌گذاری به‌عنوان رفع‌شده", message: "این مورد از لیست حذف می‌شه (برای false positive یا رفع دستی)." });
    if (!ok) return;
    await api.resolveSiteVulnerability(row.site_id, row.id);
    await load();
    toast.info("رفع شد");
  }

  if (!rows) return <div className="text-gray-500">در حال بارگذاری…</div>;

  const filtered = severityFilter === "all" ? rows : rows.filter((r) => r.severity === severityFilter);

  return (
    <div>
      <Link to="/" className="text-sm text-gray-500 hover:text-gray-300">← بازگشت</Link>
      <div className="mb-4 mt-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-100">🛡 آسیب‌پذیری‌ها</h2>
        <div className="flex items-center gap-2">
          <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} className="rounded-lg border border-border bg-panel2 px-2 py-1 text-sm text-gray-300 outline-none">
            <option value="all">همه‌ی شدت‌ها</option>
            <option value="critical">بحرانی</option>
            <option value="high">بالا</option>
            <option value="medium">متوسط</option>
            <option value="low">پایین</option>
          </select>
          <ManualEntry onAdded={load} />
          <button onClick={rescan} disabled={scanning} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {scanning ? "در حال اسکن…" : "اسکن مجدد"}
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-panel p-8 text-center text-gray-500">
          هیچ آسیب‌پذیری فعالی پیدا نشد.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((row) => (
            <div key={row.link_id} className="rounded-xl border border-border bg-panel p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${severityStyle[row.severity] || severityStyle.low}`}>
                    {severityLabel[row.severity] || row.severity}
                  </span>
                  <span className="font-medium text-gray-100">{row.title}</span>
                </div>
                <button onClick={() => resolve(row)} className="text-xs text-gray-500 hover:text-gray-300">
                  علامت رفع‌شده
                </button>
              </div>
              <div className="mt-2 text-xs text-gray-400">
                <Link to={`/sites/${row.site_id}`} className="text-accent">{row.site_name}</Link>
                {" — "}
                پلاگین <span dir="ltr">{row.plugin_slug}</span> نسخه‌ی نصب‌شده <span dir="ltr">{row.installed_version}</span>
                {row.fixed_in && <> · رفع در <span dir="ltr">{row.fixed_in}</span></>}
                {row.cve_id && <> · <span dir="ltr">{row.cve_id}</span></>}
                {row.reference_url && (
                  <> · <a href={row.reference_url} target="_blank" rel="noreferrer" className="text-accent">منبع</a></>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
