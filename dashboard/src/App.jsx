import { useEffect, useState } from "react";
import { Routes, Route, Link } from "react-router-dom";
import SitesList from "./pages/SitesList.jsx";
import SiteDetail from "./pages/SiteDetail.jsx";
import SettingsPage from "./pages/Settings.jsx";
import VulnerabilitiesPage from "./pages/Vulnerabilities.jsx";
import StatusPage from "./pages/StatusPage.jsx";
import Login from "./components/Login.jsx";
import { api } from "./api.js";
import { useBranding } from "./useBranding.js";
import { ToastProvider } from "./components/Toast.jsx";
import { ConfirmProvider } from "./components/ConfirmDialog.jsx";
import CommandPalette from "./components/CommandPalette.jsx";

function AdminApp() {
  // null = still checking the session cookie, then true/false.
  const [loggedIn, setLoggedIn] = useState(null);
  const branding = useBranding();

  useEffect(() => {
    api.session().then(setLoggedIn);
    const onAuthError = () => setLoggedIn(false);
    window.addEventListener("auth-error", onAuthError);
    return () => window.removeEventListener("auth-error", onAuthError);
  }, []);

  async function handleLogout() {
    await api.logout();
    setLoggedIn(false);
  }

  if (loggedIn === null) {
    return <div className="flex min-h-screen items-center justify-center bg-canvas text-gray-500">...</div>;
  }

  if (!loggedIn) {
    return <Login onSuccess={() => setLoggedIn(true)} />;
  }

  return (
    <ToastProvider>
      <ConfirmProvider>
        <CommandPalette />
        <div className="min-h-screen bg-canvas">
          <header className="border-b border-border bg-panel/60 backdrop-blur">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
              <Link to="/" className="flex items-center gap-2 text-base font-semibold text-gray-100">
                {branding.logoUrl ? (
                  <img src={branding.logoUrl} alt="" className="h-6 w-6 rounded" />
                ) : (
                  "🛰️"
                )}
                {branding.name}
              </Link>
              <div className="flex items-center gap-4">
                <Link to="/vulnerabilities" className="text-sm text-gray-500 hover:text-gray-300">
                  آسیب‌پذیری‌ها
                </Link>
                <Link to="/settings" className="text-sm text-gray-500 hover:text-gray-300">
                  تنظیمات
                </Link>
                <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-gray-300">
                  خروج
                </button>
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-5xl px-6 py-8">
            <Routes>
              <Route path="/" element={<SitesList />} />
              <Route path="/sites/:id" element={<SiteDetail />} />
              <Route path="/vulnerabilities" element={<VulnerabilitiesPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </main>
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/status/:token" element={<StatusPage />} />
      <Route path="/*" element={<AdminApp />} />
    </Routes>
  );
}
