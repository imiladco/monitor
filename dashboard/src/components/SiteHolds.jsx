import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useConfirm } from "./ConfirmDialog.jsx";
import { useToast } from "./Toast.jsx";

export default function SiteHolds({ siteId }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [holds, setHolds] = useState(null);

  async function load() {
    setHolds(await api.siteHolds(siteId));
  }

  useEffect(() => {
    load();
  }, [siteId]);

  if (!holds || holds.length === 0) return null;

  async function release(hold) {
    const ok = await confirm({
      title: "برداشتن hold",
      message: `آپدیت ${hold.plugin_slug} به ${hold.target_version} آزاد بشه؟ این آپدیت روی یه سایت دیگه مشکل ایجاد کرده بود.`,
      danger: true,
    });
    if (!ok) return;
    await api.releaseHold(hold.id);
    load();
    toast.info("hold برداشته شد");
  }

  return (
    <div className="mt-4 rounded-xl border border-warn/40 bg-warn/5 p-4">
      <h3 className="mb-3 font-medium text-gray-100">⏸ آپدیت‌های hold‌شده ({holds.length})</h3>
      <div className="space-y-2">
        {holds.map((hold) => (
          <div key={hold.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-panel2 px-3 py-2 text-xs">
            <span className="text-gray-300">
              <span dir="ltr">{hold.plugin_slug} → {hold.target_version}</span>
              {hold.reason && <span className="text-gray-500"> · {hold.reason}</span>}
            </span>
            <button onClick={() => release(hold)} className="rounded-md bg-panel px-2 py-1 text-gray-300 hover:bg-border">
              آزاد کردن
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
