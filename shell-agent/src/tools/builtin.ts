import { z } from "zod";
import { getReceipts } from "@shell-finance/sdk";

import { config } from "../config.js";
import type { Tool } from "./registry.js";

/** DeepBook indexer mid/bid/ask for the configured reference pool.
 *  Mirrors `fetchMidPrice` in web/src/components/agent/IOIForm.tsx. */
const getRefPrice: Tool = {
  name: "get_ref_price",
  description:
    "Returns DeepBook reference price for SUI/USDC as { bid, ask, mid } " +
    "in USDC. Call before evaluating size/price to verify the proposal " +
    "is sensible vs current market. May return { error } if indexer down.",
  parameters: z.object({}),
  async execute() {
    const url = `${config.deepbookIndexerUrl}/orderbook/${config.deepbookPoolKey}?level=2&depth=2`;
    const res = await fetch(url);
    if (!res.ok) return { error: `deepbook indexer ${res.status}` };
    const j = (await res.json()) as {
      bids: [string, string][];
      asks: [string, string][];
    };
    const bid = parseFloat(j.bids[0]?.[0] ?? "0");
    const ask = parseFloat(j.asks[0]?.[0] ?? "0");
    if (!bid || !ask) return { error: "empty orderbook" };
    return { bid, ask, mid: (bid + ask) / 2 };
  },
};

/** Agent's own SUI + USDC balance. Useful for the LLM to verify it can
 *  cover collateral before accepting a buy/sell. */
const getMyBalance: Tool = {
  name: "get_my_balance",
  description:
    "Returns the agent's own balance as { sui_raw, usdc_raw, sui, usdc }. " +
    "Raw values are u64 strings at native scale (SUI 1e9, USDC 1e6); " +
    "the human-readable fields divide by that scale.",
  parameters: z.object({}),
  async execute(_args, ctx) {
    const [sui, usdc] = await Promise.all([
      ctx.suiClient.getBalance({ owner: ctx.address }),
      ctx.suiClient
        .getBalance({ owner: ctx.address, coinType: config.quoteCoinType })
        .catch(() => ({ totalBalance: "0" })),
    ]);
    return {
      sui_raw: sui.totalBalance,
      usdc_raw: usdc.totalBalance,
      sui: Number(sui.totalBalance) / 1e9,
      usdc: Number(usdc.totalBalance) / 1e6,
    };
  },
};

/** Agent's recent SettlementReceipts (own fills). Helps the LLM
 *  reason about position size and recent execution price. */
const getMyRecentFills: Tool = {
  name: "get_my_recent_fills",
  description:
    "Returns the last N SettlementReceipts owned by the agent, newest " +
    "first. Each entry has { object_id, counterparty, filled_size, " +
    "filled_price } where size/price are raw u64 strings.",
  parameters: z.object({
    limit: z.number().int().min(1).max(50).optional(),
  }),
  async execute(args, ctx) {
    const limit = args.limit ?? 10;
    const receipts = await getReceipts(ctx.suiClient, {
      shellPackageId: config.shellPackageId,
      owner: ctx.address,
    });
    return receipts.slice(0, limit).map((r) => ({
      object_id: r.objectId,
      counterparty: r.fields.counterparty,
      filled_size: r.fields.filled_size,
      filled_price: r.fields.filled_price,
    }));
  },
};

/** All built-in tools, in stable registration order. */
export const builtinTools: Tool[] = [getRefPrice, getMyBalance, getMyRecentFills];
