# Site Monitor — API Reference

Base URL: `http://<your-server>:4000/api`

## Authentication

Three separate auth schemes are used, one per audience:

| Audience | Scheme | Header/param |
|---|---|---|
| Dashboard (admin) | Shared password | `X-Admin-Password: <ADMIN_PASSWORD>` (or `?pw=` query param for `<img>`/download links) |
| WordPress agent | Per-site API key | `X-Api-Key: <site's key>` |
| Public status page | URL token | Baked into the path: `/api/public/status/:token` |

All admin routes below require `X-Admin-Password` unless noted otherwise. `POST /api/auth/login` is used by the dashboard UI to validate a password (+ 2FA code, if enabled) before storing it client-side — it's not a session/cookie mechanism; the password itself is resent as a header on every subsequent request.

## Health

- `GET /health` — unauthenticated. `{ ok, version, uptimeSec, sitesCount, lastCheckAt }`

## Auth

- `POST /auth/login` — `{ password, code? }` → `{ ok: true }` or `401 { error, require2fa? }`

## Sites

- `GET /sites` — list with live status, recent-check bars, pause/public/client flags
- `POST /sites` — `{ name, url, checkoutUrl?, keyword?, keywordMode?, client? }`
- `GET /sites/:id` — full detail incl. agent snapshot, uptime %, domain/SSL, screenshot info
- `PUT /sites/:id` — same body shape as create
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

## Public

- `GET /public/status/:token` — unauthenticated; sites flagged `public` only, minimal fields (no API keys)
- `GET /branding` — unauthenticated; `{ name, logoUrl }` for the login screen

## WordPress agent ingest (per-site `X-Api-Key`)

- `POST /ingest` — full snapshot (plugins/theme/core/users/db size/core integrity); server diffs against the previous snapshot and generates Time Machine events
- `POST /ingest/event` — one-off, time-sensitive event (e.g. brute-force detection) that bypasses the diff cycle
