import dns from "node:dns/promises";

async function safe(fn) {
  try {
    return await fn();
  } catch {
    return [];
  }
}

// Resolve the records we monitor for change: A, AAAA, NS, and MX. Each is
// sorted so the comparison against the previous snapshot is order-independent.
// Missing/erroring record types come back as empty arrays rather than throwing.
export async function resolveDns(hostname) {
  const [a, aaaa, ns, mxRaw] = await Promise.all([
    safe(() => dns.resolve4(hostname)),
    safe(() => dns.resolve6(hostname)),
    safe(() => dns.resolveNs(hostname)),
    safe(() => dns.resolveMx(hostname)),
  ]);
  const mx = mxRaw.map((r) => `${r.priority} ${r.exchange}`);
  return {
    a: [...a].sort(),
    aaaa: [...aaaa].sort(),
    ns: [...ns].map((n) => n.toLowerCase()).sort(),
    mx: mx.sort(),
  };
}
