import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useToast } from "./Toast.jsx";
import { useConfirm } from "./ConfirmDialog.jsx";

const VIEWPORT_LABEL = { desktop: "دسکتاپ", tablet: "تبلت", mobile: "موبایل" };

function Thumb({ id, kind, label }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <div className="flex h-24 w-full items-center justify-center rounded border border-border bg-panel2 text-[10px] text-muted">{label}</div>;
  return (
    <div>
      <div className="mb-1 text-[10px] text-muted">{label}</div>
      <img
        src={`${api.visualImageUrl(id, kind)}&t=${Date.now()}`}
        onError={() => setBroken(true)}
        className="h-24 w-full rounded border border-border object-cover object-top"
        alt={label}
      />
    </div>
  );
}

function AddForm({ siteId, onAdded }) {
  const [form, setForm] = useState({ label: "", url: "", viewport: "desktop", threshold: 15 });
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const cls = "rounded-lg border border-border bg-panel2 px-3 py-2 text-sm text-gray-100 outline-none focus:border-accent";

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const t = await api.createVisualTarget(siteId, form);
      await api.captureVisualTarget(t.id); // seed the baseline immediately
      toast.success("هدف تصویری اضافه شد و baseline گرفته شد");
      setForm({ label: "", url: "", viewport: "desktop", threshold: 15 });
      onAdded();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 grid gap-2 sm:grid-cols-5">
      <input required value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="عنوان (مثلاً چک‌اوت)" className={cls} />
      <input required dir="ltr" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…/checkout" className={`${cls} sm:col-span-2`} />
      <select value={form.viewport} onChange={(e) => setForm({ ...form, viewport: e.target.value })} className={cls}>
        <option value="desktop">دسکتاپ</option>
        <option value="tablet">تبلت</option>
        <option value="mobile">موبایل</option>
      </select>
      <button disabled={busy} className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">
        {busy ? "..." : "افزودن + baseline"}
      </button>
    </form>
  );
}

export default function VisualTargets({ siteId }) {
  const [targets, setTargets] = useState(null);
  const toast = useToast();
  const confirm = useConfirm();

  const load = () => api.visualTargets(siteId).then(setTargets).catch(() => setTargets([]));
  useEffect(() => {
    load();
  }, [siteId]);

  async function approve(id) {
    await api.approveVisualTarget(id);
    toast.success("baseline به‌روزرسانی شد");
    load();
  }
  async function recapture(id) {
    toast.info("در حال گرفتن اسکرین‌شات…");
    await api.captureVisualTarget(id);
    load();
  }
  async function remove(id, label) {
    if (!(await confirm({ message: `هدف تصویری «${label}» حذف بشه؟` }))) return;
    await api.deleteVisualTarget(id);
    load();
  }

  return (
    <div className="mt-6 rounded-xl border border-border bg-panel p-4">
      <h3 className="text-sm font-medium text-gray-100">پایش تصویری (Visual)</h3>
      <p className="mt-1 text-xs text-gray-500">
        هر صفحه نسبت به یک baseline تأییدشده مقایسه می‌شه؛ اگه تغییر از آستانه بیشتر شد هشدار می‌ده. تغییرِ درست رو با «تأیید» به baseline جدید تبدیل کن.
      </p>

      {targets && targets.length > 0 && (
        <div className="mt-4 space-y-4">
          {targets.map((t) => (
            <div key={t.id} className="rounded-lg border border-border bg-panel2/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-sm font-medium text-content">{t.label}</span>
                  <span className="mr-2 rounded bg-panel2 px-1.5 py-0.5 text-[10px] text-muted">{VIEWPORT_LABEL[t.viewport]}</span>
                  <a href={t.url} target="_blank" rel="noreferrer" className="tnum mr-2 text-[11px] text-muted hover:text-accent" dir="ltr">
                    {t.url.replace(/^https?:\/\//, "")}
                  </a>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {t.last_diff != null && (
                    <span className={`tnum ${t.last_diff >= t.threshold ? "text-bad" : "text-good"}`}>
                      {t.last_diff.toFixed(1)}٪ تغییر (آستانه {t.threshold}٪)
                    </span>
                  )}
                  <button onClick={() => recapture(t.id)} className="rounded border border-border px-2 py-0.5 text-content-secondary hover:bg-surface-hover">
                    اسکرین‌شات مجدد
                  </button>
                  <button onClick={() => approve(t.id)} className="rounded border border-border px-2 py-0.5 text-good hover:bg-surface-hover">
                    تأیید baseline
                  </button>
                  <button onClick={() => remove(t.id, t.label)} className="rounded border border-border px-2 py-0.5 text-bad hover:bg-surface-hover">
                    حذف
                  </button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Thumb id={t.id} kind="baseline" label="baseline" />
                <Thumb id={t.id} kind="last" label="آخرین" />
                <Thumb id={t.id} kind="diff" label="تفاوت" />
              </div>
            </div>
          ))}
        </div>
      )}

      <AddForm siteId={siteId} onAdded={load} />
    </div>
  );
}
