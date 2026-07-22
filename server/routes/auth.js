import { Router } from "express";
import { env } from "../config.js";
import { getSetting } from "../db.js";
import { verifyToken } from "../totp.js";

export const authRouter = Router();

authRouter.post("/login", (req, res) => {
  if (!env.adminPassword) {
    return res.status(500).json({ error: "ADMIN_PASSWORD is not set on the server" });
  }
  const { password, code } = req.body || {};
  if (password !== env.adminPassword) {
    return res.status(401).json({ error: "invalid password" });
  }

  const totpEnabled = getSetting("totp_enabled", "") === "1";
  if (totpEnabled) {
    const secret = getSetting("totp_secret", "");
    if (!secret || !verifyToken(secret, code)) {
      return res.status(401).json({ error: "کد ورود دومرحله‌ای نامعتبره", require2fa: true });
    }
  }

  res.json({ ok: true });
});
