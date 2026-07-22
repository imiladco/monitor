import { useEffect, useState } from "react";
import { api } from "../api.js";

function toSqliteUtc(localDatetimeValue) {
  return new Date(localDatetimeValue).toISOString().slice(0, 19).replace("T", " ");
}

function formatLocal(sqliteUtc) {
  return new Date(sqliteUtc.replace(" ", "T") + "Z").toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "short" });
}

function status(window) {
  const now = new Date();
  const start = new Date(window.starts_at.replace(" ", "T") + "Z");
  const end = new Date(window.ends_at.replace(" ", "T") + "Z");
  if (now < start) return { label: "پیش‌رو", color: "text-gray-400" };
  if (now > end) return { label: "تمام‌شده", color: "text-gray-500" };
  return { label: "در حال اجرا", color: "text-warn" };
}

export default function MaintenanceWindows({ siteId }) {
  const [windows, setWindows] = useState(null);
  const [form, setForm] = useState({ note: "", starts: "", ends: "", global: false });
  const [error, setError] = useState(null);

  async function load() {
    setWindows(await api.maintenanceWindows(siteId));
  }

  useEffect(() => {
    load();
  }, [siteId]);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.createMaintenanceWindow({
        siteId: form.global ? null : siteId,
        note: form.note,
        startsAt: toSqliteUtc(form.starts),
        endsAt: toSqliteUtc(form.ends),
      });
      setForm({ note: "", starts: "", ends: "", global: false });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    await api.deleteMaintenanceWindow(id);
    load();
  }

  return (
    <div className="mt-4 rounded-xl border border-border bg-panel p-4">
      <h3 className="mb-1 font-medium text-gray-100">پنجره‌ی تعمیرات</h3>
      <p className="mb-3 text-xs text-gray-500">
        تو این بازه، هشدارها سکوت می‌کنن (چک‌ها ادامه پیدا می‌کنن و تو تایم‌لاین ثبت می‌شن، فقط تلگرام پیام نمی‌ده).
      </p>

      <form onSubmit={submit} className="grid gap-2 sm:grid-cols-4">
        <input
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          placeholder="یادداشت (مثلاً دیپلوی)"
          className="rounded-lg border border-border bg-panel2 px-2 py-1.5 text-sm text-gray-100 outline-none focus:border-accent sm:col-span-1"
        />
        <input
          type="datetime-local"
          required
          value={form.starts}
          onChange={(e) => setForm({ ...form, starts: e.target.value })}
          dir="ltr"
          className="rounded-lg border border-border bg-panel2 px-2 py-1.5 text-sm text-gray-100 outline-none focus:border-accent"
        />
        <input
          type="datetime-local"
          required
          value={form.ends}
          onChange={(e) => setForm({ ...form, ends: e.target.value })}
          dir="ltr"
          className="rounded-lg border border-border bg-panel2 px-2 py-1.5 text-sm text-gray-100 outline-none focus:border-accent"
        />
        <button type="submit" className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white">
          افزودن
        </button>
      </form>
      <label className="mt-2 flex items-center gap-1.5 text-xs text-gray-400">
        <input type="checkbox" checked={form.global} onChange={(e) => setForm({ ...form, global: e.target.checked })} />
        برای همه‌ی سایت‌ها
      </label>
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}

      {windows?.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {windows.map((w) => {
            const s = status(w);
            return (
              <div key={w.id} className="flex items-center justify-between rounded-lg bg-panel2 px-3 py-2 text-xs">
                <span className="text-gray-300">
                  {w.site_id === null && <span className="ml-1 text-accent">[همه]</span>}
                  {w.note || "—"} · {formatLocal(w.starts_at)} تا {formatLocal(w.ends_at)}
                </span>
                <span className="flex items-center gap-2">
                  <span className={s.color}>{s.label}</span>
                  <button onClick={() => remove(w.id)} className="text-bad hover:underline">
                    حذف
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
