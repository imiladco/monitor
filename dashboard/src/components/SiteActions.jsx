import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useConfirm } from "./ConfirmDialog.jsx";
import { useToast } from "./Toast.jsx";

const typeLabel = { plugin: "افزونه", theme: "پوسته", core: "هسته‌ی وردپرس" };

function statusLabel(status) {
  return { pending: "در صف", running: "در حال اجرا", done: "انجام شد", failed: "ناموفق", cancelled: "لغو شده" }[status] || status;
}

function formatTime(iso) {
  return new Date(iso.replace(" ", "T") + "Z").toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "short" });
}

// The agent must be polling for a queued command to ever run. Consider it
// "online" if we've heard from it in the last 20 minutes.
function agentOnline(iso) {
  if (!iso) return false;
  return Date.now() - new Date(iso.replace(" ", "T") + "Z").getTime() < 20 * 60 * 1000;
}

export default function SiteActions({ site, remoteActionsEnabled }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [commands, setCommands] = useState(null);
  const [queuing, setQueuing] = useState(null);

  async function loadCommands() {
    setCommands(await api.commands(site.id));
  }

  useEffect(() => {
    if (remoteActionsEnabled) loadCommands();
    const interval = remoteActionsEnabled ? setInterval(loadCommands, 10000) : null;
    return () => interval && clearInterval(interval);
  }, [site.id, remoteActionsEnabled]);

  if (!remoteActionsEnabled) return null;

  const updates = site.agent?.updatesAvailable || [];
  const online = agentOnline(site.agentLastSeen);

  async function runUpdate(update) {
    if (update.type === "core") {
      const ok = await confirm({
        title: "آپدیت هسته‌ی وردپرس",
        message: `${site.name} از ${update.currentVersion} به ${update.newVersion} آپدیت بشه؟ این ریسک‌دارترین نوع آپدیته.`,
        danger: true,
      });
      if (!ok) return;
    }
    setQueuing(update.slug);
    try {
      await api.createCommand(
        site.id,
        update.type === "core" ? "update_core" : update.type === "theme" ? "update_theme" : "update_plugin",
        update.type === "core" ? {} : { slug: update.slug }
      );
      await loadCommands();
      toast.success(
        online
          ? `دستور آپدیت ${update.name} در صف قرار گرفت — با poll بعدی agent اجرا می‌شه`
          : `دستور در صف قرار گرفت، ولی agent این سایت آنلاین نیست و تا وصل نشه اجرا نمی‌شه`
      );
    } finally {
      setQueuing(null);
    }
  }

  async function cancel(id) {
    await api.cancelCommand(id);
    await loadCommands();
    toast.info("دستور از صف لغو شد");
  }

  async function clearCache() {
    setQueuing("__cache__");
    try {
      await api.createCommand(site.id, "clear_cache");
      await loadCommands();
      toast.success("دستور پاک‌کردن کش ارسال شد");
    } finally {
      setQueuing(null);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-border bg-panel p-4">
      <h3 className="mb-1 font-medium text-gray-100">اقدامات از راه دور</h3>
      {!site.agent && <p className="text-xs text-gray-500">این بخش نیاز به پلاگین agent روی سایت داره.</p>}

      {site.agent && (
        <>
          <div className={`mb-3 flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs ${online ? "bg-good/10 text-good" : "bg-warn/10 text-warn"}`}>
            <span className={`h-2 w-2 rounded-full ${online ? "bg-good" : "bg-warn"}`} />
            {online ? (
              <span>agent آنلاینه — دستورها با poll بعدی اجرا می‌شن.</span>
            ) : (
              <span>
                agent اخیراً دیده نشده{site.agentLastSeen ? ` (${formatTime(site.agentLastSeen)})` : ""} — دستورها تا وصل‌شدن دوباره در صف می‌مونن و اجرا نمی‌شن.
              </span>
            )}
          </div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              {updates.length > 0 ? `${updates.length} آپدیت موجوده` : "همه‌چیز آپدیته"}
            </p>
            <button
              onClick={clearCache}
              disabled={queuing === "__cache__"}
              className="rounded-lg bg-panel2 px-3 py-1.5 text-xs text-gray-300 hover:bg-border disabled:opacity-50"
            >
              {queuing === "__cache__" ? "در حال ارسال…" : "پاک کردن کش"}
            </button>
          </div>

          {updates.length > 0 && (
            <div className="mb-3 space-y-1.5">
              {updates.map((u) => (
                <div key={`${u.type}-${u.slug}`} className="flex items-center justify-between rounded-lg bg-panel2 px-3 py-2 text-xs">
                  <span className="text-gray-300">
                    [{typeLabel[u.type] || u.type}] {u.name} — {u.currentVersion || "?"} ← {u.newVersion || "?"}
                  </span>
                  <button
                    onClick={() => runUpdate(u)}
                    disabled={queuing === u.slug}
                    className="rounded-md bg-accent px-2 py-1 text-white disabled:opacity-50"
                  >
                    {queuing === u.slug ? "…" : "آپدیت"}
                  </button>
                </div>
              ))}
            </div>
          )}

          {commands?.length > 0 && (
            <div>
              <p className="mb-1 text-xs text-gray-500">تاریخچه‌ی دستورات</p>
              <div className="space-y-1">
                {commands.slice(0, 10).map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-xs text-gray-400">
                    <span>
                      {c.type} {c.params?.slug ? `(${c.params.slug})` : ""} — {statusLabel(c.status)}
                      {c.result ? ` — ${c.result}` : ""}
                    </span>
                    <span className="flex items-center gap-2">
                      {c.status === "pending" && (
                        <button onClick={() => cancel(c.id)} className="text-bad hover:underline">
                          لغو
                        </button>
                      )}
                      {formatTime(c.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
