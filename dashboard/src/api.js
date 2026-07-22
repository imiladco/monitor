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
  login: async (password) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) throw new Error("رمز عبور اشتباهه");
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
};

export async function fetchPublicStatus(token) {
  const res = await fetch(`/api/public/status/${token}`);
  if (!res.ok) throw new Error("پیج وضعیت پیدا نشد");
  return res.json();
}
