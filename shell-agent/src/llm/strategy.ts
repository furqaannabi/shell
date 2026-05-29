import type { ChatMessage, LlmClient } from "./index.js";
import type { ToolCtx, ToolRegistry } from "../tools/registry.js";
import { logTool, logWarn } from "../log.js";

const MAX_ROUNDS = 6;

export interface IoiStrategy {
  skip: boolean;
  reasoning: string;
  side?: "buy" | "sell";
  asset?: string;
  /** Base units (e.g. 1e9 for SUI). */
  sizeLo?: bigint;
  sizeHi?: bigint;
  /** Quote scale (1e6 — quote_per_base). */
  priceLo?: bigint;
  priceHi?: bigint;
  ttlMin?: number;
}

/** Ask the LLM to choose IOI terms for the next posting window.
 *  Bounded tool-use loop: LLM can call tools to fetch live data,
 *  then must return ONE JSON object describing the IOI to post
 *  (or skip with reason). */
export async function decideIoiTerms(opts: {
  llm: LlmClient;
  tools: ToolRegistry;
  ctx: ToolCtx;
  policy: string;
  defaults: {
    side: "buy" | "sell";
    asset: string;
    sizeLo: bigint;
    sizeHi: bigint;
    priceLo: bigint;
    priceHi: bigint;
    ttlMin: number;
  };
}): Promise<IoiStrategy> {
  const { llm, tools, ctx, policy, defaults } = opts;

  const system =
    `You are a Shell Finance trading agent deciding IOI (Indication of Interest) terms for the next posting window.\n` +
    `Your address: ${ctx.address}.\n` +
    `Your policy: ${policy}\n\n` +
    `You have tools available. Use them to check: live ref price, your balance, your active orders, recent fills, risk caps. ` +
    `Do not invent data — call tools to verify state.\n\n` +
    `Then choose IOI terms that satisfy the policy. You may also skip posting if conditions are unfavourable.\n\n` +
    `Respond with ONLY a JSON object in one of these shapes:\n\n` +
    `Post an IOI:\n` +
    `  { "skip": false,\n` +
    `    "reasoning": "<why these terms>",\n` +
    `    "side": "buy" | "sell",\n` +
    `    "asset": "<Move type tag, e.g. 0x2::sui::SUI>",\n` +
    `    "size_lo": <number, BASE units 1e9>,\n` +
    `    "size_hi": <number, BASE units 1e9>,\n` +
    `    "price_lo": <number, QUOTE scale 1e6>,\n` +
    `    "price_hi": <number, QUOTE scale 1e6>,\n` +
    `    "ttl_min": <number, 5-1440> }\n\n` +
    `Skip posting:\n` +
    `  { "skip": true, "reasoning": "<why skipping>" }\n\n` +
    `Hard rails (do NOT violate):\n` +
    `  size_lo <= size_hi, price_lo <= price_hi, both > 0.\n` +
    `  ttl_min between 5 and 1440.\n` +
    `  Use only ASSETS the user's policy allows.\n`;

  const defaultsHint =
    `Default fallback terms (use if policy doesn't override): side=${defaults.side}, asset=${defaults.asset}, ` +
    `size_lo=${defaults.sizeLo}, size_hi=${defaults.sizeHi}, price_lo=${defaults.priceLo}, price_hi=${defaults.priceHi}, ttl_min=${defaults.ttlMin}.\n` +
    `Decide IOI terms now.`;

  const messages: ChatMessage[] = [{ role: "user", content: defaultsHint }];
  const toolDefs = tools.list().length > 0 ? tools.toDefs() : undefined;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await llm.chat({
      system,
      messages,
      tools: toolDefs,
      jsonMode: !toolDefs,
      maxTokens: 1024,
    });

    if (res.stopReason === "tool_use" && res.toolCalls.length > 0) {
      messages.push({
        role: "assistant",
        content: res.text,
        toolCalls: res.toolCalls,
      });
      for (const tc of res.toolCalls) {
        const result = await tools.execute(tc.name, tc.arguments, ctx);
        logTool(tc.name, tc.arguments, result);
        messages.push({
          role: "tool",
          toolCallId: tc.id,
          name: tc.name,
          content: JSON.stringify(result),
        });
      }
      continue;
    }

    return parseStrategy(res.text ?? "", defaults);
  }

  logWarn(`hit round cap (${MAX_ROUNDS}); forcing final IOI decision`);
  const final = await llm.chat({
    system: system + "\n\nYou have used your tool-call budget. Respond NOW with the final JSON object only.",
    messages,
    jsonMode: true,
    maxTokens: 512,
  });
  return parseStrategy(final.text ?? "", defaults);
}

function parseStrategy(text: string, defaults: { side: "buy" | "sell"; asset: string; sizeLo: bigint; sizeHi: bigint; priceLo: bigint; priceHi: bigint; ttlMin: number }): IoiStrategy {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  let json = fenceMatch ? fenceMatch[1]!.trim() : "";
  if (!json) {
    const end = text.lastIndexOf("}");
    const start = end !== -1 ? text.lastIndexOf("{", end) : -1;
    json = start !== -1 ? text.slice(start, end + 1) : text.trim();
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json) as Record<string, unknown>;
  } catch {
    throw new Error(`LLM returned non-JSON IOI decision: ${text}`);
  }

  if (parsed.skip === true) {
    return { skip: true, reasoning: String(parsed.reasoning ?? "unspecified") };
  }

  // Coerce + validate. Fall back to defaults on missing fields.
  const side = (parsed.side === "sell" ? "sell" : parsed.side === "buy" ? "buy" : defaults.side) as "buy" | "sell";
  const asset = typeof parsed.asset === "string" && parsed.asset.length > 0 ? parsed.asset : defaults.asset;
  const sizeLo = toBigInt(parsed.size_lo, defaults.sizeLo);
  const sizeHi = toBigInt(parsed.size_hi, defaults.sizeHi);
  const priceLo = toBigInt(parsed.price_lo, defaults.priceLo);
  const priceHi = toBigInt(parsed.price_hi, defaults.priceHi);
  let ttlMin = Number(parsed.ttl_min);
  if (!Number.isFinite(ttlMin) || ttlMin < 5 || ttlMin > 1440) ttlMin = defaults.ttlMin;

  if (sizeLo <= 0n || sizeHi <= 0n || sizeLo > sizeHi) {
    throw new Error(`LLM bad size range: lo=${sizeLo} hi=${sizeHi}`);
  }
  if (priceLo <= 0n || priceHi <= 0n || priceLo > priceHi) {
    throw new Error(`LLM bad price range: lo=${priceLo} hi=${priceHi}`);
  }

  return {
    skip: false,
    reasoning: String(parsed.reasoning ?? ""),
    side,
    asset,
    sizeLo,
    sizeHi,
    priceLo,
    priceHi,
    ttlMin,
  };
}

function toBigInt(v: unknown, fallback: bigint): bigint {
  if (typeof v === "string" || typeof v === "number") {
    try { return BigInt(Math.floor(Number(v))); } catch { return fallback; }
  }
  return fallback;
}
