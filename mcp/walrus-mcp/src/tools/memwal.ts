// MemWal-backed tools: remember, recall, restore.
//
// MemWal handles encryption + Walrus upload + semantic indexing server-
// side via a relayer. The SDK signs requests with a delegate Ed25519 key
// (registered against a MemWalAccount on Sui via the MemWal Playground).
//
// The client is lazy-initialized on first use so the import cost is paid
// only when memwal.* is actually called, and so a missing env config
// throws a clear error at call time instead of failing the whole server
// at boot.

import { MemWal } from "@mysten-incubation/memwal";
import { z } from "zod";
import type { Config } from "../config.js";

let clientSingleton: MemWal | null = null;

function getClient(cfg: Config): MemWal {
  if (clientSingleton) return clientSingleton;
  if (!cfg.memwal) {
    throw new Error(
      "memwal.*: set MEMWAL_DELEGATE_KEY, MEMWAL_ACCOUNT_ID, MEMWAL_SERVER_URL " +
        "(and optionally MEMWAL_NAMESPACE) to enable. " +
        "Generate a delegate key at https://app.memwal.com.",
    );
  }
  clientSingleton = MemWal.create({
    key: cfg.memwal.delegateKey,
    accountId: cfg.memwal.accountId,
    serverUrl: cfg.memwal.serverUrl,
    namespace: cfg.memwal.namespace,
  });
  return clientSingleton;
}

// ── memwal.remember ───────────────────────────────────────────────────

export const rememberInput = z.object({
  text: z.string().min(1).max(8192).describe("Memory text to store."),
  namespace: z
    .string()
    .optional()
    .describe("Memory isolation namespace; defaults to MEMWAL_NAMESPACE or 'default'."),
  wait: z
    .boolean()
    .default(false)
    .describe(
      "If true, poll the relayer until the embed+encrypt+upload+index pipeline finishes and return the final blob_id. If false (default) return as soon as the job is accepted.",
    ),
});
export type RememberInput = z.infer<typeof rememberInput>;

export async function remember(cfg: Config, input: RememberInput) {
  const client = getClient(cfg);
  if (input.wait) {
    const r = await client.rememberAndWait(input.text, input.namespace);
    return { kind: "done", ...r };
  }
  const r = await client.rememberAsync(input.text, input.namespace);
  return { kind: "accepted", ...r };
}

// ── memwal.recall ─────────────────────────────────────────────────────

export const recallInput = z.object({
  query: z.string().min(1).max(2048).describe("Semantic search query."),
  k: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(5)
    .describe("Max number of results to return."),
  namespace: z
    .string()
    .optional()
    .describe("Namespace to search within; defaults to MEMWAL_NAMESPACE or 'default'."),
});
export type RecallInput = z.infer<typeof recallInput>;

export async function recall(cfg: Config, input: RecallInput) {
  const client = getClient(cfg);
  const r = await client.recall(input.query, input.k, input.namespace);
  return {
    total: r.total,
    results: r.results.map((m) => ({
      blob_id: m.blob_id,
      text: m.text,
      distance: m.distance,
    })),
  };
}

// ── memwal.restore ────────────────────────────────────────────────────

export const restoreInput = z.object({
  namespace: z.string().describe("Namespace whose Walrus blobs to re-index."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(10_000)
    .optional()
    .describe("Cap on number of blobs to restore."),
});
export type RestoreInput = z.infer<typeof restoreInput>;

export async function restore(cfg: Config, input: RestoreInput) {
  const client = getClient(cfg);
  const r = await client.restore(input.namespace, input.limit);
  return r;
}
