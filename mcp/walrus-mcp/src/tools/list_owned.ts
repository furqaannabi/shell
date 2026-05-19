// walrus.list_owned — page through suix_getOwnedObjects, filter to
// Walrus Blob<T> types client-side. No signer needed; this is the
// cheapest way to find an address's storage footprint without hard-
// coding the Walrus core package id (which differs per network and can
// shift with upgrades).

import { z } from "zod";
import { getSuiClient } from "../sui.js";
import type { Config } from "../config.js";

const BLOB_TYPE_HINT = "::blob::Blob";

export const inputSchema = z.object({
  address: z.string().min(3).describe("Sui address whose Blob<T> objects to list."),
  cursor: z
    .string()
    .optional()
    .describe("Opaque pagination cursor from a previous call."),
  page_size: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(50)
    .describe("Sui RPC page size (1..100)."),
});

export type Input = z.infer<typeof inputSchema>;

export async function run(cfg: Config, input: Input) {
  const sui = getSuiClient(cfg);
  const page = await sui.getOwnedObjects({
    owner: input.address,
    cursor: input.cursor ?? null,
    limit: input.page_size,
    options: { showType: true, showContent: false },
  });

  const blobs = (page.data ?? [])
    .filter((o: any) => o.data?.type?.includes(BLOB_TYPE_HINT))
    .map((o: any) => ({
      object_id: o.data!.objectId,
      type: o.data!.type,
      version: o.data!.version,
      digest: o.data!.digest,
    }));

  return {
    address: input.address,
    context: cfg.context,
    blobs,
    has_next_page: page.hasNextPage,
    next_cursor: page.nextCursor ?? null,
  };
}
