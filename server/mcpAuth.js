import crypto from "node:crypto";
import { findMcpKeyByHash, touchMcpKey } from "./db.js";

export function hashMcpKey(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// Authenticates MCP read endpoints via `Authorization: Bearer <key>`, kept
// separate from the admin password so MCP access can be revoked on its own.
export function requireMcpKey(req, res, next) {
  const header = req.header("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ error: "missing bearer token" });

  const record = findMcpKeyByHash(hashMcpKey(match[1]));
  if (!record) return res.status(401).json({ error: "invalid mcp key" });

  touchMcpKey(record.id);
  next();
}
