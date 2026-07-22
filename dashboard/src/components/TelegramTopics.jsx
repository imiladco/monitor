import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function TelegramTopics({ groupId, onGroupIdChange, onGroupIdSaved }) {
  const [discovering, setDiscovering] = useState(false);
  const [discoverResult, setDiscoverResult] = useState(null);
  const [topics, setTopics] = useState(null);
  const [settingUp, setSettingUp] = useState(false);
  const [setupResult, setSetupResult] = useState(null);
  const [testResults, setTestResults] = useState({});

  async function loadTopics() {
    setTopics(await api.telegramTopics());
  }

  useEffect(() => {
    loadTopics();
  }, []);

  async function discoverGroup() {
    setDiscovering(true);
    setDiscoverResult(null);
    try {
      const result = await api.discoverTelegramGroup();
      setDiscoverResult(result);
      if (result.ok) {
        onGroupIdChange(result.chatId);
        await onGroupIdSaved(result.chatId);
      }
    } catch (err) {
      setDiscoverResult({ ok: false, error: err.message });
    } finally {
      setDiscovering(false);
    }
  }

  async function setupTopics() {
    setSettingUp(true);
    setSetupResult(null);
    try {
      const { results } = await api.setupTelegramTopics();
      setSetupResult(results);
      await loadTopics();
    } catch (err) {
      setSetupResult([{ ok: false, error: err.message }]);
    } finally {
      setSettingUp(false);
    }
  }

  async function saveManualThreadId(category, value) {
    if (!value) return;
    await api.setTelegramTopic(category, value);
    await loadTopics();
  }

  async function testTopic(category) {
    setTestResults((r) => ({ ...r, [category]: "loading" }));
    const result = await api.testTelegramTopic(category);
    setTestResults((r) => ({ ...r, [category]: result }));
  }

  return (
    <div className="mt-4 max-w-2xl rounded-2xl border border-border bg-panel p-6">
      <h3 className="mb-1 font-medium text-gray-100">گروه و تاپیک‌های تلگرام</h3>
      <p className="mb-4 text-xs text-gray-500">
        هر دسته از لاگ‌ها (امنیت، وضعیت، افزونه، ...) رو می‌تونی به یه تاپیک جدا توی گروه بفرستی. اول ربات رو به
        گروه اضافه کن، ادمینش کن (با اجازه‌ی «Manage Topics»)، تاپیک‌ها (Topics) رو توی تنظیمات گروه فعال کن، یه پیام
        توی گروه بفرست، بعد دکمه‌ی زیر رو بزن.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          dir="ltr"
          value={groupId}
          onChange={(e) => onGroupIdChange(e.target.value)}
          onBlur={(e) => onGroupIdSaved(e.target.value)}
          placeholder="Group Chat ID (مثلاً -1001234567890)"
          className="min-w-[220px] flex-1 rounded-lg border border-border bg-panel2 px-3 py-2 text-gray-100 outline-none focus:border-accent"
        />
        <button
          onClick={discoverGroup}
          disabled={discovering}
          className="rounded-lg bg-panel2 px-3 py-2 text-sm text-gray-300 hover:bg-border disabled:opacity-50"
        >
          {discovering ? "در حال جستجو…" : "شناسایی خودکار گروه"}
        </button>
      </div>
      {discoverResult && (
        <p className={`mt-2 text-sm ${discoverResult.ok ? "text-good" : "text-bad"}`}>
          {discoverResult.ok ? `✅ پیدا شد: ${discoverResult.title}` : `❌ ${discoverResult.error}`}
        </p>
      )}

      {groupId && (
        <>
          <button
            onClick={setupTopics}
            disabled={settingUp}
            className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {settingUp ? "در حال ساخت…" : "ساخت خودکار همه‌ی تاپیک‌ها"}
          </button>
          {setupResult && (
            <p className="mt-2 text-xs text-gray-500">
              {setupResult.filter((r) => r.ok && !r.skipped).length} تاپیک جدید ساخته شد،{" "}
              {setupResult.filter((r) => r.skipped).length} از قبل بود
              {setupResult.some((r) => !r.ok) &&
                `، ${setupResult.filter((r) => !r.ok).length} ناموفق (${setupResult.find((r) => !r.ok)?.error})`}
            </p>
          )}

          {topics && (
            <div className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border">
              {topics.map((t) => (
                <div key={t.key} className="flex flex-wrap items-center gap-2 bg-panel2 p-3">
                  <span className="w-28 shrink-0 text-sm text-gray-200">
                    {t.icon} {t.label}
                  </span>
                  <input
                    dir="ltr"
                    defaultValue={t.threadId ?? ""}
                    onBlur={(e) => saveManualThreadId(t.key, e.target.value)}
                    placeholder="thread id (دستی)"
                    className="w-40 rounded-lg border border-border bg-panel px-2 py-1 text-sm text-gray-100 outline-none focus:border-accent"
                  />
                  <button
                    onClick={() => testTopic(t.key)}
                    disabled={!t.threadId || testResults[t.key] === "loading"}
                    className="rounded-lg bg-panel px-2 py-1 text-xs text-gray-300 hover:bg-border disabled:opacity-40"
                  >
                    تست
                  </button>
                  {testResults[t.key] && testResults[t.key] !== "loading" && (
                    <span className={`text-xs ${testResults[t.key].ok ? "text-good" : "text-bad"}`}>
                      {testResults[t.key].ok ? "✓ ارسال شد" : `✗ ${testResults[t.key].error}`}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
