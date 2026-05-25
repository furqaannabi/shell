import { z } from "zod";
import { getActiveOrders, getReceipts } from "@shell-finance/sdk";

import { config } from "../config.js";
import { appendEntry } from "../journal.js";
import { pollProposals } from "../proposals.js";
import { cancelOrderTx } from "@shell-finance/sdk";
import type { Tool } from "./registry.js";

/** DeepBook indexer mid/bid/ask for the configured reference pool. */
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

/** Agent's own SUI + USDC balance. */
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

/** Agent's recent SettlementReceipts (own fills). */
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

/** Agent's live OrderCommitments (collateral still locked on-chain). */
const getMyActiveOrders: Tool = {
  name: "get_my_active_orders",
  description:
    "Returns the agent's active (unfilled, unexpired) OrderCommitments. " +
    "Each entry: { order_id, collateral_type, expiry_epoch, submitted_at_ms }. " +
    "Empty array if no orders live.",
  parameters: z.object({
    limit: z.number().int().min(1).max(50).optional(),
  }),
  async execute(args, ctx) {
    const orders = await getActiveOrders(ctx.suiClient, {
      shellPackageId: config.shellPackageId,
      trader: ctx.address,
      limit: args.limit ?? 20,
    });
    return orders.map((o) => ({
      order_id: o.orderId,
      collateral_type: o.collateralType,
      expiry_epoch: o.expiryEpoch,
      submitted_at_ms: o.submittedAtMs,
    }));
  },
};

/** MatchProposed events involving this agent (pending proposals). */
const getMyActiveProposals: Tool = {
  name: "get_my_active_proposals",
  description:
    "Returns recent MatchProposed events where this agent is buy or sell side. " +
    "Each entry: { side, agreed_price, agreed_size, expiry_ms, blob_id }. " +
    "Useful to avoid double-filling the same match.",
  parameters: z.object({}),
  async execute(_args, ctx) {
    const { proposals } = await pollProposals({
      suiClient: ctx.suiClient,
      agentAddr: ctx.address,
    });
    const nowMs = BigInt(Date.now());
    return proposals
      .filter((p) => p.expiryMs > nowMs)
      .map((p) => ({
        side: p.side,
        agreed_price: p.agreedPrice.toString(),
        agreed_size: p.agreedSize.toString(),
        expiry_ms: p.expiryMs.toString(),
        blob_id: p.blobId,
      }));
  },
};

/** Cancel an expired OrderCommitment and reclaim collateral. */
const cancelOrder: Tool = {
  name: "cancel_order",
  description:
    "Cancels an expired OrderCommitment and returns collateral to the agent. " +
    "Requires order_id (from get_my_active_orders) and collateral_type. " +
    "On-chain check: aborts with EOrderNotExpired if order not yet expired — " +
    "Shell has no pre-expiry cancel by design.",
  parameters: z.object({
    order_id: z.string(),
    collateral_type: z.string(),
  }),
  async execute(args, ctx) {
    const tx = cancelOrderTx({
      shellPackageId: config.shellPackageId,
      orderId: args.order_id,
      collateralType: args.collateral_type,
      recipient: ctx.address,
    });
    const result = await ctx.suiClient.signAndExecuteTransaction({
      transaction: tx,
      signer: ctx.keypair,
    });
    return { digest: result.digest };
  },
};

/** Position + daily volume vs configured risk caps. */
const checkRiskCap: Tool = {
  name: "check_risk_cap",
  description:
    "Returns { within_cap, current_position_sui, daily_volume_sui, " +
    "cap_position_sui, cap_daily_sui }. " +
    "within_cap=true means accepting this proposal won't breach limits. " +
    "cap values come from RISK_MAX_POSITION_SUI / RISK_DAILY_VOLUME_SUI env (0 = no cap). " +
    "Pass proposed_size_sui = agreed_size / 1e9 (e.g. agreed_size=150000000 → proposed_size_sui=0.15). " +
    "If you don't know the size yet, pass 0.",
  parameters: z.object({
    proposed_size_sui: z
      .number()
      .optional()
      .describe("Size in SUI (human-readable). agreed_size / 1e9. Omit or pass 0 if unknown."),
  }),
  async execute(args, ctx) {
    const proposedSui = args.proposed_size_sui ?? 0;
    const capPosition = config.riskMaxPositionSui;
    const capDaily = config.riskDailyVolumeSui;

    // Aggregate fills from today (UTC day).
    const fills = await getReceipts(ctx.suiClient, {
      shellPackageId: config.shellPackageId,
      owner: ctx.address,
    });

    // All fills contribute to net position and daily volume (no timestamp in receipts).
    let netSui = 0;
    let dailyVolSui = 0;
    for (const r of fills) {
      const size = Number(r.fields.filled_size) / 1e9;
      netSui += size;
      dailyVolSui += size;
    }

    // Also count open orders as position.
    const orders = await getActiveOrders(ctx.suiClient, {
      shellPackageId: config.shellPackageId,
      trader: ctx.address,
      limit: 50,
    });
    const openSui = orders.length * proposedSui; // rough estimate

    const projectedPosition = netSui + openSui + proposedSui;
    const projectedDaily = dailyVolSui + proposedSui;

    const breachPosition = capPosition > 0 && projectedPosition > capPosition;
    const breachDaily = capDaily > 0 && projectedDaily > capDaily;

    return {
      within_cap: !breachPosition && !breachDaily,
      current_position_sui: netSui,
      daily_volume_sui: dailyVolSui,
      proposed_size_sui: proposedSui,
      cap_position_sui: capPosition,
      cap_daily_sui: capDaily,
      breach_position: breachPosition,
      breach_daily: breachDaily,
    };
  },
};

/** Append a free-text note to the agent's Walrus journal. */
const appendJournal: Tool = {
  name: "append_journal",
  description:
    "Appends a note/reasoning entry to the agent's Walrus journal. " +
    "Returns { blob_id } on success. Use sparingly — each call writes a Walrus blob.",
  parameters: z.object({
    note: z.string().max(2000),
  }),
  async execute(args, ctx) {
    const blobId = await appendEntry({
      timestamp_ms: Date.now(),
      agent_id: ctx.address,
      event: "decision",
      notes: args.note,
    });
    return { blob_id: blobId };
  },
};

/** POST JSON to WEBHOOK_URL if configured; no-op otherwise. */
const notifyWebhook: Tool = {
  name: "notify_webhook",
  description:
    "POSTs a JSON payload to WEBHOOK_URL env if set. No-op if unset. " +
    "Returns { sent: true } or { sent: false, reason }.",
  parameters: z.object({
    event: z.string(),
    data: z.record(z.unknown()).optional(),
  }),
  async execute(args) {
    const url = config.webhookUrl;
    if (!url) return { sent: false, reason: "WEBHOOK_URL not set" };
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: args.event, data: args.data ?? {}, ts: Date.now() }),
      });
      return { sent: true, status: res.status };
    } catch (e) {
      return { sent: false, reason: (e as Error).message };
    }
  },
};

/** All built-in tools, in stable registration order. */
export const builtinTools: Tool[] = [
  getRefPrice,
  getMyBalance,
  getMyRecentFills,
  getMyActiveOrders,
  getMyActiveProposals,
  cancelOrder,
  checkRiskCap,
  appendJournal,
  notifyWebhook,
];
