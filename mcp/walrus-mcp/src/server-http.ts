#!/usr/bin/env node
// Streamable-HTTP entrypoint. Mounts the MCP tool surface behind a
// single `POST /mcp` (and optional `GET /mcp` SSE) so remote clients
// (Claude Desktop's HTTP MCP, Anthropic Console, plain curl, ChatGPT
// custom GPTs, …) can use it without a local stdio process.
//
// Stateless mode (sessionIdGenerator: undefined): every request spins
// up a fresh McpServer + transport pair. Simpler ops, no in-memory
// session state, no session-id ceremony. Tools themselves are
// idempotent (Walrus is content-addressed), so per-call statelessness
// is the right default.
//
// Bind: 127.0.0.1:3030 by default. Nginx fronts it with TLS.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig } from "./config.js";
import { buildMcpServer } from "./mcp.js";

const HOST = process.env.MCP_HTTP_HOST ?? "127.0.0.1";
const PORT = Number(process.env.MCP_HTTP_PORT ?? 3030);
const PATH = process.env.MCP_HTTP_PATH ?? "/mcp";

const cfg = loadConfig();

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function notFound(res: ServerResponse) {
  res.statusCode = 404;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ error: "not_found" }));
}

function health(res: ServerResponse) {
  res.statusCode = 200;
  res.setHeader("content-type", "application/json");
  res.end(
    JSON.stringify({
      service: "walrus-mcp",
      version: "0.1.0",
      transport: "streamable-http",
      context: cfg.context,
      memwal_enabled: Boolean(cfg.memwal),
      keypair_loaded: Boolean(process.env.WALRUS_KEYPAIR_PATH),
      endpoints: { mcp: PATH, health: "/health" },
    }),
  );
}

const httpServer = createServer(async (req, res) => {
  // Liveness / introspection probe used by nginx + ops checks.
  if (req.method === "GET" && (req.url === "/health" || req.url === "/")) {
    return health(res);
  }

  if (!req.url || !req.url.startsWith(PATH)) return notFound(res);

  try {
    const body = req.method === "POST" ? await readJsonBody(req) : undefined;
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = buildMcpServer(cfg);
    res.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "internal", message: msg }));
    } else {
      res.end();
    }
  }
});

httpServer.listen(PORT, HOST, () => {
  console.log(`[walrus-mcp] listening on http://${HOST}:${PORT}${PATH}`);
});
