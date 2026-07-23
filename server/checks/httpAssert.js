// Helpers for the advanced HTTP monitor: status-code matching and JSON-path
// assertions. Kept pure and dependency-free so they're easy to unit test.

// Match a status code against a spec like "200", "200-299", or "200,201,404".
// Returns true/false. An empty spec means "no explicit expectation".
export function matchStatus(code, spec) {
  if (!spec) return null;
  for (const token of String(spec).split(",")) {
    const t = token.trim();
    if (!t) continue;
    const range = t.match(/^(\d{3})\s*-\s*(\d{3})$/);
    if (range) {
      if (code >= Number(range[1]) && code <= Number(range[2])) return true;
    } else if (/^\d{3}$/.test(t)) {
      if (code === Number(t)) return true;
    }
  }
  return false;
}

// Resolve a dot/bracket path ("data.items.0.id" or "data[0].id") against a
// parsed object. Returns { found, value }.
export function getJsonPath(obj, path) {
  if (!path) return { found: false, value: undefined };
  const parts = String(path)
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object" || !(p in cur)) {
      return { found: false, value: undefined };
    }
    cur = cur[p];
  }
  return { found: true, value: cur };
}
