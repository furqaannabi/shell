import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";

import type { ToolRegistry } from "./registry.js";

const MCP_CONFIG_PATH = resolve(process.cwd(), "mcp.json");

interface StdioServer {
  transport: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface HttpServer {
  transport: "http";
  url: string;
}

type ServerConfig = StdioServer | HttpServer;

interface McpConfig {
  mcpServers: Record<string, ServerConfig>;
}

const openClients: Client[] = [];

/** Load mcp.json, connect to each server, and register all tools.
 *  Missing mcp.json is silently ignored. */
export async function loadMcpTools(registry: ToolRegistry): Promise<void> {
  let raw: string;
  try {
    raw = readFileSync(MCP_CONFIG_PATH, "utf-8");
  } catch {
    return;
  }

  let cfg: McpConfig;
  try {
    cfg = JSON.parse(raw) as McpConfig;
  } catch (e) {
    console.warn(`[mcp] mcp.json parse error: ${(e as Error).message}`);
    return;
  }

  for (const [serverName, serverCfg] of Object.entries(cfg.mcpServers ?? {})) {
    await connectServer(serverName, serverCfg, registry);
  }
}

/** Gracefully close all MCP clients (call on SIGTERM). */
export async function closeMcpClients(): Promise<void> {
  await Promise.allSettled(openClients.map((c) => c.close()));
}

async function connectServer(
  name: string,
  cfg: ServerConfig,
  registry: ToolRegistry,
): Promise<void> {
  try {
    const transport =
      cfg.transport === "stdio"
        ? new StdioClientTransport({
            command: cfg.command,
            args: cfg.args ?? [],
            env: cfg.env,
          })
        : new StreamableHTTPClientTransport(new URL(cfg.url));

    const client = new Client({ name: "shell-agent", version: "2.0.0" });
    await client.connect(transport);
    openClients.push(client);

    const { tools } = await client.listTools();
    for (const tool of tools) {
      const toolName = `mcp__${name}__${tool.name}`;
      registry.register({
        name: toolName,
        description: `[MCP:${name}] ${tool.description ?? ""}`,
        // MCP tools carry their own JSON schema; wrap in a passthrough zod object.
        parameters: z.object({}).passthrough(),
        async execute(args) {
          const result = await client.callTool({ name: tool.name, arguments: args as Record<string, unknown> });
          // MCP result is content[]: extract text parts.
          const parts = (result.content as Array<{ type: string; text?: string }>)
            .filter((c) => c.type === "text")
            .map((c) => c.text ?? "");
          if (parts.length === 1) {
            try { return JSON.parse(parts[0]!); } catch { return parts[0]; }
          }
          return parts;
        },
      });
      console.log(`[mcp] registered ${toolName}`);
    }
  } catch (e) {
    console.warn(`[mcp] ${name}: connection failed — ${(e as Error).message}`);
  }
}
