// Validates and normalizes an agent snapshot before it's stored/diffed.
// Without this, a leaked agent key could push arbitrary bloated objects into
// SQLite, poison the timeline, or fake alerts. Enforces types and caps sizes.
// Returns { ok: true, snapshot } or { ok: false, error }.

const MAX_PLUGINS = 500;
const MAX_USERS = 2000;
const MAX_STR = 512;

function str(v, max = MAX_STR) {
  return typeof v === "string" ? v.slice(0, max) : null;
}

export function validateSnapshot(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "snapshot must be an object" };
  }

  const out = {};

  if (input.wpVersion != null) out.wpVersion = str(input.wpVersion, 32);

  if (input.theme != null) {
    if (typeof input.theme !== "object") return { ok: false, error: "theme must be an object" };
    out.theme = { name: str(input.theme.name), version: str(input.theme.version, 32) };
  }

  if (input.plugins != null) {
    if (!Array.isArray(input.plugins)) return { ok: false, error: "plugins must be an array" };
    if (input.plugins.length > MAX_PLUGINS) return { ok: false, error: `too many plugins (max ${MAX_PLUGINS})` };
    out.plugins = input.plugins.map((p) => ({
      slug: str(p?.slug, 128),
      name: str(p?.name),
      version: str(p?.version, 32),
      active: Boolean(p?.active),
    }));
  }

  if (input.users != null) {
    if (!Array.isArray(input.users)) return { ok: false, error: "users must be an array" };
    if (input.users.length > MAX_USERS) return { ok: false, error: `too many users (max ${MAX_USERS})` };
    out.users = input.users.map((u) => ({
      id: Number.isFinite(u?.id) ? u.id : null,
      login: str(u?.login, 128),
      roles: Array.isArray(u?.roles) ? u.roles.slice(0, 20).map((r) => str(r, 64)) : [],
    }));
  }

  if (input.dbSizeMb != null) {
    const n = Number(input.dbSizeMb);
    out.dbSizeMb = Number.isFinite(n) && n >= 0 ? n : null;
  }

  if (input.coreIntegrity != null) {
    if (typeof input.coreIntegrity !== "object") return { ok: false, error: "coreIntegrity must be an object" };
    const files = Array.isArray(input.coreIntegrity.modifiedFiles)
      ? input.coreIntegrity.modifiedFiles.slice(0, 200).map((f) => ({ file: str(f?.file, 256), issue: str(f?.issue, 32) }))
      : [];
    out.coreIntegrity = { modifiedFiles: files, checkedAt: str(input.coreIntegrity.checkedAt, 32) };
  }

  if (input.updatesAvailable != null) {
    if (!Array.isArray(input.updatesAvailable)) return { ok: false, error: "updatesAvailable must be an array" };
    out.updatesAvailable = input.updatesAvailable.slice(0, MAX_PLUGINS).map((u) => ({
      type: str(u?.type, 16),
      slug: str(u?.slug, 128),
      name: str(u?.name),
      currentVersion: str(u?.currentVersion, 32),
      newVersion: str(u?.newVersion, 32),
    }));
  }

  return { ok: true, snapshot: out };
}
