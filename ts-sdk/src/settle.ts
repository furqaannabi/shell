import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction, type TransactionObjectArgument } from "@mysten/sui/transactions";

/// Pull the collateral type T from an OrderCommitment<T> object's type tag.
/// Useful when an orchestrator discovers an order via events but doesn't
/// remember whether the trader posted SUI, USDC, or some other coin.
export async function getOrderCollateralType(
  suiClient: SuiJsonRpcClient,
  orderId: string,
): Promise<string> {
  const obj = await suiClient.getObject({ id: orderId, options: { showType: true } });
  const type = obj.data?.type;
  if (!type) {
    throw new Error(`getOrderCollateralType: object ${orderId} has no type`);
  }
  const m = type.match(/OrderCommitment<(.+)>$/);
  if (!m || !m[1]) {
    throw new Error(`getOrderCollateralType: unexpected type ${type}`);
  }
  return m[1];
}

export interface SettleMatchOptions {
  shellPackageId: string;
  /** Shared `Pool` object id (from deployments.poolId). Required by `settle_v2`. */
  poolId: string;
  /** Shared `Enclave<SHELL>` object id (from deployments.enclaveId). */
  enclaveId: string;
  /** Enclave's timestamp_ms from the signed envelope. */
  timestampMs: bigint;
  /** All hex strings can be `0x`-prefixed or not. */
  maker: string;
  taker: string;
  makerOrderId: string;
  takerOrderId: string;
  /** Move type of the maker order's collateral, e.g. `0x2::sui::SUI`. */
  makerCollateralType: string;
  takerCollateralType: string;
  filledSize: bigint;
  filledPrice: bigint;
  /** Decimals of the base coin (9 for SUI, 6 for TBILL/USDY/etc). */
  baseDecimals: number;
  /** Raw bytes the enclave embedded in MatchPayload.deepbook_tx_digest. */
  deepbookTxDigest: Uint8Array;
  /** Raw 64-byte ed25519 signature over the IntentMessage<MatchPayload>. */
  signature: Uint8Array;
  /** Existing transaction to append to; a new one is created if omitted. */
  tx?: Transaction;
}

/// Builds the settlement PTB: `shell::attestation::verify_v2` produces the
/// `MatchInstructionV2` hot-potato, which `shell::settlement::settle_v4` consumes
/// atomically with both OrderCommitments. The two type arguments must
/// match each order's actual `T` parameter — use `getOrderCollateralType`.
/// `settle_v4` rejects self-match (maker == taker), collects a 0.1% protocol
/// fee from both sides, and refunds buyer's price-improvement surplus.
export function settleMatchTx(opts: SettleMatchOptions): Transaction {
  if (opts.signature.length !== 64) {
    throw new Error(`settleMatchTx: signature must be 64 bytes (ed25519), got ${opts.signature.length}`);
  }
  if (opts.deepbookTxDigest.length !== 32) {
    throw new Error(`settleMatchTx: deepbookTxDigest must be 32 bytes, got ${opts.deepbookTxDigest.length}`);
  }
  if (with0x(opts.maker).toLowerCase() === with0x(opts.taker).toLowerCase()) {
    throw new Error(
      `settleMatchTx: maker and taker addresses are identical (${with0x(opts.maker)}) — self-match is disallowed`,
    );
  }
  const tx = opts.tx ?? new Transaction();

  const instruction = tx.moveCall({
    target: `${opts.shellPackageId}::attestation::verify_v2`,
    arguments: [
      tx.object(opts.enclaveId),
      tx.pure.u64(opts.timestampMs),
      tx.pure.address(with0x(opts.maker)),
      tx.pure.address(with0x(opts.taker)),
      tx.pure.id(with0x(opts.makerOrderId)),
      tx.pure.id(with0x(opts.takerOrderId)),
      tx.pure.u64(opts.filledSize),
      tx.pure.u64(opts.filledPrice),
      tx.pure.u8(opts.baseDecimals),
      tx.pure.vector("u8", Array.from(opts.deepbookTxDigest)),
      tx.pure.vector("u8", Array.from(opts.signature)),
    ],
  });

  tx.moveCall({
    target: `${opts.shellPackageId}::settlement::settle_v4`,
    typeArguments: [opts.makerCollateralType, opts.takerCollateralType],
    arguments: [
      instruction as TransactionObjectArgument,
      tx.object(with0x(opts.makerOrderId)) as TransactionObjectArgument,
      tx.object(with0x(opts.takerOrderId)) as TransactionObjectArgument,
      tx.object(with0x(opts.poolId)) as TransactionObjectArgument,
    ],
  });

  return tx;
}

function with0x(hex: string): string {
  return hex.startsWith("0x") ? hex : `0x${hex}`;
}
