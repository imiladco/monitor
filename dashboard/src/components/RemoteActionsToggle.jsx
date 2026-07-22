import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function RemoteActionsToggle() {
  const [enabled, setEnabled] = useState(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    api.remoteActionsStatus().then((s) => setEnabled(s.enabled));
  }, []);

  async function toggle() {
    if (!enabled && !confirming) {
      setConfirming(true);
      return;
    }
    const next = !enabled;
    await api.setRemoteActionsEnabled(next);
    setEnabled(next);
    setConfirming(false);
  }

  if (enabled === null) return null;

  return (
    <div className="mt-4 max-w-md rounded-2xl border border-border bg-panel p-6">
      <h3 className="mb-1 font-medium text-gray-100">اقدامات از راه دور</h3>
      <p className="mb-3 text-xs text-gray-500">
        وقتی روشنه، از صفحه‌ی هر سایت می‌تونی آپدیت پلاگین/پوسته/هسته و پاک کردن کش رو مستقیم از پنل بزنی — پلاگین
        agent روی سایت اجراش می‌کنه. <strong className="text-warn">یه آپدیت ناسازگار می‌تونه سایت رو خراب کنه</strong> —
        فقط اگه بهش نیاز داری روشنش کن.
      </p>

      {enabled ? (
        <div className="flex items-center gap-3">
          <span className="text-sm text-good">✅ روشنه</span>
          <button onClick={toggle} className="rounded-lg bg-bad/20 px-3 py-1.5 text-sm text-bad hover:bg-bad/30">
            خاموش کن
          </button>
        </div>
      ) : confirming ? (
        <div className="space-y-2">
          <p className="text-sm text-warn">مطمئنی؟ این ریسک واقعی داره.</p>
          <div className="flex gap-2">
            <button onClick={toggle} className="rounded-lg bg-bad px-3 py-1.5 text-sm font-medium text-white">
              آره، روشن کن
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded-lg bg-panel2 px-3 py-1.5 text-sm text-gray-300"
            >
              انصراف
            </button>
          </div>
        </div>
      ) : (
        <button onClick={toggle} className="rounded-lg bg-panel2 px-3 py-1.5 text-sm text-gray-300 hover:bg-border">
          خاموشه — روشن کن
        </button>
      )}
    </div>
  );
}
