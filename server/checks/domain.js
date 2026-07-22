import { whoisDomain } from "whoiser";

const EXPIRY_KEYS = [
  "Registry Expiry Date",
  "Expiry Date",
  "Registrar Registration Expiration Date",
  "expiration date",
  "paid-till",
  "Expiration Date",
];

function findExpiry(record) {
  for (const key of Object.keys(record)) {
    if (EXPIRY_KEYS.some((k) => k.toLowerCase() === key.toLowerCase())) {
      const date = new Date(record[key]);
      if (!Number.isNaN(date.getTime())) return date;
    }
  }
  return null;
}

export async function checkDomainExpiry(hostname) {
  const parts = hostname.split(".");
  const domain = parts.slice(-2).join("."); // best-effort: strip subdomains

  try {
    const result = await whoisDomain(domain, { follow: 1, timeout: 10000 });
    for (const server of Object.values(result)) {
      if (server?.error) continue;
      const expiresAt = findExpiry(server);
      if (expiresAt) {
        const daysLeft = Math.ceil((expiresAt - Date.now()) / (1000 * 60 * 60 * 24));
        return { ok: true, expiresAt, daysLeft };
      }
    }
    return { ok: false, error: "expiry date not found in whois response" };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
