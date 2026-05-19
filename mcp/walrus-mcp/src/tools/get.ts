// walrus.get — fetch bytes via the public aggregator. Free read.
//
// Defaults to a metadata-only response (sha256 + preview + size); inline
// the full bytes only when explicitly asked, since LLM context isn't the
// place to ship megabytes.

import { createHash } from "node:crypto";
import { z } from "zod";
import type { Config } from "../config.js";

const PREVIEW_BYTES = 1024;
const INLINE_LIMIT = 16 * 1024;

export const inputSchema = z.object({
  blob_id: z.string().min(1).describe("Walrus blob_id (content address)."),
  inline: z
    .boolean()
    .default(false)
    .describe(
      `Return the full bytes as base64 in content_b64. Only allowed for blobs ≤ ${INLINE_LIMIT} bytes.`,
    ),
});

export type Input = z.infer<typeof inputSchema>;

export async function run(cfg: Config, input: Input) {
  const resp = await fetch(`${cfg.aggregator}/v1/blobs/${input.blob_id}`);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`aggregator ${resp.status}: ${text.slice(0, 500)}`);
  }
  const bytes = new Uint8Array(await resp.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const previewBytes = bytes.slice(0, PREVIEW_BYTES);
  const looksLikeText = isLikelyUtf8(previewBytes);
  const preview = looksLikeText
    ? new TextDecoder("utf-8", { fatal: false }).decode(previewBytes)
    : undefined;

  const result: Record<string, unknown> = {
    blob_id: input.blob_id,
    size_bytes: bytes.byteLength,
    sha256,
    preview_text: preview,
    context: cfg.context,
  };

  if (input.inline) {
    if (bytes.byteLength > INLINE_LIMIT) {
      throw new Error(
        `blob is ${bytes.byteLength} bytes; inline limit is ${INLINE_LIMIT}. Call again without inline and fetch via the aggregator URL.`,
      );
    }
    result.content_b64 = Buffer.from(bytes).toString("base64");
  }

  return result;
}

function isLikelyUtf8(b: Uint8Array): boolean {
  // Heuristic: no NUL bytes in the first 256 bytes and decode round-trips.
  const head = b.slice(0, 256);
  for (const c of head) if (c === 0) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(head);
    return true;
  } catch {
    return false;
  }
}
