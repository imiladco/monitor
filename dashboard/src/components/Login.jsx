import { useState } from "react";
import { api, getPassword } from "../api.js";

export default function Login({ onSuccess }) {
  const [password, setPasswordInput] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.login(password);
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-border bg-panel p-6">
        <h1 className="mb-1 text-lg font-semibold text-gray-100">🛰️ Site Monitor</h1>
        <p className="mb-4 text-sm text-gray-500">برای ورود به داشبورد رمز عبور رو وارد کن</p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPasswordInput(e.target.value)}
          placeholder="رمز عبور"
          className="w-full rounded-lg border border-border bg-panel2 px-3 py-2 text-gray-100 outline-none focus:border-accent"
        />
        {error && <p className="mt-2 text-sm text-bad">{error}</p>}
        <button
          type="submit"
          disabled={loading || !password}
          className="mt-4 w-full rounded-lg bg-accent px-3 py-2 font-medium text-white disabled:opacity-50"
        >
          {loading ? "..." : "ورود"}
        </button>
      </form>
    </div>
  );
}

export function isLoggedIn() {
  return Boolean(getPassword());
}
