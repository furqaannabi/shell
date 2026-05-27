import { bcs } from "@mysten/bcs";

export type OrderSide = "buy" | "sell";

export interface OrderPlaintext {
  side: OrderSide;
  size: bigint;
  limitPrice: bigint;
  expiryEpoch: bigint;
  maxSlippageBps: number;
  /** Move coin type of the base asset (e.g. "0x2::sui::SUI"). Appended after
   *  existing fields for backward compatibility — old enclaves ignore the tail. */
  asset?: string;
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

const OrderPlaintextWithAssetBcs = bcs.struct("OrderPlaintextWithAsset", {
  side: bcs.u8(),
  size: bcs.u64(),
  limitPrice: bcs.u64(),
  expiryEpoch: bcs.u64(),
  maxSlippageBps: bcs.u32(),
  asset: bcs.string(),
});

export function encodeOrder(order: OrderPlaintext): Uint8Array {
  if (order.asset) {
    return OrderPlaintextWithAssetBcs.serialize({
      side: order.side === "buy" ? 0 : 1,
      size: order.size,
      limitPrice: order.limitPrice,
      expiryEpoch: order.expiryEpoch,
      maxSlippageBps: order.maxSlippageBps,
      asset: order.asset,
    }).toBytes();
  }
  return OrderPlaintextBcs.serialize({
    side: order.side === "buy" ? 0 : 1,
    size: order.size,
    limitPrice: order.limitPrice,
    expiryEpoch: order.expiryEpoch,
    maxSlippageBps: order.maxSlippageBps,
  }).toBytes();
}
