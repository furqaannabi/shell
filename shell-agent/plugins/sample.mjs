/**
 * Sample plugin — demonstrates two things:
 *   1. External HTTP fetch (get_enclave_status — Shell's own liveness endpoint)
 *   2. ctx.suiClient usage (get_network_gas_price — live Sui network data)
 *
 * Registered as plugin__get_enclave_status and plugin__get_network_gas_price.
 * The LLM can call these alongside built-ins to inform trading decisions.
 *
 * To write your own plugin: copy this file, change name/description/execute,
 * and drop it in plugins/. It auto-loads on next start.
 */

import { z } from "zod";

const ENCLAVE_BASE = "https://sui.furqaannabi.com";

/** Checks Shell enclave liveness — useful before the LLM accepts a match,
 *  to verify the enclave is alive and its IOI book is non-empty. */
const getEnclaveStatus = {
  name: "get_enclave_status",
  description:
    "Returns Shell enclave health: { alive, ioi_book_size, order_book_size, " +
    "last_ioi_tick_age_s, last_order_tick_age_s }. " +
    "Call before accepting a proposal to verify the enclave is running. " +
    "Reject if alive=false or last tick age > 120s (enclave may be stale).",
  parameters: z.object({}),
  async execute() {
    const res = await fetch(`${ENCLAVE_BASE}/shell/status`, {
      signal: AbortSignal.timeout(5_000),
    }).catch((e) => ({ ok: false, error: e.message }));

    if (!("ok" in res) || !res.ok) {
      const err = "error" in res ? res.error : `HTTP ${res.status}`;
      return { alive: false, error: err };
    }

    const j = await res.json();

    const ioiTickMs = Number(j.ioi_matcher_last_tick_ms ?? 0);
    const orderTickMs = Number(j.order_poller_last_tick_ms ?? 0);
    const nowMs = Date.now();

    return {
      alive: true,
      ioi_book_size: j.ioi_book_size ?? 0,
      order_book_size: j.order_book_size ?? 0,
      last_ioi_tick_age_s: ioiTickMs > 0 ? Math.round((nowMs - ioiTickMs) / 1000) : null,
      last_order_tick_age_s: orderTickMs > 0 ? Math.round((nowMs - orderTickMs) / 1000) : null,
      raw: j,
    };
  },
};

/** Returns the Sui network's current reference gas price. Useful context
 *  before submitting an order — very high gas prices may affect profitability. */
const getNetworkGasPrice = {
  name: "get_network_gas_price",
  description:
    "Returns { reference_gas_price_mist, reference_gas_price_sui } for the " +
    "current Sui epoch. 1 SUI = 1_000_000_000 MIST. Typical testnet price is ~1000 MIST.",
  parameters: z.object({}),
  async execute(_args, ctx) {
    const state = await ctx.suiClient.getLatestSuiSystemState();
    const mist = Number(state.referenceGasPrice);
    return {
      reference_gas_price_mist: mist,
      reference_gas_price_sui: mist / 1e9,
      epoch: state.epoch,
    };
  },
};

export default [getEnclaveStatus, getNetworkGasPrice];
