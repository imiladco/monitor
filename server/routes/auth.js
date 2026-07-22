import { Router } from "express";
import crypto from "node:crypto";
import { env } from "../config.js";
import { getSetting, createSession, deleteSession, getValidSession } from "../db.js";
import { verifyToken } from "../totp.js";
import {
  SESSION_COOKIE,
  readCookie,
  newSessionToken,
  setSessionCookie,
  clearSessionCookie,
} from "../session.js";

export const authRouter = Router();

// Constant-time password comparison so login timing can't be used to recover
// the password character by character.
function passwordMatches(provided) {
  if (typeof provided !== "string") return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(env.adminPassword);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

authRouter.post("/login", (req, res) => {
  if (!env.adminPassword) {
    return res.status(500).json({ error: "ADMIN_PASSWORD is not set on the server" });
  }
  const { password, code } = req.body || {};
  if (!passwordMatches(password)) {
    return res.status(401).json({ error: "invalid password" });
  }

  const totpEnabled = getSetting("totp_enabled", "") === "1";
  if (totpEnabled) {
    const secret = getSetting("totp_secret", "");
    if (!secret || !verifyToken(secret, code)) {
      return res.status(401).json({ error: "کد ورود دومرحله‌ای نامعتبره", require2fa: true });
    }
  }

  const token = newSessionToken();
  createSession(token, env.sessionTtlHours);
  setSessionCookie(res, token);
  res.json({ ok: true });
});

// Lets the dashboard learn on load whether the existing cookie is still valid,
// since it's httpOnly and unreadable from JS.
authRouter.get("/session", (req, res) => {
  const token = readCookie(req, SESSION_COOKIE);
  res.json({ authenticated: Boolean(getValidSession(token)) });
});

authRouter.post("/logout", (req, res) => {
  deleteSession(readCookie(req, SESSION_COOKIE));
  clearSessionCookie(res);
  res.json({ ok: true });
});
