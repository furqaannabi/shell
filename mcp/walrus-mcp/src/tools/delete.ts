// walrus.delete — delete a *deletable* blob. The original walrus.put
// must have been called with deletable=true, otherwise the Move call
// aborts. Cached copies on aggregators may still serve the bytes for
// some time after deletion — Walrus is content-addressed, not
// recallable.

import { z } from "zod";
import { getKeypair, getWalrusClient } from "../sui.js";
import type { Config } from "../config.js";

export const inputSchema = z.object({
  sui_object_id: z.string().describe("Sui object id of the deletable Blob<T>."),
});

export type Input = z.infer<typeof inputSchema>;

export async function run(cfg: Config, input: Input) {
  const signer = getKeypair(cfg);
  const walrus = getWalrusClient(cfg);
  const result = await walrus.executeDeleteBlobTransaction({
    signer,
    blobObjectId: input.sui_object_id,
  });
  return {
    sui_object_id: input.sui_object_id,
    digest: result.digest,
    context: cfg.context,
  };
}
