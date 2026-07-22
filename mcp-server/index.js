#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MonitorClient } from "./client.js";
import { tools } from "./tools/index.js";

const client = new MonitorClient({
  baseUrl: process.env.MONITOR_BASE_URL,
  apiKey: process.env.MONITOR_API_KEY,
});

const server = new McpServer({ name: "wp-monitor", version: "1.0.0" });

for (const tool of tools) {
  server.tool(tool.name, tool.description, tool.inputSchema, async (args) => {
    try {
      const data = await tool.handler(client, args);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `error: ${err.message}` }], isError: true };
    }
  });
}

const transport = new StdioServerTransport();
await server.connect(transport);
