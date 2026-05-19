// Stubs for tools that require a Sui keypair or the MemWal relayer.
// Registered so MCP introspection lists the whole surface; each throws
// a structured "not_implemented" with a hint about what env wiring is
// missing. Wired up incrementally as the supporting plumbing lands.

import { z } from "zod";
import type { Config } from "../config.js";

class NotImplementedError extends Error {
  constructor(tool: string, hint: string) {
    super(`${tool}: not implemented. ${hint}`);
    this.name = "NotImplementedError";
  }
}

// ── Walrus tools that need a Sui keypair ──────────────────────────────

export const extend = {
  inputSchema: z.object({
    sui_object_id: z.string().describe("Sui object id of the Blob<T>."),
    epochs_extended: z.number().int().min(1).max(200),
  }),
  run(_cfg: Config, _input: unknown): Promise<unknown> {
    throw new NotImplementedError(
      "walrus.extend",
      "Needs WALRUS_KEYPAIR_PATH set and @mysten/walrus SDK wired.",
    );
  },
};

export const del = {
  inputSchema: z.object({
    sui_object_id: z.string().describe("Sui object id of the deletable Blob<T>."),
  }),
  run(_cfg: Config, _input: unknown): Promise<unknown> {
    throw new NotImplementedError(
      "walrus.delete",
      "Needs WALRUS_KEYPAIR_PATH set and @mysten/walrus SDK wired.",
    );
  },
};

export const quilt = {
  inputSchema: z.object({
    files: z
      .array(
        z.object({
          path: z.string(),
          identifier: z.string().optional(),
          tags: z.record(z.string()).optional(),
        }),
      )
      .min(1)
      .max(50),
    epochs: z.number().int().min(1).max(200).default(2),
  }),
  run(_cfg: Config, _input: unknown): Promise<unknown> {
    throw new NotImplementedError(
      "walrus.put_quilt",
      "Needs WALRUS_KEYPAIR_PATH and @mysten/walrus writeFiles.",
    );
  },
};

export const listOwned = {
  inputSchema: z.object({
    address: z.string().describe("Sui address whose Blob<T> objects to list."),
  }),
  run(_cfg: Config, _input: unknown): Promise<unknown> {
    throw new NotImplementedError(
      "walrus.list_owned",
      "Needs Sui RPC walk over the address's owned objects filtered to Blob<T>.",
    );
  },
};

export const headPointer = {
  inputSchema: z.object({
    object_id: z.string().describe("Sui object id of the head pointer (e.g. shell_agent::Head)."),
  }),
  run(_cfg: Config, _input: unknown): Promise<unknown> {
    throw new NotImplementedError(
      "walrus.head_pointer",
      "Needs Sui RPC sui_getObject + a known Head schema.",
    );
  },
};

// MemWal tools moved to src/tools/memwal.ts — they're no longer stubs.
