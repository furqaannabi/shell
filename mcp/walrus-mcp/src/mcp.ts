// Tool registration factory. Both the stdio entrypoint (server.ts) and
// the streamable-HTTP entrypoint (server-http.ts) consume this so the
// tool surface stays defined in exactly one place.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "./config.js";
import * as put from "./tools/put.js";
import * as get from "./tools/get.js";
import * as status from "./tools/status.js";
import * as extend from "./tools/extend.js";
import * as del from "./tools/delete.js";
import * as quilt from "./tools/quilt.js";
import * as listOwned from "./tools/list_owned.js";
import * as headPointer from "./tools/head_pointer.js";
import * as memwal from "./tools/memwal.js";

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

export function buildMcpServer(cfg: Config): McpServer {
  const server = new McpServer({ name: "walrus-mcp", version: "0.1.0" });

  // ── Walrus core (zero-config) ───────────────────────────────────────

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

  // ── Walrus signed ops (needs WALRUS_KEYPAIR_PATH) ───────────────────

  server.registerTool(
    "walrus.extend",
    {
      description:
        "Extend a blob's storage duration by N epochs. Signed tx; needs WALRUS_KEYPAIR_PATH and a WAL balance on the keypair address.",
      inputSchema: extend.inputSchema.shape,
    },
    async (input: any) => {
      try {
        return ok(await extend.run(cfg, input as extend.Input));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "walrus.delete",
    {
      description:
        "Delete a deletable blob (still readable from caches for a while). Original walrus.put must have set deletable=true. Needs WALRUS_KEYPAIR_PATH.",
      inputSchema: del.inputSchema.shape,
    },
    async (input: any) => {
      try {
        return ok(await del.run(cfg, input as del.Input));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "walrus.put_quilt",
    {
      description:
        "Bundle multiple files into one Walrus storage event. Cheaper than N walrus.put calls; each file keeps its own identifier + tags. Needs WALRUS_KEYPAIR_PATH.",
      inputSchema: quilt.inputSchema.shape,
    },
    async (input: any) => {
      try {
        return ok(await quilt.run(cfg, input as quilt.Input));
      } catch (e) {
        return fail(e);
      }
    },
  );

  // ── Sui read-only (no keypair) ──────────────────────────────────────

  server.registerTool(
    "walrus.list_owned",
    {
      description:
        "List Walrus Blob<T> objects owned by a Sui address. Paginates via Sui RPC; filters by object type substring '::blob::Blob' so it works across Walrus package upgrades.",
      inputSchema: listOwned.inputSchema.shape,
    },
    async (input: any) => {
      try {
        return ok(await listOwned.run(cfg, input as listOwned.Input));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "walrus.head_pointer",
    {
      description:
        "Read a Sui head-pointer object that tracks the current blob_id for an agent's state. Schema-agnostic: returns the parsed Move fields verbatim, so any pointer shape (e.g. shell_agent::Head) works.",
      inputSchema: headPointer.inputSchema.shape,
    },
    async (input: any) => {
      try {
        return ok(await headPointer.run(cfg, input as headPointer.Input));
      } catch (e) {
        return fail(e);
      }
    },
  );

  // ── MemWal (encrypted Walrus + semantic index, server-side TEE) ─────

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

  return server;
}
