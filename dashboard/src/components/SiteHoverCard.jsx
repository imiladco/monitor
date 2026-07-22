import { useEffect, useState } from "react";
import {
  useFloating,
  offset,
  flip,
  shift,
  useHover,
  useInteractions,
  useTransitionStyles,
  FloatingPortal,
  safePolygon,
} from "@floating-ui/react";
import Sparkline from "./Sparkline.jsx";
import { api } from "../api.js";

// Cache the detail fetch per site so repeated hovers don't re-request.
const detailCache = new Map();

function Metric({ label, value, tone = "text-content" }) {
  return (
    <div className="rounded border border-border bg-surface px-2 py-1 text-center">
      <div className="text-[10px] text-muted">{label}</div>
      <div className={`tnum text-xs ${tone}`}>{value}</div>
    </div>
  );
}

// Wraps any element showing a site name. On hover (400ms), shows a mini-card
// with status, key metrics, and a sparkline. `site` is the list-shaped object
// (name, up, responseMs, updatesCount, recentChecks); uptime is lazy-loaded.
export default function SiteHoverCard({ site, children, className = "" }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(() => detailCache.get(site.id) || null);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "top",
    middleware: [offset(8), flip(), shift({ padding: 8 })],
  });
  const hover = useHover(context, { delay: { open: 400, close: 80 }, handleClose: safePolygon() });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover]);
  const { isMounted, styles } = useTransitionStyles(context, { duration: 120 });

  useEffect(() => {
    if (open && !detail) {
      api
        .site(site.id)
        .then((d) => {
          detailCache.set(site.id, d);
          setDetail(d);
        })
        .catch(() => {});
    }
  }, [open, detail, site.id]);

  const dot = site.up === false ? "bg-bad" : site.up ? "bg-ok" : "bg-muted";

  return (
    <>
      <span ref={refs.setReference} {...getReferenceProps()} className={className}>
        {children}
      </span>
      {isMounted && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={{ ...floatingStyles, ...styles }}
            {...getFloatingProps()}
            dir="rtl"
            className="z-50 w-64 rounded-lg border border-border-strong bg-surface-2 p-3 text-xs shadow-2xl"
          >
            <div className="mb-2 flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
              <span className="font-medium text-content">{site.name}</span>
            </div>
            <div className="mb-2 grid grid-cols-3 gap-1.5">
              <Metric label="TTFB" value={site.responseMs != null ? `${site.responseMs}ms` : "—"} />
              <Metric
                label="آپتایم ۷ر"
                value={detail?.uptime7d != null ? `${detail.uptime7d}%` : "…"}
                tone={detail?.uptime7d != null && detail.uptime7d < 99 ? "text-warn" : "text-content"}
              />
              <Metric label="آپدیت" value={site.updatesCount ?? 0} tone={site.updatesCount ? "text-info" : "text-content"} />
            </div>
            {site.recentChecks?.length > 1 ? (
              <Sparkline checks={site.recentChecks} width={232} height={36} />
            ) : (
              <div className="text-center text-[10px] text-muted">بدون داده‌ی کافی</div>
            )}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
