async function request(path) {
  const res = await fetch(`/api${path}`);
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json();
}

export const api = {
  sites: () => request("/sites"),
  site: (id) => request(`/sites/${id}`),
  checks: (id, type = "uptime", limit = 100) => request(`/sites/${id}/checks?type=${type}&limit=${limit}`),
  timeline: (id, limit = 200) => request(`/sites/${id}/timeline?limit=${limit}`),
};
