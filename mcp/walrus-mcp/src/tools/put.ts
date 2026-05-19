// walrus.put — store bytes via the public publisher.
//
// Testnet publisher absorbs WAL; mainnet publishers charge. Content is
// content-addressed, so re-puts of identical bytes return the same
// blob_id. Accepts either raw text or base64-encoded bytes so the LLM
// can hand either shape directly.

import { z } from "zod";
import type { Config } from "../config.js";

export const inputSchema = z.object({
  content_text: z
    .string()
    .optional()
    .describe("UTF-8 string to store. Mutually exclusive with content_b64."),
  content_b64: z
    .string()
    .optional()
    .describe("Base64-encoded bytes to store. Mutually exclusive with content_text."),
  epochs: z
    .number()
    .int()
    .min(1)
    .max(200)
    .default(2)
    .describe("Number of epochs to store. Testnet epoch = 1 day, mainnet = 2 weeks."),
  deletable: z
    .boolean()
    .default(false)
    .describe("Mark blob as deletable (lets walrus.delete tear it down later)."),
});

export type Input = z.infer<typeof inputSchema>;

export async function run(cfg: Config, input: Input) {
  if (Boolean(input.content_text) === Boolean(input.content_b64)) {
    throw new Error("Provide exactly one of content_text or content_b64");
  }
  const bytes = input.content_text
    ? new TextEncoder().encode(input.content_text)
    : Buffer.from(input.content_b64!, "base64");

  const url = new URL(`${cfg.publisher}/v1/blobs`);
  url.searchParams.set("epochs", String(input.epochs));
  if (input.deletable) url.searchParams.set("deletable", "true");

  const resp = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "application/octet-stream" },
    body: bytes,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`publisher ${resp.status}: ${text.slice(0, 500)}`);
  }
  const body = (await resp.json()) as PublisherResponse;

  const result = normalize(body);
  return {
    blob_id: result.blobId,
    sui_object_id: result.suiObjectId,
    end_epoch: result.endEpoch,
    size_bytes: bytes.byteLength,
    context: cfg.context,
    aggregator_url: `${cfg.aggregator}/v1/blobs/${result.blobId}`,
  };
}

// Publisher responses come back in one of two shapes depending on
// whether the blob is newly registered or already known.
interface PublisherResponse {
  newlyCreated?: { blobObject: BlobObject; resourceOperation?: unknown; cost?: number };
  alreadyCertified?: { blobId: string; eventOrObject?: unknown; endEpoch: number };
}

interface BlobObject {
  id: string;
  blobId: string;
  registeredEpoch?: number;
  storage?: { endEpoch: number };
}

function normalize(r: PublisherResponse): {
  blobId: string;
  suiObjectId?: string;
  endEpoch?: number;
} {
  if (r.newlyCreated) {
    return {
      blobId: r.newlyCreated.blobObject.blobId,
      suiObjectId: r.newlyCreated.blobObject.id,
      endEpoch: r.newlyCreated.blobObject.storage?.endEpoch,
    };
  }
  if (r.alreadyCertified) {
    return { blobId: r.alreadyCertified.blobId, endEpoch: r.alreadyCertified.endEpoch };
  }
  throw new Error(`unexpected publisher response: ${JSON.stringify(r).slice(0, 500)}`);
}
