# Site Monitor — API Reference

Base URL: `http://<your-server>:4000/api`

## Authentication

Three separate auth schemes are used, one per audience:

| Audience | Scheme | Header/param |
|---|---|---|
| Dashboard (admin) | Session cookie | `sm_session` httpOnly cookie, minted by `POST /api/auth/login` |
| WordPress agent | Per-site API key | `X-Api-Key: <site's key>` |
| Public status page | URL token | Baked into the path: `/api/public/status/:token` |

All admin routes below require a valid session cookie unless noted otherwise. `POST /api/auth/login` verifies the admin password (+ 2FA code, if TOTP is enabled) and, on success, sets an httpOnly `SameSite=Strict` `sm_session` cookie holding an opaque server-side session token — the password itself is never resent. The cookie is sent automatically on same-origin requests, including `<img>`/download links, so no query-param fallback is needed. Set `SECURE_COOKIES=true` once the panel is served over HTTPS to add the `Secure` flag. Sessions last `SESSION_TTL_HOURS` (default 168).

## Health

- `GET /health` — unauthenticated. `{ ok, version, uptimeSec, sitesCount, lastCheckAt }`

## Auth

- `POST /auth/login` — `{ password, code? }` → `{ ok: true }` (+ sets `sm_session` cookie) or `401 { error, require2fa? }`
- `GET /auth/session` — `{ authenticated: boolean }` — lets the UI check the (httpOnly) cookie on load
- `POST /auth/logout` — destroys the session and clears the cookie → `{ ok: true }`

## Sites

- `GET /sites` — list with live status, recent-check bars, pause/public/client flags
- `POST /sites` — `{ name, url, checkoutUrl?, keyword?, keywordMode?, client? }` → `{ id, apiKey }`. The agent `apiKey` is returned **once**; only its SHA-256 hash is stored, so it can't be shown again.
- `GET /sites/:id` — full detail incl. agent snapshot, uptime %, domain/SSL, screenshot info. Returns `hasAgentKey` (boolean), never the key itself.
- `PUT /sites/:id` — same body shape as create
- `POST /sites/:id/regenerate-key` → `{ apiKey }` — rotates the agent key and returns the new raw key once. The old key stops working immediately; update the WordPress agent with the new one.
- `DELETE /sites/:id`
- `PATCH /sites/:id/pause` — `{ paused: boolean }`
- `PATCH /sites/:id/public` — `{ public: boolean }` — include on the public status page
- `GET /sites/:id/checks?type=uptime|ssl&limit=` — check history
- `GET /sites/:id/timeline?limit=` — Time Machine events
- `GET /sites/:id/vitals` — LCP/CLS/TTFB history
- `GET /sites/:id/screenshot` — latest homepage screenshot (binary)
- `GET /sites/:id/sla-report?days=7|30|90` — downloadable CSV: uptime % + incident list

## Maintenance windows

- `GET /sites/:id/maintenance-windows` — site-specific + global (`site_id: null`) windows
- `POST /maintenance-windows` — `{ siteId?: number|null, note?, startsAt, endsAt }` (UTC `YYYY-MM-DD HH:MM:SS`); omit/null `siteId` to apply to all sites
- `DELETE /maintenance-windows/:id`

While a window is active, checks and Time Machine events still record normally — only Telegram alerts are suppressed.

## Port (TCP) monitors

- `GET /sites/:id/port-checks`
- `POST /sites/:id/port-checks` — `{ label, host, port }`
- `DELETE /port-checks/:id`

## Remote actions (off by default)

Gated by `remote_actions_enabled` — `POST /sites/:id/commands` returns `403` until enabled from Settings.

- `GET /settings/remote-actions` / `PUT /settings/remote-actions` — `{ enabled: boolean }`
- `GET /sites/:id/commands` — command history
- `POST /sites/:id/commands` — `{ type: "update_plugin"|"update_theme"|"update_core"|"clear_cache", params?: { slug } }`

Agent-facing (own `X-Api-Key` auth, not admin password):
- `GET /agent/commands` — claims this site's pending commands (marks them `running`)
- `POST /agent/commands/:id/result` — `{ status: "done"|"failed", result: string }`

## Vulnerabilities (CVE cross-reference)

- `GET /vulnerabilities` — fleet-wide active findings (one row per vuln × site)
- `GET /sites/:id/vulnerabilities` — active findings for one site
- `POST /vulnerabilities` — manual entry: `{ pluginSlug, affectedVersions, fixedIn?, severity?, title, description?, cveId?, referenceUrl? }` (stored as `source:'manual'`)
- `DELETE /vulnerabilities/:id`
- `POST /sites/:id/vulnerabilities/:vulnId/resolve` — mark one site's finding resolved (false positive / manual fix)
- `POST /vulnerabilities/scan` — trigger a scan now (also runs daily at `VULN_SYNC_HOUR`)

## Fleet Learning / Update Guard

- `GET /fleet-alerts` — recent bad/suspicious upgrade verdicts across the fleet
- `GET /sites/:id/holds` — active update holds on one site
- `POST /holds/:id/release` — lift a hold (admin)

Agent-facing (own `X-Api-Key` auth):
- `GET /update-check?plugin=&from=&to=` — `{ verdict, hold, reason, evidence_count }`; the agent calls this before showing/applying an update

## Settings

- `GET /settings` / `PUT /settings` — Telegram bot token / chat id / group id (bot token is masked in responses)
- `POST /settings/test-telegram` — sends a test message to the default chat
- `POST /settings/telegram-discover-group` — finds the most recent group chat the bot has seen a message in
- `GET /settings/telegram-topics` / `PUT /settings/telegram-topics/:category` — per-category forum topic mapping
- `POST /settings/telegram-topics/setup` — auto-creates forum topics for all 7 categories
- `POST /settings/telegram-topics/:category/test`
- `GET /settings/status-page` / `POST /settings/status-page/regenerate` — public status page token
- `GET /settings/2fa` / `POST /settings/2fa/setup` / `POST /settings/2fa/confirm` / `POST /settings/2fa/disable`
- `GET /settings/branding` / `PUT /settings/branding` — `{ name, logoUrl }`, white-label the dashboard/login
- `GET /settings/mcp-keys` — list MCP keys (name, created/last-used; never the raw key)
- `POST /settings/mcp-keys` — `{ name }` → returns the raw key **once** (only the SHA-256 hash is stored)
- `DELETE /settings/mcp-keys/:id` — revoke a key

## MCP read API (`/api/mcp/*`, `Authorization: Bearer <mcp-key>`)

Read-only, for the MCP server (`mcp-server/`). Separate auth from the admin password.
- `GET /mcp/sites`, `GET /mcp/sites/:id`, `GET /mcp/sites/:id/uptime?days=`, `GET /mcp/sites/:id/timeline`
- `GET /mcp/incidents?days=&site_id=`, `GET /mcp/fleet-summary`
- `GET /mcp/search?plugin=|slow_ms=|ssl_within_days=`, `GET /mcp/plugin/:slug`, `GET /mcp/vulnerabilities`

## Public

- `GET /public/status/:token` — unauthenticated; sites flagged `public` only, minimal fields (no API keys)
- `GET /branding` — unauthenticated; `{ name, logoUrl }` for the login screen

## WordPress agent ingest (per-site `X-Api-Key`)

- `POST /ingest` — full snapshot (plugins/theme/core/users/db size/core integrity); server diffs against the previous snapshot and generates Time Machine events
- `POST /ingest/event` — one-off, time-sensitive event (e.g. brute-force detection) that bypasses the diff cycle
