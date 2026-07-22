// Lightweight version-range matcher for WordPress plugin/theme versions.
// WP versions are dot-separated numbers ("1.2", "1.2.3", "1.2.3.4") and don't
// follow strict semver, so we compare segment-by-segment numerically instead
// of depending on the semver package. Missing trailing segments count as 0,
// so "1.2" == "1.2.0".

export function compareVersions(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

// Matches a single wildcard clause like "1.2.*" — true when `version` shares
// the given prefix segments.
function matchWildcard(version, clause) {
  const prefix = clause.slice(0, -2); // strip ".*"
  const vp = String(version).split(".");
  const cp = prefix.split(".");
  return cp.every((seg, i) => vp[i] === seg);
}

// Supports the range grammar used in vulnerability records:
//   "<= 1.2.3", "< 1.2.3", ">= 3.0", "> 3.0", "= 1.0" / "1.0"
//   compound (whitespace-joined, all must hold): ">= 3.0 < 4.0"
//   wildcard: "1.2.*"
// Returns true if `installed` falls within the expression.
export function versionInRange(installed, rangeExpr) {
  if (!installed || !rangeExpr) return false;
  const expr = String(rangeExpr).trim();

  if (expr.endsWith(".*")) return matchWildcard(installed, expr);

  const tokens = expr.split(/\s+/);
  const clauses = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (["<=", "<", ">=", ">", "="].includes(t)) {
      clauses.push({ op: t, ver: tokens[++i] });
    } else if (/^(<=|<|>=|>|=)/.test(t)) {
      const op = t.match(/^(<=|>=|<|>|=)/)[0];
      clauses.push({ op, ver: t.slice(op.length) });
    } else {
      clauses.push({ op: "=", ver: t });
    }
  }
  if (clauses.length === 0) return false;

  return clauses.every(({ op, ver }) => {
    if (!ver) return false;
    const cmp = compareVersions(installed, ver);
    switch (op) {
      case "<=":
        return cmp <= 0;
      case "<":
        return cmp < 0;
      case ">=":
        return cmp >= 0;
      case ">":
        return cmp > 0;
      case "=":
        return cmp === 0;
      default:
        return false;
    }
  });
}
