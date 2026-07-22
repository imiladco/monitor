export default function Sparkline({ points, height = 40, width = 160, ok = true }) {
  if (!points || points.length < 2) {
    return <div className="text-xs text-gray-500">داده‌ی کافی نیست</div>;
  }

  const values = points.map((p) => p.response_ms ?? 0);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const step = width / (values.length - 1);
  const coords = values.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const color = ok ? "#22c55e" : "#ef4444";

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={coords.join(" ")}
        opacity="0.9"
      />
    </svg>
  );
}
