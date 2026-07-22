import { useEffect, useState } from "react";
import { Routes, Route, Link } from "react-router-dom";
import SitesList from "./pages/SitesList.jsx";
import SiteDetail from "./pages/SiteDetail.jsx";
import SettingsPage from "./pages/Settings.jsx";
import Login, { isLoggedIn } from "./components/Login.jsx";

export default function App() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());

  useEffect(() => {
    const onAuthError = () => setLoggedIn(false);
    window.addEventListener("auth-error", onAuthError);
    return () => window.removeEventListener("auth-error", onAuthError);
  }, []);

  if (!loggedIn) {
    return <Login onSuccess={() => setLoggedIn(true)} />;
  }

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-border bg-panel/60 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-base font-semibold text-gray-100">
            🛰️ Site Monitor
          </Link>
          <Link to="/settings" className="text-sm text-gray-500 hover:text-gray-300">
            تنظیمات
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Routes>
          <Route path="/" element={<SitesList />} />
          <Route path="/sites/:id" element={<SiteDetail />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}
