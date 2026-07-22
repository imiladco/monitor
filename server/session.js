import crypto from "node:crypto";
import { env } from "./config.js";

export const SESSION_COOKIE = "sm_session";

// Parse a single cookie value out of the request's Cookie header. Kept tiny
// and dependency-free — we only ever read our own session cookie.
export function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

export function newSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

// httpOnly so JS (and any XSS) can't read it; SameSite=Strict so it isn't
// sent on cross-site requests (CSRF); Secure only when TLS is in front.
export function setSessionCookie(res, token) {
  const attrs = [
    `${SESSION_COOKIE}=${token}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
    `Max-Age=${env.sessionTtlHours * 3600}`,
  ];
  if (env.secureCookies) attrs.push("Secure");
  res.append("Set-Cookie", attrs.join("; "));
}

export function clearSessionCookie(res) {
  const attrs = [`${SESSION_COOKIE}=`, "HttpOnly", "SameSite=Strict", "Path=/", "Max-Age=0"];
  if (env.secureCookies) attrs.push("Secure");
  res.append("Set-Cookie", attrs.join("; "));
}
