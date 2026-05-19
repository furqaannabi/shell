// walrus.put_quilt — bundle multiple files into one Walrus storage
// event ("quilt"). Cheaper than N independent walrus.put calls because
// the encoding + register/certify overhead is amortised across the
// bundle. Each file inside the quilt keeps its own identifier + tags
// so downstream consumers can pull individual files via getFiles().

import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { z } from "zod";
import { WalrusFile } from "@mysten/walrus";
import { getKeypair, getWalrusClient } from "../sui.js";
import type { Config } from "../config.js";

const MAX_FILES = 50;
const MAX_BYTES_PER_FILE = 10 * 1024 * 1024;

export const inputSchema = z.object({
  files: z
    .array(
      z.object({
        path: z
          .string()
          .describe(
            "Local filesystem path. Bytes are read into memory; per-file cap is 10 MiB.",
          ),
        identifier: z
          .string()
          .optional()
          .describe("Identifier for the file within the quilt; defaults to the basename."),
        tags: z
          .record(z.string())
          .optional()
          .describe("Arbitrary string→string tags attached to the file."),
      }),
    )
    .min(1)
    .max(MAX_FILES)
    .describe("Files to bundle into the quilt."),
  epochs: z
    .number()
    .int()
    .min(1)
    .max(200)
    .default(2)
    .describe("Number of epochs to store the quilt for."),
  deletable: z
    .boolean()
    .default(false)
    .describe("Mark the quilt as deletable so walrus.delete can tear it down later."),
});

export type Input = z.infer<typeof inputSchema>;

export async function run(cfg: Config, input: Input) {
  const signer = getKeypair(cfg);
  const walrus = getWalrusClient(cfg);

  const files = input.files.map(({ path, identifier, tags }) => {
    const st = statSync(path);
    if (st.size > MAX_BYTES_PER_FILE) {
      throw new Error(
        `walrus.put_quilt: ${path} is ${st.size} bytes; per-file cap is ${MAX_BYTES_PER_FILE}.`,
      );
    }
    const contents = new Uint8Array(readFileSync(path));
    return WalrusFile.from({
      contents,
      identifier: identifier ?? basename(path),
      tags,
    });
  });

  const results = await walrus.writeFiles({
    files,
    epochs: input.epochs,
    deletable: input.deletable,
    signer,
  });

  return {
    context: cfg.context,
    files: results.map((r) => ({
      id: r.id,
      blob_id: r.blobId,
      blob_object_id: (r.blobObject as { id?: { id?: string } })?.id?.id,
    })),
    count: results.length,
  };
}
