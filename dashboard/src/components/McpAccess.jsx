import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useConfirm } from "./ConfirmDialog.jsx";
import { useToast } from "./Toast.jsx";

function formatTime(iso) {
  if (!iso) return "استفاده نشده";
  return new Date(iso.replace(" ", "T") + "Z").toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "short" });
}

export default function McpAccess() {
  const confirm = useConfirm();
  const toast = useToast();
  const [keys, setKeys] = useState(null);
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState(null);

  async function load() {
    setKeys(await api.mcpKeys());
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e) {
    e.preventDefault();
    if (!name.trim()) return;
    const res = await api.createMcpKey(name.trim());
    setNewKey({ name: name.trim(), key: res.key });
    setName("");
    load();
    toast.success("کلید ساخته شد — همین حالا کپیش کن، دیگه نمایش داده نمی‌شه");
  }

  async function revoke(k) {
    const ok = await confirm({
      title: "لغو دسترسی",
      message: `کلید «${k.name}» لغو بشه؟ هر اتصالی که از این کلید استفاده می‌کنه قطع می‌شه.`,
      danger: true,
    });
    if (!ok) return;
    await api.deleteMcpKey(k.id);
    load();
    toast.info("کلید لغو شد");
  }

  if (!keys) return null;

  return (
    <div className="mt-4 max-w-md rounded-2xl border border-border bg-panel p-6">
      <h3 className="mb-1 font-medium text-gray-100">دسترسی MCP</h3>
      <p className="mb-3 text-xs text-gray-500">
        یه کلید بساز تا از Claude Desktop یا Claude Code با ناوگان سایت‌هات حرف بزنی (فقط خواندنی). راهنمای اتصال تو{" "}
        <code dir="ltr">mcp-server/README.md</code>.
      </p>

      <form onSubmit={create} className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="اسم کلید (مثلاً لپ‌تاپ)"
          className="flex-1 rounded-lg border border-border bg-panel2 px-3 py-2 text-sm text-gray-100 outline-none focus:border-accent"
        />
        <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
          ساخت
        </button>
      </form>

      {newKey && (
        <div className="mt-3 rounded-lg border border-good/40 bg-good/10 p-3">
          <p className="mb-1 text-xs text-good">کلید «{newKey.name}» — فقط همین یک‌بار نمایش داده می‌شه:</p>
          <code className="block break-all rounded bg-panel2 px-2 py-1 text-xs text-gray-200" dir="ltr">
            {newKey.key}
          </code>
        </div>
      )}

      {keys.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center justify-between rounded-lg bg-panel2 px-3 py-2 text-xs">
              <span className="text-gray-300">
                {k.name} <span className="text-gray-500">· آخرین استفاده: {formatTime(k.last_used_at)}</span>
              </span>
              <button onClick={() => revoke(k)} className="text-bad hover:underline">
                لغو
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
