import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function TwoFactorSettings() {
  const [enabled, setEnabled] = useState(null);
  const [setupData, setSetupData] = useState(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    api.twoFactorStatus().then((s) => setEnabled(s.enabled));
  }, []);

  async function startSetup() {
    setError(null);
    const data = await api.twoFactorSetup();
    setSetupData(data);
  }

  async function confirm(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.twoFactorConfirm(code);
      setEnabled(true);
      setSetupData(null);
      setCode("");
    } catch (err) {
      setError(err.message);
    }
  }

  async function disable(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.twoFactorDisable(code);
      setEnabled(false);
      setCode("");
    } catch (err) {
      setError(err.message);
    }
  }

  if (enabled === null) return null;

  return (
    <div className="mt-4 max-w-md rounded-2xl border border-border bg-panel p-6">
      <h3 className="mb-1 font-medium text-gray-100">تایید دومرحله‌ای (2FA)</h3>
      <p className="mb-3 text-xs text-gray-500">
        یه لایه‌ی امنیتی اضافه با گوگل Authenticator/Authy — حتی اگه رمز عبور لو بره، بدون کد اپ نمی‌شه وارد شد.
      </p>

      {enabled && !setupData && (
        <form onSubmit={disable} className="space-y-2">
          <p className="text-sm text-good">✅ فعاله</p>
          <input
            dir="ltr"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="کد فعلی برای غیرفعال‌سازی"
            className="w-full rounded-lg border border-border bg-panel2 px-3 py-2 text-center text-gray-100 outline-none focus:border-accent"
          />
          <button type="submit" className="rounded-lg bg-bad/20 px-3 py-1.5 text-sm text-bad hover:bg-bad/30">
            غیرفعال کردن
          </button>
        </form>
      )}

      {!enabled && !setupData && (
        <button onClick={startSetup} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
          فعال‌سازی
        </button>
      )}

      {setupData && (
        <form onSubmit={confirm} className="space-y-3">
          <img src={setupData.qrDataUrl} alt="QR کد 2FA" className="rounded-lg bg-white p-2" width={180} height={180} />
          <p className="text-xs text-gray-500">
            با اپ Google Authenticator یا Authy این QR رو اسکن کن، یا دستی وارد کن:
            <code className="mx-1 break-all text-gray-300" dir="ltr">
              {setupData.secret}
            </code>
          </p>
          <input
            dir="ltr"
            inputMode="numeric"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="کد ۶ رقمی"
            className="w-full rounded-lg border border-border bg-panel2 px-3 py-2 text-center text-gray-100 outline-none focus:border-accent"
          />
          <div className="flex gap-2">
            <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
              تایید و فعال‌سازی
            </button>
            <button
              type="button"
              onClick={() => setSetupData(null)}
              className="rounded-lg bg-panel2 px-4 py-2 text-sm text-gray-300"
            >
              انصراف
            </button>
          </div>
        </form>
      )}

      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
    </div>
  );
}
