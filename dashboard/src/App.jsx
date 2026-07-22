import { Routes, Route } from "react-router-dom";
import SitesList from "./pages/SitesList.jsx";
import SiteDetail from "./pages/SiteDetail.jsx";

export default function App() {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-border bg-panel/60 backdrop-blur">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <h1 className="text-base font-semibold text-gray-100">🛰️ Site Monitor</h1>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Routes>
          <Route path="/" element={<SitesList />} />
          <Route path="/sites/:id" element={<SiteDetail />} />
        </Routes>
      </main>
    </div>
  );
}
