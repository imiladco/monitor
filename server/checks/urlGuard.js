import net from "node:net";
import dns from "node:dns/promises";

// The page-audit browser renders monitored sites, whose content we don't fully
// control (a compromised or misconfigured site can redirect or embed
// sub-resources). Since Chromium runs with --no-sandbox on the same host as the
// database and secrets, we block it from reaching internal/link-local/loopback
// addresses so a redirected page can't be used for SSRF — reading the cloud
// metadata endpoint (169.254.169.254) or hitting the monitor's own API on
// localhost.

function ipIsPrivate(ip) {
  const family = net.isIP(ip);
  if (family === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT (RFC 6598)
    return false;
  }
  if (family === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return true; // loopback
    if (lower.startsWith("fe80")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
    if (lower.startsWith("::ffff:")) return ipIsPrivate(lower.slice("::ffff:".length)); // v4-mapped
    return false;
  }
  return false;
}

export { ipIsPrivate };

// Returns true if the browser should refuse to load this URL. Resolves
// hostnames so DNS rebinding to a private address is caught too. Fails closed:
// anything unparseable, non-http(s), or unresolvable is blocked.
export async function isBlockedUrl(rawUrl) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return true;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return true;

  const host = u.hostname.replace(/^\[/, "").replace(/\]$/, "");
  if (net.isIP(host)) return ipIsPrivate(host);

  try {
    const addrs = await dns.lookup(host, { all: true });
    return addrs.length === 0 || addrs.some((a) => ipIsPrivate(a.address));
  } catch {
    return true;
  }
}
