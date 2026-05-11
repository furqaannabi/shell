import { bcs } from "@mysten/bcs";

export type OrderSide = "buy" | "sell";

export interface OrderPlaintext {
  side: OrderSide;
  size: bigint;
  limitPrice: bigint;
  expiryEpoch: bigint;
  maxSlippageBps: number;
}

/// BCS schema mirrored by the matching enclave's Rust deserializer.
/// Field order is load-bearing.
export const OrderPlaintextBcs = bcs.struct("OrderPlaintext", {
  side: bcs.u8(),
  size: bcs.u64(),
  limitPrice: bcs.u64(),
  expiryEpoch: bcs.u64(),
  maxSlippageBps: bcs.u32(),
});

export function encodeOrder(order: OrderPlaintext): Uint8Array {
  return OrderPlaintextBcs.serialize({
    side: order.side === "buy" ? 0 : 1,
    size: order.size,
    limitPrice: order.limitPrice,
    expiryEpoch: order.expiryEpoch,
    maxSlippageBps: order.maxSlippageBps,
  }).toBytes();
}
