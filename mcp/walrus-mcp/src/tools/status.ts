// walrus.status — does this blob still resolve via the aggregator?
// Used by agents to check expiry before relying on a blob.

import { z } from "zod";
import type { Config } from "../config.js";

export const inputSchema = z.object({
  blob_id: z.string().min(1).describe("Walrus blob_id (content address)."),
});

export type Input = z.infer<typeof inputSchema>;

export async function run(cfg: Config, input: Input) {
  // HEAD against the aggregator: 200 → resolvable, 404 → expired/unknown.
  // Aggregator exposes optional metadata headers we surface when present.
  const resp = await fetch(`${cfg.aggregator}/v1/blobs/${input.blob_id}`, {
    method: "HEAD",
  });

  if (resp.status === 404) {
    return { blob_id: input.blob_id, resolvable: false };
  }
  if (!resp.ok) {
    throw new Error(`aggregator ${resp.status} on HEAD`);
  }

  return {
    blob_id: input.blob_id,
    resolvable: true,
    size_bytes: numberHeader(resp, "content-length"),
    content_type: resp.headers.get("content-type") ?? undefined,
    epoch: numberHeader(resp, "x-walrus-epoch"),
    blob_end_epoch: numberHeader(resp, "x-walrus-blob-end-epoch"),
    context: cfg.context,
  };
}

function numberHeader(resp: Response, name: string): number | undefined {
  const v = resp.headers.get(name);
  if (v === null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
