#!/usr/bin/env node
// Walrus + MemWal MCP server. Stdio transport. Registers eleven tools:
// eight Walrus operations and three MemWal operations.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadConfig } from "./config.js";
import * as put from "./tools/put.js";
import * as get from "./tools/get.js";
import * as status from "./tools/status.js";
import * as memwal from "./tools/memwal.js";
import * as stubs from "./tools/stubs.js";

const cfg = loadConfig();
const server = new McpServer({ name: "walrus-mcp", version: "0.1.0" });

// Helper: every tool returns a JSON object; the MCP transport expects
// { content: [{ type: "text", text: ... }] }. Wrap once.
function ok(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}
function fail(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

// ── Walrus core (working) ─────────────────────────────────────────────

server.registerTool(
  "walrus.put",
  {
    description:
      "Store bytes on Walrus via the public publisher. Content-addressed; idempotent for identical bytes. Default epochs=2.",
    inputSchema: put.inputSchema.shape,
  },
  async (input: any) => {
    try {
      return ok(await put.run(cfg, input as put.Input));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "walrus.get",
  {
    description:
      "Fetch a blob via the public aggregator. Returns sha256 + preview by default; pass inline=true for ≤16KB blobs to get full bytes as base64.",
    inputSchema: get.inputSchema.shape,
  },
  async (input: any) => {
    try {
      return ok(await get.run(cfg, input as get.Input));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "walrus.status",
  {
    description:
      "Check whether a blob_id is still resolvable via the aggregator. HEAD request; returns size + epoch headers when present.",
    inputSchema: status.inputSchema.shape,
  },
  async (input: any) => {
    try {
      return ok(await status.run(cfg, input as status.Input));
    } catch (e) {
      return fail(e);
    }
  },
);

// ── Walrus stubs (needs Sui keypair) ──────────────────────────────────

server.registerTool(
  "walrus.extend",
  {
    description: "Extend a blob's storage duration by N epochs. Needs WALRUS_KEYPAIR_PATH.",
    inputSchema: stubs.extend.inputSchema.shape,
  },
  async (input: any) => {
    try {
      return ok(await stubs.extend.run(cfg, input));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "walrus.delete",
  {
    description: "Delete a deletable blob (still readable from caches). Needs WALRUS_KEYPAIR_PATH.",
    inputSchema: stubs.del.inputSchema.shape,
  },
  async (input: any) => {
    try {
      return ok(await stubs.del.run(cfg, input));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "walrus.put_quilt",
  {
    description: "Bundle multiple files into a single Walrus storage event (quilt).",
    inputSchema: stubs.quilt.inputSchema.shape,
  },
  async (input: any) => {
    try {
      return ok(await stubs.quilt.run(cfg, input));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "walrus.list_owned",
  {
    description: "List Walrus Blob<T> objects owned by a Sui address.",
    inputSchema: stubs.listOwned.inputSchema.shape,
  },
  async (input: any) => {
    try {
      return ok(await stubs.listOwned.run(cfg, input));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "walrus.head_pointer",
  {
    description:
      "Read a Sui head-pointer object that tracks the current blob_id for an agent's state.",
    inputSchema: stubs.headPointer.inputSchema.shape,
  },
  async (input: any) => {
    try {
      return ok(await stubs.headPointer.run(cfg, input));
    } catch (e) {
      return fail(e);
    }
  },
);

// ── MemWal (encrypted Walrus + semantic index, server-side TEE) ───────

server.registerTool(
  "memwal.remember",
  {
    description:
      "Store an agent memory in MemWal — server encrypts + uploads to Walrus + indexes semantically. Returns immediately by default; pass wait=true to block until the relayer pipeline finishes.",
    inputSchema: memwal.rememberInput.shape,
  },
  async (input: any) => {
    try {
      return ok(await memwal.remember(cfg, input as memwal.RememberInput));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "memwal.recall",
  {
    description:
      "Semantic-search MemWal memories matching a query. Returns decrypted text + blob_ids + similarity distance.",
    inputSchema: memwal.recallInput.shape,
  },
  async (input: any) => {
    try {
      return ok(await memwal.recall(cfg, input as memwal.RecallInput));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "memwal.restore",
  {
    description:
      "Rebuild a MemWal namespace's semantic index from its underlying Walrus blobs (decrypt + re-embed server-side).",
    inputSchema: memwal.restoreInput.shape,
  },
  async (input: any) => {
    try {
      return ok(await memwal.restore(cfg, input as memwal.RestoreInput));
    } catch (e) {
      return fail(e);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
