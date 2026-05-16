import { Transaction, type TransactionObjectArgument } from "@mysten/sui/transactions";

export interface SubmitOrderTxOptions {
  shellPackageId: string;
  /** Move type of the collateral coin, e.g. "0x2::sui::SUI". */
  collateralType: string;
  /** TransactionObjectArgument referencing a Coin<collateralType>. */
  collateral: TransactionObjectArgument;
  sealedEnvelope: Uint8Array;
  commitHash: Uint8Array;
  expiryEpoch: bigint;
  /** Existing transaction to append to; a new one is created if omitted. */
  tx?: Transaction;
}

/// Builds a PTB call to `shell::pool::submit_order<T>`.
export function submitOrderTx(opts: SubmitOrderTxOptions): Transaction {
  const tx = opts.tx ?? new Transaction();
  tx.moveCall({
    target: `${opts.shellPackageId}::pool::submit_order`,
    typeArguments: [opts.collateralType],
    arguments: [
      tx.pure.vector("u8", Array.from(opts.sealedEnvelope)),
      tx.pure.vector("u8", Array.from(opts.commitHash)),
      opts.collateral,
      tx.pure.u64(opts.expiryEpoch),
    ],
  });
  return tx;
}

export interface CancelOrderTxOptions {
  shellPackageId: string;
  /** Move type of the collateral coin originally posted with the order.
   *  Use `getOrderCollateralType()` to derive this from the on-chain object. */
  collateralType: string;
  /** OrderCommitment<T> object id to cancel. */
  orderId: string;
  /** Sui address to receive the reclaimed coin. Usually the trader. */
  recipient: string;
  /** Existing transaction to append to; a new one is created if omitted. */
  tx?: Transaction;
}

/// Builds a PTB calling `shell::pool::cancel_expired<T>` and transferring
/// the reclaimed coin to `recipient`. Aborts on-chain with
/// `EOrderNotExpired` if `ctx.epoch() < order.expiry_epoch` — Shell has no
/// pre-expiry cancel by design (prevents trader/enclave races during a
/// pending settle).
export function cancelOrderTx(opts: CancelOrderTxOptions): Transaction {
  const tx = opts.tx ?? new Transaction();
  const [coin] = tx.moveCall({
    target: `${opts.shellPackageId}::pool::cancel_expired`,
    typeArguments: [opts.collateralType],
    arguments: [tx.object(opts.orderId)],
  });
  tx.transferObjects([coin as TransactionObjectArgument], opts.recipient);
  return tx;
}
