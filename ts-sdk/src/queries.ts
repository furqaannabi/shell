import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";

export interface ActiveOrder {
  /** OrderCommitment<T> shared object id. */
  orderId: string;
  /** Trader address from the OrderSubmitted event. */
  trader: string;
  /** SHA-256 of the BCS plaintext, hex-encoded without 0x prefix. */
  commitHash: string;
  /** Sui epoch number the order expires at. */
  expiryEpoch: number;
  /** Move type T from the live OrderCommitment<T>'s type tag,
   *  e.g. `0x2::sui::SUI` or `0x…::dusdc::DUSDC`. */
  collateralType: string;
  /** Sui timestamp (ms) when the OrderSubmitted event landed.
   *  0 if the RPC didn't return it. */
  submittedAtMs: number;
}

export interface GetActiveOrdersOptions {
  shellPackageId: string;
  /** Trader address to filter by. Pass `undefined` to get all traders. */
  trader?: string;
  /** Max events to scan in one queryEvents call. Default 50. The
   *  JSON-RPC filter has no AND, so the trader filter is applied
   *  client-side after the page is fetched. */
  limit?: number;
}

/// Fetch the trader's active orders: alive `OrderCommitment<T>` shared
/// objects with the matching `OrderSubmitted` event, enriched with the
/// collateral type extracted from each object's type tag.
///
/// Orders that have been cancelled, expired-and-deleted, or consumed
/// by `settle` are pruned (their object no longer exists on-chain).
///
/// Paginates through all `OrderSubmitted` events (up to `limit` per page)
/// so traders with many historical orders are not silently truncated.
export async function getActiveOrders(
  suiClient: SuiJsonRpcClient,
  opts: GetActiveOrdersOptions,
): Promise<ActiveOrder[]> {
  type SubmittedJson = {
    order_id: string;
    trader: string;
    commit_hash: number[];
    expiry_epoch: string;
  };

  const pageSize = opts.limit ?? 50;
  const allEvents: Array<{ json: SubmittedJson; submittedAtMs: number }> = [];
  let cursor: { txDigest: string; eventSeq: string } | null | undefined = undefined;

  do {
    const res = await suiClient.queryEvents({
      query: { MoveEventType: `${opts.shellPackageId}::pool::OrderSubmitted` },
      limit: pageSize,
      order: "descending",
      ...(cursor ? { cursor } : {}),
    });
    for (const e of res.data) {
      allEvents.push({
        json: e.parsedJson as SubmittedJson,
        submittedAtMs: e.timestampMs ? Number(e.timestampMs) : 0,
      });
    }
    cursor = res.hasNextPage ? (res.nextCursor ?? null) : null;
  } while (cursor);

  const candidates = allEvents
    .filter((x) => !opts.trader || x.json.trader.toLowerCase() === opts.trader.toLowerCase())
    .map(({ json, submittedAtMs }) => ({
      orderId: json.order_id,
      trader: json.trader,
      commitHash: json.commit_hash
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
      expiryEpoch: Number(json.expiry_epoch),
      submittedAtMs,
    }));

  if (candidates.length === 0) return [];

  // Prune dead orders and recover collateral type tag.
  const ids = candidates.map((c) => c.orderId);
  const objs = await suiClient.multiGetObjects({
    ids,
    options: { showType: true },
  });
  const typeByOrder = new Map<string, string>();
  for (const o of objs) {
    if (!o.data?.objectId || !o.data.type) continue;
    const m = o.data.type.match(/OrderCommitment<(.+)>$/);
    if (m && m[1]) typeByOrder.set(o.data.objectId, m[1]);
  }

  return candidates
    .filter((c) => typeByOrder.has(c.orderId))
    .map((c) => ({ ...c, collateralType: typeByOrder.get(c.orderId)! }));
}

export interface SettlementReceiptFields {
  trader: string;
  counterparty: string;
  filled_size: string;
  filled_price: string;
  deepbook_tx_digest: number[];
  enclave_signature: number[];
}

export interface GetReceiptsOptions {
  shellPackageId: string;
  /** Trader address whose owned receipts we want. */
  owner: string;
}

/// Fetch all `SettlementReceipt`s owned by `owner`, paginating through
/// every page so no receipts are missed regardless of RPC page size.
export async function getReceipts(
  suiClient: SuiJsonRpcClient,
  opts: GetReceiptsOptions,
): Promise<Array<{ objectId: string; fields: SettlementReceiptFields }>> {
  const all: Array<{ objectId: string; fields: SettlementReceiptFields }> = [];
  let cursor: string | null | undefined = undefined;

  do {
    const res = await suiClient.getOwnedObjects({
      owner: opts.owner,
      filter: { StructType: `${opts.shellPackageId}::pool::SettlementReceipt` },
      options: { showContent: true },
      limit: 50,
      ...(cursor ? { cursor } : {}),
    });

    all.push(
      ...res.data
        .filter((obj) => obj.data?.content?.dataType === "moveObject")
        .map((obj) => ({
          objectId: obj.data!.objectId,
          fields: (obj.data!.content as unknown as { fields: SettlementReceiptFields })
            .fields,
        })),
    );

    cursor = res.hasNextPage ? (res.nextCursor ?? null) : null;
  } while (cursor);

  return all;
}
