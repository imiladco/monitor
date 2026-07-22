const STORAGE_KEY = "admin_password";

export function getPassword() {
  return localStorage.getItem(STORAGE_KEY) || "";
}

export function setPassword(password) {
  localStorage.setItem(STORAGE_KEY, password);
}

export function clearPassword() {
  localStorage.removeItem(STORAGE_KEY);
}

class AuthError extends Error {}

async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Password": getPassword(),
      ...options.headers,
    },
  });
  if (res.status === 401) {
    clearPassword();
    window.dispatchEvent(new Event("auth-error"));
    throw new AuthError("unauthorized");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API ${path} failed: ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

export { AuthError };

export const api = {
  login: async (password, code) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, code }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body.error || "رمز عبور اشتباهه");
      err.require2fa = Boolean(body.require2fa);
      throw err;
    }
    setPassword(password);
  },
  sites: () => request("/sites"),
  site: (id) => request(`/sites/${id}`),
  createSite: (data) => request("/sites", { method: "POST", body: JSON.stringify(data) }),
  updateSite: (id, data) => request(`/sites/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteSite: (id) => request(`/sites/${id}`, { method: "DELETE" }),
  checks: (id, type = "uptime", limit = 100) => request(`/sites/${id}/checks?type=${type}&limit=${limit}`),
  timeline: (id, limit = 200) => request(`/sites/${id}/timeline?limit=${limit}`),
  settings: () => request("/settings"),
  updateSettings: (data) => request("/settings", { method: "PUT", body: JSON.stringify(data) }),
  testTelegram: () => request("/settings/test-telegram", { method: "POST" }),
  discoverTelegramGroup: () => request("/settings/telegram-discover-group", { method: "POST" }),
  telegramTopics: () => request("/settings/telegram-topics"),
  setupTelegramTopics: () => request("/settings/telegram-topics/setup", { method: "POST" }),
  setTelegramTopic: (category, threadId) =>
    request(`/settings/telegram-topics/${category}`, { method: "PUT", body: JSON.stringify({ threadId }) }),
  testTelegramTopic: (category) => request(`/settings/telegram-topics/${category}/test`, { method: "POST" }),
  screenshotUrl: (id, capturedAt) =>
    `/api/sites/${id}/screenshot?t=${encodeURIComponent(capturedAt)}&pw=${encodeURIComponent(getPassword())}`,
  setPaused: (id, paused) => request(`/sites/${id}/pause`, { method: "PATCH", body: JSON.stringify({ paused }) }),
  setPublic: (id, isPublic) =>
    request(`/sites/${id}/public`, { method: "PATCH", body: JSON.stringify({ public: isPublic }) }),
  statusPage: () => request("/settings/status-page"),
  regenerateStatusPage: () => request("/settings/status-page/regenerate", { method: "POST" }),
  twoFactorStatus: () => request("/settings/2fa"),
  twoFactorSetup: () => request("/settings/2fa/setup", { method: "POST" }),
  twoFactorConfirm: (code) => request("/settings/2fa/confirm", { method: "POST", body: JSON.stringify({ code }) }),
  twoFactorDisable: (code) => request("/settings/2fa/disable", { method: "POST", body: JSON.stringify({ code }) }),
  maintenanceWindows: (siteId) => request(`/sites/${siteId}/maintenance-windows`),
  createMaintenanceWindow: (data) => request("/maintenance-windows", { method: "POST", body: JSON.stringify(data) }),
  deleteMaintenanceWindow: (id) => request(`/maintenance-windows/${id}`, { method: "DELETE" }),
  portChecks: (siteId) => request(`/sites/${siteId}/port-checks`),
  createPortCheck: (siteId, data) =>
    request(`/sites/${siteId}/port-checks`, { method: "POST", body: JSON.stringify(data) }),
  deletePortCheck: (id) => request(`/port-checks/${id}`, { method: "DELETE" }),
  slaReportUrl: (siteId, days) =>
    `/api/sites/${siteId}/sla-report?days=${days}&pw=${encodeURIComponent(getPassword())}`,
  remoteActionsStatus: () => request("/settings/remote-actions"),
  setRemoteActionsEnabled: (enabled) =>
    request("/settings/remote-actions", { method: "PUT", body: JSON.stringify({ enabled }) }),
  commands: (siteId) => request(`/sites/${siteId}/commands`),
  createCommand: (siteId, type, params) =>
    request(`/sites/${siteId}/commands`, { method: "POST", body: JSON.stringify({ type, params }) }),
  branding: async () => {
    const res = await fetch("/api/branding");
    return res.ok ? res.json() : { name: "Site Monitor", logoUrl: "" };
  },
  brandingSettings: () => request("/settings/branding"),
  updateBranding: (data) => request("/settings/branding", { method: "PUT", body: JSON.stringify(data) }),
};

export async function fetchPublicStatus(token) {
  const res = await fetch(`/api/public/status/${token}`);
  if (!res.ok) throw new Error("پیج وضعیت پیدا نشد");
  return res.json();
}
