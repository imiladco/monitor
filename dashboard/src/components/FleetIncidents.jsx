import { Link } from "react-router-dom";

function since(iso) {
  if (!iso) return "";
  // SQLite timestamps are UTC ("YYYY-MM-DD HH:MM:SS") — normalize to ISO.
  const started = new Date(iso.replace(" ", "T") + "Z").getTime();
  const mins = Math.max(0, Math.round((Date.now() - started) / 60000));
  if (mins < 60) return `${mins} دقیقه`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} ساعت و ${m} دقیقه` : `${h} ساعت`;
}

export default function FleetIncidents({ incidents, onAcknowledge }) {
  if (!incidents || incidents.length === 0) return null;

  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-bad/40 bg-bad/5">
      <div className="flex items-center justify-between border-b border-bad/20 px-4 py-2">
        <h3 className="text-sm font-medium text-bad">🔴 رخدادهای باز</h3>
        <span className="tnum text-xs text-bad">{incidents.length}</span>
      </div>
      <div>
        {incidents.map((i) => (
          <div key={i.id} className="flex items-center gap-3 border-b border-bad/10 px-4 py-2 text-xs last:border-0">
            <span className={`h-2 w-2 shrink-0 rounded-full ${i.flapping ? "bg-warn" : "bg-bad"}`} />
            <Link to={`/?site=${i.site_id}`} className="font-medium text-content hover:text-accent">
              {i.site_name}
            </Link>
            <span className="truncate text-content-secondary">{i.title}</span>
            {i.flapping ? <span className="rounded bg-warn/15 px-1.5 py-0.5 text-[10px] text-warn">ناپایدار</span> : null}
            <span className="tnum mr-auto shrink-0 text-muted">{since(i.started_at)}</span>
            {i.status === "acknowledged" ? (
              <span className="shrink-0 text-[11px] text-muted">تأییدشده</span>
            ) : (
              <button
                onClick={() => onAcknowledge(i.id)}
                className="shrink-0 rounded border border-border-strong px-2 py-0.5 text-[11px] text-content-secondary hover:bg-surface-hover"
              >
                تأیید
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
