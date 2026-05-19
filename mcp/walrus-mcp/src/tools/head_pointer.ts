// walrus.head_pointer — read a Sui object that tracks an agent's
// "current state" blob_id plus a version counter (and optionally a
// `prev_blob_id` for a linked-list journal walk).
//
// Schema-agnostic on purpose: returns the parsed Move fields verbatim
// so any head-pointer shape (shell_agent::Head, your own custom
// pointer, etc.) just works.

import { z } from "zod";
import { getSuiClient } from "../sui.js";
import type { Config } from "../config.js";

export const inputSchema = z.object({
  object_id: z
    .string()
    .min(3)
    .describe("Sui object id of the head pointer (e.g. shell_agent::Head)."),
});

export type Input = z.infer<typeof inputSchema>;

export async function run(cfg: Config, input: Input) {
  const sui = getSuiClient(cfg);
  const obj = await sui.getObject({
    id: input.object_id,
    options: { showType: true, showContent: true, showOwner: true },
  });

  if (obj.error || !obj.data) {
    throw new Error(
      `head_pointer: ${obj.error?.code ?? "no_data"}: ${
        obj.error ? JSON.stringify(obj.error) : "object not found"
      }`,
    );
  }

  const content = obj.data.content;
  const fields =
    content && content.dataType === "moveObject"
      ? (content.fields as Record<string, unknown>)
      : undefined;

  return {
    object_id: obj.data.objectId,
    type: obj.data.type,
    version: obj.data.version,
    owner: obj.data.owner,
    fields,
  };
}
