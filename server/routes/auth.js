import { Router } from "express";
import { env } from "../config.js";

export const authRouter = Router();

authRouter.post("/login", (req, res) => {
  if (!env.adminPassword) {
    return res.status(500).json({ error: "ADMIN_PASSWORD is not set on the server" });
  }
  const { password } = req.body || {};
  if (password !== env.adminPassword) {
    return res.status(401).json({ error: "invalid password" });
  }
  res.json({ ok: true });
});
