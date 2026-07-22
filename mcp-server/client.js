// Thin HTTP client to the WordPress monitor's MCP API. Runs on the user's
// machine (via Claude Desktop stdio) but talks to the monitor over HTTP, so
// the DB never needs to be local — this is the key fix over reading
// data/monitor.db directly.
export class MonitorClient {
  constructor({ baseUrl, apiKey, fetchImpl = fetch }) {
    if (!baseUrl) throw new Error("MONITOR_BASE_URL is required");
    if (!apiKey) throw new Error("MONITOR_API_KEY is required");
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }

  async get(pathAndQuery) {
    const res = await this.fetchImpl(`${this.baseUrl}/api/mcp${pathAndQuery}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (res.status === 401) throw new Error("unauthorized — check MONITOR_API_KEY");
    if (!res.ok) throw new Error(`monitor API ${pathAndQuery} failed: ${res.status}`);
    return res.json();
  }
}
