import { useEffect, useState } from "react";
import { api } from "../api.js";
import SiteCard from "../components/SiteCard.jsx";

function AddSiteForm({ onAdded, onCancel }) {
  const [form, setForm] = useState({ name: "", url: "", checkoutUrl: "" });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.createSite(form);
      onAdded();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mb-6 rounded-2xl border border-border bg-panel p-5">
      <div className="grid gap-3 sm:grid-cols-3">
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

  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-gray-100">سایت‌ها</h2>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">
            {upCount} از {sites.length} آنلاین
          </span>
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sites.map((site) => (
            <SiteCard key={site.id} site={site} />
          ))}
        </div>
      )}
    </div>
  );
}
