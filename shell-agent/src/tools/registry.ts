import type { SealClient } from "@mysten/seal";
import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { z, type ZodTypeAny } from "zod";

import type { ToolDef } from "../llm/index.js";

/** One IOI the agent has posted, plus what happened to it. Held in an
 *  in-process ring buffer so the LLM can recall past terms + outcomes
 *  when picking the next window's IOI. */
export interface IoiHistoryEntry {
  posted_at_ms: number;
  blob_id: string;
  side: "buy" | "sell";
  asset: string;
  size_lo: string;       // u64 raw, stringified for JSON safety
  size_hi: string;
  price_lo: string;
  price_hi: string;
  ttl_min: number;
  expiry_ms: number;
  /** "pending" until enclave proposal seen or expiry passes. */
  status: "pending" | "matched" | "expired";
  matched_at_ms?: number;
  /** Free-text from strategy LLM at post time. */
  reasoning?: string;
}

/** Runtime context every tool receives. Built once at agent startup. */
export interface ToolCtx {
  suiClient: SuiJsonRpcClient;
  sealClient: SealClient;
  keypair: Ed25519Keypair;
  address: string;
  /** Returns recent IOIs posted by this agent (most recent first). */
  getIoiHistory?: () => IoiHistoryEntry[];
}

export interface Tool<S extends ZodTypeAny = ZodTypeAny> {
  name: string;
  description: string;
  parameters: S;
  execute(args: z.infer<S>, ctx: ToolCtx): Promise<unknown>;
}

/** Registry of named tools the LLM can call. Tool names are namespaced
 *  by their source — built-ins keep bare names (`get_ref_price`),
 *  plugins prefix `plugin__`, MCP tools prefix `mcp__<server>__`. */
export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`tool name collision: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  registerMany(tools: Tool[]): void {
    for (const t of tools) this.register(t);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): Tool[] {
    return [...this.tools.values()];
  }

  /** Serialise all tools into the provider-neutral `ToolDef` shape the
   *  LlmClient consumes. Parameters are converted from zod to JSON
   *  Schema using zod's built-in toJSONSchema (z.toJSONSchema, available
   *  in zod 3.25+). */
  toDefs(): ToolDef[] {
    return this.list().map((t) => ({
      name: t.name,
      description: t.description,
      parameters: zodToJsonSchema(t.parameters),
    }));
  }

  /** Execute a tool by name. Errors are caught and returned as a
   *  shaped object so the LLM can react instead of the loop crashing. */
  async execute(
    name: string,
    args: unknown,
    ctx: ToolCtx,
  ): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) return { error: `unknown tool: ${name}` };
    try {
      const parsed = tool.parameters.parse(args ?? {});
      return await tool.execute(parsed, ctx);
    } catch (e) {
      return { error: (e as Error).message };
    }
  }
}

/** Bridge zod → JSON Schema for the LLM's tool-call payload. zod 3.25+
 *  ships `z.toJSONSchema`; we fall back to a minimal hand-rolled
 *  description for older versions so the runtime never crashes here. */
function zodToJsonSchema(schema: ZodTypeAny): Record<string, unknown> {
  const zAny = z as unknown as {
    toJSONSchema?: (s: ZodTypeAny) => Record<string, unknown>;
  };
  if (typeof zAny.toJSONSchema === "function") {
    return zAny.toJSONSchema(schema);
  }
  // Older zod: assume the tool takes no arguments. Tools needing args
  // should pin zod >=3.25 in shell-agent's package.json (already done).
  return { type: "object", properties: {}, additionalProperties: false };
}
