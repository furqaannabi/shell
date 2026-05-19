// walrus.extend — extend a blob's storage duration by N epochs.
// Costs WAL on top of a Sui gas tx.

import { z } from "zod";
import { getKeypair, getWalrusClient } from "../sui.js";
import type { Config } from "../config.js";

export const inputSchema = z.object({
  sui_object_id: z.string().describe("Sui object id of the Blob<T>."),
  epochs_extended: z
    .number()
    .int()
    .min(1)
    .max(200)
    .describe("Number of additional epochs to extend storage by."),
});

export type Input = z.infer<typeof inputSchema>;

export async function run(cfg: Config, input: Input) {
  const signer = getKeypair(cfg);
  const walrus = getWalrusClient(cfg);
  const result = await walrus.executeExtendBlobTransaction({
    signer,
    blobObjectId: input.sui_object_id,
    epochs: input.epochs_extended,
  });
  return {
    sui_object_id: input.sui_object_id,
    epochs_extended: input.epochs_extended,
    digest: result.digest,
    context: cfg.context,
  };
}
