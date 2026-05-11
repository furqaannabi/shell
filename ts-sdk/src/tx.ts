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
