#!/usr/bin/env node
// Stdio entrypoint. For local clients (Claude Code, Claude Desktop,
// Cursor). The tool surface lives in mcp.ts so the HTTP entrypoint
// (server-http.ts) can reuse it.

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { buildMcpServer } from "./mcp.js";

const server = buildMcpServer(loadConfig());
const transport = new StdioServerTransport();
await server.connect(transport);
