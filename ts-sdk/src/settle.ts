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
  /** Raw bytes the enclave embedded in MatchPayload.deepbook_tx_digest. */
  deepbookTxDigest: Uint8Array;
  /** Raw 64-byte ed25519 signature over the IntentMessage<MatchPayload>. */
  signature: Uint8Array;
  /** Existing transaction to append to; a new one is created if omitted. */
  tx?: Transaction;
}

/// Builds the settlement PTB: `shell::attestation::verify` produces the
/// `MatchInstruction` hot-potato, which `shell::settlement::settle` consumes
/// atomically with both OrderCommitments. The two type arguments must
/// match each order's actual `T` parameter — use `getOrderCollateralType`.
export function settleMatchTx(opts: SettleMatchOptions): Transaction {
  const tx = opts.tx ?? new Transaction();

  const instruction = tx.moveCall({
    target: `${opts.shellPackageId}::attestation::verify`,
    arguments: [
      tx.object(opts.enclaveId),
      tx.pure.u64(opts.timestampMs),
      tx.pure.address(with0x(opts.maker)),
      tx.pure.address(with0x(opts.taker)),
      tx.pure.id(with0x(opts.makerOrderId)),
      tx.pure.id(with0x(opts.takerOrderId)),
      tx.pure.u64(opts.filledSize),
      tx.pure.u64(opts.filledPrice),
      tx.pure.vector("u8", Array.from(opts.deepbookTxDigest)),
      tx.pure.vector("u8", Array.from(opts.signature)),
    ],
  });

  tx.moveCall({
    target: `${opts.shellPackageId}::settlement::settle`,
    typeArguments: [opts.makerCollateralType, opts.takerCollateralType],
    arguments: [
      instruction as TransactionObjectArgument,
      tx.object(with0x(opts.makerOrderId)) as TransactionObjectArgument,
      tx.object(with0x(opts.takerOrderId)) as TransactionObjectArgument,
    ],
  });

  return tx;
}

function with0x(hex: string): string {
  return hex.startsWith("0x") ? hex : `0x${hex}`;
}
