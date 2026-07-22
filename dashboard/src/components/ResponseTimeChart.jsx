export default function ResponseTimeChart({ points, height = 140 }) {
  if (!points || points.length < 2) {
    return <div className="text-xs text-gray-500">داده‌ی کافی نیست</div>;
  }

  const width = 600;
  const padding = { top: 12, right: 8, bottom: 8, left: 8 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const values = points.map((p) => p.response_ms ?? 0);
  const max = Math.max(...values, 1);
  const min = 0;
  const range = max - min || 1;

  const step = innerW / (values.length - 1);
  const coords = values.map((v, i) => ({
    x: padding.left + i * step,
    y: padding.top + innerH - ((v - min) / range) * innerH,
  }));

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${coords[coords.length - 1].x.toFixed(1)},${padding.top + innerH} L${coords[0].x.toFixed(1)},${padding.top + innerH} Z`;

  const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  const gridLines = [0.25, 0.5, 0.75];

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="rt-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </linearGradient>
        </defs>
        {gridLines.map((g) => (
          <line
            key={g}
            x1={padding.left}
            x2={width - padding.right}
            y1={padding.top + innerH * g}
            y2={padding.top + innerH * g}
            stroke="#232834"
            strokeWidth="1"
          />
        ))}
        <path d={areaPath} fill="url(#rt-fill)" />
        <path d={linePath} fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="mt-1 flex justify-between text-xs text-gray-500">
        <span>میانگین: {avg}ms</span>
        <span>بیشترین: {max}ms</span>
      </div>
    </div>
  );
}
