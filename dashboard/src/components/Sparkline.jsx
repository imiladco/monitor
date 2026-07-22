// Tiny inline SVG sparkline of recent response times. No library — just a
// polyline over the normalized series. Down checks (response_ms null/0) create
// gaps in the line rather than dipping to zero.
export default function Sparkline({ checks, width = 80, height = 32, color = "var(--accent)" }) {
  const values = (checks || []).map((c) => (c.ok ? c.response_ms ?? null : null));
  const nums = values.filter((v) => typeof v === "number" && v >= 0);
  if (nums.length < 2) {
    return <svg width={width} height={height} aria-label="نمودار پاسخ‌دهی (بدون داده کافی)" />;
  }

  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const pad = 3;
  const stepX = (width - pad * 2) / (values.length - 1);
  const y = (v) => pad + (1 - (v - min) / span) * (height - pad * 2);

  // Build path segments, breaking on null (down) points.
  let d = "";
  let penDown = false;
  values.forEach((v, i) => {
    if (typeof v !== "number") {
      penDown = false;
      return;
    }
    const px = pad + i * stepX;
    const py = y(v);
    d += `${penDown ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)} `;
    penDown = true;
  });

  const last = values[values.length - 1];
  const lastX = pad + (values.length - 1) * stepX;

  return (
    <svg width={width} height={height} aria-label="نمودار پاسخ‌دهی ۲۴ ساعت اخیر" className="overflow-visible">
      <path d={d.trim()} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      {typeof last === "number" && (
        <circle cx={lastX} cy={y(last)} r="1.8" fill={color} />
      )}
    </svg>
  );
}
