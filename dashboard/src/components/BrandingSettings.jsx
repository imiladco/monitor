import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function BrandingSettings() {
  const [form, setForm] = useState({ name: "", logoUrl: "" });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.brandingSettings().then((s) => setForm({ name: s.name || "", logoUrl: s.logoUrl || "" }));
  }, []);

  async function submit(e) {
    e.preventDefault();
    await api.updateBranding(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="mt-4 max-w-md rounded-2xl border border-border bg-panel p-6">
      <h3 className="mb-1 font-medium text-gray-100">برندسازی (White-label)</h3>
      <p className="mb-3 text-xs text-gray-500">اسم و لوگوی پنل رو با برند خودت یا مشتریت عوض کن.</p>
      <form onSubmit={submit} className="space-y-3">
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="اسم پنل (پیش‌فرض: Site Monitor)"
          className="w-full rounded-lg border border-border bg-panel2 px-3 py-2 text-gray-100 outline-none focus:border-accent"
        />
        <input
          dir="ltr"
          value={form.logoUrl}
          onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
          placeholder="آدرس لوگو (اختیاری، یه URL به تصویر)"
          className="w-full rounded-lg border border-border bg-panel2 px-3 py-2 text-gray-100 outline-none focus:border-accent"
        />
        <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
          ذخیره
        </button>
        {saved && <span className="mr-3 text-sm text-good">ذخیره شد ✓</span>}
      </form>
    </div>
  );
}
