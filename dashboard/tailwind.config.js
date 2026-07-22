export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Operational palette (Monitor v1.3). Existing class names are kept
        // (canvas/panel/panel2) and remapped to the new surfaces so components
        // reskin without structural changes; new tokens are added alongside.
        canvas: "#0A0B0F", // --bg
        surface: "#12141A", // --surface
        panel: "#12141A",
        "surface-2": "#191C24", // --surface-2
        panel2: "#191C24",
        "surface-hover": "#1E222C",
        border: "#252A36",
        "border-strong": "#2F3543",
        accent: "#7C6BF5",
        "accent-hover": "#8F80F7",
        good: "#22C55E",
        ok: "#22C55E",
        warn: "#F59E0B",
        bad: "#EF4444",
        info: "#38BDF8",
        content: "#E7E9F0", // --text
        "content-secondary": "#A0A6B8",
        muted: "#6B7186",
      },
      fontFamily: {
        sans: ["Vazirmatn", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        // Smaller, crisper radii — Linear/Datadog feel rather than soft cards.
        sm: "4px",
        DEFAULT: "6px",
        md: "6px",
        lg: "8px",
        xl: "10px",
        "2xl": "12px",
      },
      transitionTimingFunction: {
        standard: "cubic-bezier(0.4, 0.0, 0.2, 1)",
      },
    },
  },
  plugins: [],
};
