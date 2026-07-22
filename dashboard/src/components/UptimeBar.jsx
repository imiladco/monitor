function formatTime(iso) {
  const d = new Date(iso.replace(" ", "T") + "Z");
  return d.toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "short" });
}

export default function UptimeBar({ checks, height = 36 }) {
  if (!checks || checks.length === 0) {
    return <div className="text-xs text-gray-500">داده‌ی کافی نیست</div>;
  }

  const upCount = checks.filter((c) => c.ok).length;
  const uptimePercent = ((upCount / checks.length) * 100).toFixed(2);

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{checks.length} چک اخیر</span>
        <span className={uptimePercent >= 99 ? "text-good" : uptimePercent >= 95 ? "text-warn" : "text-bad"}>
          {uptimePercent}٪ آپ‌تایم
        </span>
      </div>
      <div className="mt-1.5 flex gap-[2px]" style={{ height }}>
        {checks.map((c, i) => (
          <div
            key={c.id ?? i}
            title={`${c.ok ? "آنلاین" : "آفلاین"} — ${formatTime(c.checked_at)}${
              c.response_ms != null ? ` — ${c.response_ms}ms` : ""
            }`}
            className={`flex-1 rounded-sm transition-transform hover:scale-y-110 ${
              c.ok ? "bg-good/80 hover:bg-good" : "bg-bad/80 hover:bg-bad"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
