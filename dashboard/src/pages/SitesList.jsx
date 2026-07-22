import { useEffect, useState } from "react";
import { api } from "../api.js";
import SiteCard from "../components/SiteCard.jsx";
import FleetAlerts from "../components/FleetAlerts.jsx";
import { useToast } from "../components/Toast.jsx";

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

export default function SitesList() {
  const [sites, setSites] = useState(null);
  const [error, setError] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [clientFilter, setClientFilter] = useState("all");

  async function load() {
    try {
      const data = await api.sites();
      setSites(data);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  if (error) return <div className="text-bad">خطا در دریافت داده: {error}</div>;
  if (!sites) return <div className="text-gray-500">در حال بارگذاری…</div>;

  const upCount = sites.filter((s) => s.up).length;
  const clients = [...new Set(sites.map((s) => s.client).filter(Boolean))].sort();
  const visibleSites = clientFilter === "all" ? sites : sites.filter((s) => s.client === clientFilter);
  const groups =
    clientFilter !== "all"
      ? [[clientFilter, visibleSites]]
      : Object.entries(
          visibleSites.reduce((acc, s) => {
            const key = s.client || "بدون گروه";
            (acc[key] ||= []).push(s);
            return acc;
          }, {})
        ).sort(([a], [b]) => (a === "بدون گروه" ? 1 : b === "بدون گروه" ? -1 : a.localeCompare(b)));

  return (
    <div>
      <FleetAlerts />
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-100">سایت‌ها</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            {upCount} از {sites.length} آنلاین
          </span>
          {clients.length > 0 && (
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="rounded-lg border border-border bg-panel2 px-2 py-1 text-sm text-gray-300 outline-none"
            >
              <option value="all">همه‌ی مشتری‌ها</option>
              {clients.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
          {!showAdd && (
            <button
              onClick={() => setShowAdd(true)}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white"
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

      {sites.length === 0 ? (
        <div className="rounded-2xl border border-border bg-panel p-8 text-center text-gray-500">
          هنوز سایتی اضافه نکردی — از دکمه‌ی «+ سایت جدید» شروع کن.
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(([groupName, groupSites]) => (
            <div key={groupName}>
              {clients.length > 0 && (
                <h3 className="mb-3 text-sm font-medium text-gray-400">
                  {groupName} <span className="text-gray-600">({groupSites.length})</span>
                </h3>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {groupSites.map((site) => (
                  <SiteCard key={site.id} site={site} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
