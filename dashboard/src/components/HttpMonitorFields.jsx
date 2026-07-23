import { useState } from "react";

const inputCls = "rounded-lg border border-border bg-panel2 px-3 py-2 text-sm text-gray-100 outline-none focus:border-accent";

function headersToText(h) {
  if (!h || typeof h !== "object") return "";
  return Object.entries(h)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}
function textToHeaders(text) {
  const out = {};
  for (const line of text.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    if (k) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

// Advanced HTTP monitor options editor. `value` is the httpConfig object (or
// null); `onChange` receives the updated object.
export default function HttpMonitorFields({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const cfg = value || {};
  const set = (patch) => onChange({ ...cfg, ...patch });
  const active =
    cfg.method || cfg.expectedStatus || cfg.maxResponseMs || cfg.keywordIsRegex || cfg.headers || cfg.body || cfg.basicAuth || cfg.jsonAssert;

  return (
    <div className="mt-3 rounded-lg border border-border bg-panel2/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-sm text-gray-300"
      >
        <span>تنظیمات پیشرفته‌ی HTTP {active ? <span className="text-accent">•</span> : null}</span>
        <span className="text-muted">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-border p-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs text-gray-400">
              متد
              <select
                value={cfg.method || "GET"}
                onChange={(e) => set({ method: e.target.value === "GET" ? undefined : e.target.value })}
                className={`mt-1 w-full ${inputCls}`}
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="HEAD">HEAD</option>
              </select>
            </label>
            <label className="text-xs text-gray-400">
              کدهای وضعیت مورد انتظار
              <input
                dir="ltr"
                value={cfg.expectedStatus || ""}
                onChange={(e) => set({ expectedStatus: e.target.value || undefined })}
                placeholder="200-299 یا 200,204"
                className={`mt-1 w-full ${inputCls}`}
              />
            </label>
            <label className="text-xs text-gray-400">
              حداکثر زمان پاسخ (ms)
              <input
                dir="ltr"
                type="number"
                value={cfg.maxResponseMs || ""}
                onChange={(e) => set({ maxResponseMs: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="مثلاً 1000"
                className={`mt-1 w-full ${inputCls}`}
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-400">
            <input
              type="checkbox"
              checked={Boolean(cfg.keywordIsRegex)}
              onChange={(e) => set({ keywordIsRegex: e.target.checked || undefined })}
            />
            کلیدواژه به‌صورت Regular Expression تفسیر بشه
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs text-gray-400 sm:col-span-2">
              مسیر JSON برای بررسی (اختیاری)
              <input
                dir="ltr"
                value={cfg.jsonAssert?.path || ""}
                onChange={(e) =>
                  set({ jsonAssert: e.target.value ? { path: e.target.value, mode: cfg.jsonAssert?.mode || "exists" } : undefined })
                }
                placeholder="data.errors"
                className={`mt-1 w-full ${inputCls}`}
              />
            </label>
            <label className="text-xs text-gray-400">
              حالت
              <select
                value={cfg.jsonAssert?.mode || "exists"}
                onChange={(e) => set({ jsonAssert: { path: cfg.jsonAssert?.path || "", mode: e.target.value } })}
                disabled={!cfg.jsonAssert?.path}
                className={`mt-1 w-full ${inputCls} disabled:opacity-50`}
              >
                <option value="exists">باید وجود داشته باشه</option>
                <option value="absent">نباید وجود داشته باشه</option>
              </select>
            </label>
          </div>

          <label className="block text-xs text-gray-400">
            هدرهای سفارشی (هر خط: Key: Value)
            <textarea
              dir="ltr"
              rows={2}
              value={headersToText(cfg.headers)}
              onChange={(e) => set({ headers: textToHeaders(e.target.value) })}
              placeholder="Authorization: Bearer ..."
              className={`mt-1 w-full ${inputCls}`}
            />
          </label>

          {cfg.method === "POST" && (
            <label className="block text-xs text-gray-400">
              بدنه‌ی درخواست (body)
              <textarea
                dir="ltr"
                rows={2}
                value={cfg.body || ""}
                onChange={(e) => set({ body: e.target.value || undefined })}
                className={`mt-1 w-full ${inputCls}`}
              />
            </label>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-gray-400">
              Basic Auth — نام کاربری
              <input
                dir="ltr"
                value={cfg.basicAuth?.user || ""}
                onChange={(e) =>
                  set({ basicAuth: e.target.value || cfg.basicAuth?.pass ? { user: e.target.value, pass: cfg.basicAuth?.pass || "" } : undefined })
                }
                className={`mt-1 w-full ${inputCls}`}
              />
            </label>
            <label className="text-xs text-gray-400">
              Basic Auth — رمز
              <input
                dir="ltr"
                type="password"
                value={cfg.basicAuth?.pass || ""}
                onChange={(e) => set({ basicAuth: { user: cfg.basicAuth?.user || "", pass: e.target.value } })}
                className={`mt-1 w-full ${inputCls}`}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
