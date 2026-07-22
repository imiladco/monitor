import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function PortChecks({ siteId }) {
  const [checks, setChecks] = useState(null);
  const [form, setForm] = useState({ label: "", host: "", port: "" });
  const [error, setError] = useState(null);

  async function load() {
    setChecks(await api.portChecks(siteId));
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [siteId]);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.createPortCheck(siteId, { ...form, port: Number(form.port) });
      setForm({ label: "", host: "", port: "" });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    await api.deletePortCheck(id);
    load();
  }

  return (
    <div className="mt-4 rounded-xl border border-border bg-panel p-4">
      <h3 className="mb-1 font-medium text-gray-100">مانیتور پورت (TCP)</h3>
      <p className="mb-3 text-xs text-gray-500">چک اتصال TCP به یه هاست/پورت خاص — مثلاً دیتابیس یا SSH سرور.</p>

      <form onSubmit={submit} className="grid gap-2 sm:grid-cols-4">
        <input
          required
          value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })}
          placeholder="اسم (مثلاً MySQL)"
          className="rounded-lg border border-border bg-panel2 px-2 py-1.5 text-sm text-gray-100 outline-none focus:border-accent"
        />
        <input
          required
          dir="ltr"
          value={form.host}
          onChange={(e) => setForm({ ...form, host: e.target.value })}
          placeholder="host یا IP"
          className="rounded-lg border border-border bg-panel2 px-2 py-1.5 text-sm text-gray-100 outline-none focus:border-accent"
        />
        <input
          required
          type="number"
          min="1"
          max="65535"
          dir="ltr"
          value={form.port}
          onChange={(e) => setForm({ ...form, port: e.target.value })}
          placeholder="پورت"
          className="rounded-lg border border-border bg-panel2 px-2 py-1.5 text-sm text-gray-100 outline-none focus:border-accent"
        />
        <button type="submit" className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white">
          افزودن
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}

      {checks?.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {checks.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg bg-panel2 px-3 py-2 text-xs">
              <span className="flex items-center gap-2 text-gray-300">
                <span className={`inline-block h-2 w-2 rounded-full ${c.up === null ? "bg-gray-500" : c.up ? "bg-good" : "bg-bad"}`} />
                {c.label} <span dir="ltr">{c.host}:{c.port}</span>
              </span>
              <button onClick={() => remove(c.id)} className="text-bad hover:underline">
                حذف
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
