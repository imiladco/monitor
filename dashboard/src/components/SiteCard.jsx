import { Link } from "react-router-dom";
import UptimeBar from "./UptimeBar.jsx";

function StatusDot({ up }) {
  const color = up === null ? "bg-gray-500" : up ? "bg-good" : "bg-bad";
  const glow = up === null ? "" : up ? "shadow-[0_0_10px_2px_rgba(34,197,94,0.6)]" : "shadow-[0_0_10px_2px_rgba(239,68,68,0.6)]";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color} ${glow}`} />;
}

function sslColor(days) {
  if (days == null) return "text-gray-400";
  if (days <= 7) return "text-bad";
  if (days <= 14) return "text-warn";
  return "text-good";
}

export default function SiteCard({ site }) {
  return (
    <Link
      to={`/sites/${site.id}`}
      className="block rounded-2xl border border-border bg-panel p-5 transition hover:border-accent/60 hover:bg-panel2"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusDot up={site.up} />
          <h3 className="font-semibold text-gray-100">{site.name}</h3>
        </div>
        <span className="text-xs text-gray-500">
          {site.up === null ? "بدون داده" : site.up ? "آنلاین" : "آفلاین"}
        </span>
      </div>
      <p className="mt-1 truncate text-xs text-gray-500" dir="ltr">
        {site.url}
      </p>
      <div className="mt-4 flex items-center justify-between text-sm">
        <div>
          <div className="text-gray-500">سرعت پاسخ</div>
          <div className="font-medium text-gray-200">
            {site.responseMs != null ? `${site.responseMs}ms` : "-"}
          </div>
        </div>
        <div>
          <div className="text-gray-500">SSL</div>
          <div className={`font-medium ${sslColor(site.sslDaysLeft)}`}>
            {site.sslDaysLeft != null ? `${site.sslDaysLeft} روز` : "-"}
          </div>
        </div>
      </div>

      {site.recentChecks?.length > 1 && (
        <div className="mt-3">
          <UptimeBar checks={site.recentChecks} height={20} />
        </div>
      )}
    </Link>
  );
}
