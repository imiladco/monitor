import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import TelegramTopics from "../components/TelegramTopics.jsx";
import TwoFactorSettings from "../components/TwoFactorSettings.jsx";
import RemoteActionsToggle from "../components/RemoteActionsToggle.jsx";
import BrandingSettings from "../components/BrandingSettings.jsx";
import McpAccess from "../components/McpAccess.jsx";
import SystemHealth from "../components/SystemHealth.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { useToast } from "../components/Toast.jsx";

export default function SettingsPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const [form, setForm] = useState({ telegramBotToken: "", telegramChatId: "", telegramGroupId: "" });
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [statusToken, setStatusToken] = useState(null);
  const [copiedStatusLink, setCopiedStatusLink] = useState(false);

  useEffect(() => {
    api.settings().then((s) => {
      setForm({
        telegramBotToken: s.telegramBotToken,
        telegramChatId: s.telegramChatId,
        telegramGroupId: s.telegramGroupId,
      });
      setLoading(false);
    });
    api.statusPage().then((s) => setStatusToken(s.token));
  }, []);

  const statusPageUrl = statusToken ? `${window.location.origin}/#/status/${statusToken}` : "";

  async function regenerateStatusPage() {
    const ok = await confirm({
      title: "ساخت لینک جدید",
      message: "لینک قبلی پیج وضعیت دیگه کار نمی‌کنه. مطمئنی؟",
      danger: true,
    });
    if (!ok) return;
    const { token } = await api.regenerateStatusPage();
    setStatusToken(token);
    toast.success("لینک جدید ساخته شد");
  }

  async function submit(e) {
    e.preventDefault();
    await api.updateSettings(form);
    setSaved(true);
    toast.success("تنظیمات ذخیره شد");
    setTimeout(() => setSaved(false), 2000);
  }

  async function testTelegram() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.testTelegram();
      setTestResult(result);
    } catch (err) {
      setTestResult({ ok: false, error: err.message });
    } finally {
      setTesting(false);
    }
  }

  if (loading) return <div className="text-gray-500">در حال بارگذاری…</div>;

  return (
    <div>
      <Link to="/" className="text-sm text-gray-500 hover:text-gray-300">
        ← بازگشت به لیست سایت‌ها
      </Link>
      <h2 className="mb-6 mt-3 text-lg font-semibold text-gray-100">تنظیمات</h2>

      <TwoFactorSettings />
      <RemoteActionsToggle />
      <BrandingSettings />
      <McpAccess />
      <SystemHealth />

      <h3 className="mb-3 mt-8 font-medium text-gray-100">تلگرام</h3>
      <form onSubmit={submit} className="max-w-md space-y-4 rounded-2xl border border-border bg-panel p-6">
        <div>
          <label className="mb-1 block text-sm text-gray-400">Bot Token</label>
          <input
            dir="ltr"
            value={form.telegramBotToken}
            onChange={(e) => setForm({ ...form, telegramBotToken: e.target.value })}
            placeholder="123456:ABC-your-bot-token"
            className="w-full rounded-lg border border-border bg-panel2 px-3 py-2 text-gray-100 outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-gray-400">Chat ID</label>
          <input
            dir="ltr"
            value={form.telegramChatId}
            onChange={(e) => setForm({ ...form, telegramChatId: e.target.value })}
            placeholder="123456789"
            className="w-full rounded-lg border border-border bg-panel2 px-3 py-2 text-gray-100 outline-none focus:border-accent"
          />
        </div>
        <button type="submit" className="rounded-lg bg-accent px-4 py-2 font-medium text-white">
          ذخیره
        </button>
        {saved && <span className="mr-3 text-sm text-good">ذخیره شد ✓</span>}
      </form>

      <div className="mt-4 max-w-md rounded-2xl border border-border bg-panel p-6">
        <button
          onClick={testTelegram}
          disabled={testing}
          className="rounded-lg bg-panel2 px-4 py-2 text-sm text-gray-300 hover:bg-border disabled:opacity-50"
        >
          {testing ? "در حال ارسال…" : "ارسال پیام تست"}
        </button>
        {testResult && (
          <p className={`mt-3 text-sm ${testResult.ok ? "text-good" : "text-bad"}`}>
            {testResult.ok ? "✅ پیام تست ارسال شد — چک کن توی تلگرام رسیده باشه" : `❌ ${testResult.error}`}
          </p>
        )}
      </div>

      <div className="mt-4 max-w-md rounded-2xl border border-border bg-panel p-6">
        <h3 className="mb-1 font-medium text-gray-100">صفحه‌ی وضعیت عمومی</h3>
        <p className="mb-3 text-xs text-gray-500">
          یه لینک بدون نیاز به رمز، فقط برای سایت‌هایی که «نمایش عمومی» روشونه (از صفحه‌ی هر سایت فعالش کن).
        </p>
        {statusPageUrl && (
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-panel2 px-2 py-1 text-xs text-gray-300" dir="ltr">
              {statusPageUrl}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(statusPageUrl);
                setCopiedStatusLink(true);
                setTimeout(() => setCopiedStatusLink(false), 1500);
              }}
              className="shrink-0 rounded-md bg-panel2 px-2 py-1 text-xs text-gray-300 hover:bg-border"
            >
              {copiedStatusLink ? "کپی شد ✓" : "کپی"}
            </button>
          </div>
        )}
        <button
          onClick={regenerateStatusPage}
          className="mt-3 rounded-lg bg-panel2 px-3 py-1.5 text-xs text-gray-300 hover:bg-border"
        >
          ساخت لینک جدید (لینک قبلی غیرفعال می‌شه)
        </button>
      </div>

      <TelegramTopics
        groupId={form.telegramGroupId}
        onGroupIdChange={(v) => setForm({ ...form, telegramGroupId: v })}
        onGroupIdSaved={(v) => api.updateSettings({ ...form, telegramGroupId: v })}
      />

      <p className="mt-4 max-w-md text-xs text-gray-500">
        با <a className="text-accent" href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a> یه
        ربات بساز و توکنش رو بگیر، بعد به ربات پیام بده و از{" "}
        <code className="text-gray-400" dir="ltr">
          api.telegram.org/bot&lt;TOKEN&gt;/getUpdates
        </code>{" "}
        مقدار chat.id رو پیدا کن.
      </p>
    </div>
  );
}
