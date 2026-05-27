'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from '@mysten/dapp-kit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Transaction } from '@mysten/sui/transactions';
import {
  encryptOrder,
  submitOrderTx,
  getActiveOrders,
  getReceipts,
} from '@/lib/shell-sdk';
import { getBlob } from '@/lib/walrus';
import { MatchProposalBcs } from '@/lib/ioi';
import { friendlyError } from '@/lib/errors';
import { playDing } from '@/lib/sound';
import {
  BASE_COIN_TYPE,
  QUOTE_COIN_TYPE,
  QUOTE_SYMBOL,
  TRADING_PAIRS,
  collateralTypeFor,
  getSealClient,
  NETWORK,
  SHELL_PACKAGE_ID,
  SHELL_PACKAGE_ID_IOI_TYPES,
} from '@/lib/sui';

/** Return baseDecimals for a given base coin type, falling back to 9 (SUI). */
function baseDecimalsFor(coinType: string): number {
  return TRADING_PAIRS.find((p) => p.baseCoinType === coinType)?.baseDecimals ?? 9;
}

const WALRUS_AGGREGATOR =
  process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR ??
  'https://aggregator.walrus-testnet.walrus.space';

const EXPLORER = (id: string) => `https://suiscan.xyz/${NETWORK}/tx/${id}`;
const SUI_TYPE = '0x2::sui::SUI';

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function shortBlob(b: string): string {
  return b.length > 14 ? `${b.slice(0, 8)}…${b.slice(-4)}` : b;
}

function timeAgo(ms: number): string {
  const d = Date.now() - ms;
  if (d < 60_000) return `${Math.floor(d / 1000)}s ago`;
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  return `${Math.floor(d / 3_600_000)}h ago`;
}

// Format a raw u64 with `decimals` implied decimal places, trimming
// trailing zeros after the dot. Returns '—' for zero (blob-decode fail).
function formatScaled(raw: bigint, decimals: number): string {
  if (raw === BigInt(0)) return '—';
  const scale = BigInt(10 ** decimals);
  const whole = raw / scale;
  const frac = raw % scale;
  if (frac === BigInt(0)) return whole.toString();
  return `${whole}.${frac
    .toString()
    .padStart(decimals, '0')
    .replace(/0+$/, '')}`;
}

// Quote price uses a 1e6 scale (matches IOIForm / SealedOrderForm /
// enclave). Independent of the quote coin's actual decimals.
const PRICE_DECIMALS = 6;

function hexToUtf8(hex: string): string {
  const s = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(s.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  }
  return new TextDecoder().decode(bytes);
}

function decodeBlobId(v: unknown): string {
  if (typeof v === 'string') return hexToUtf8(v);
  if (Array.isArray(v))
    return new TextDecoder().decode(new Uint8Array(v as number[]));
  return '?';
}

export default function ProposalFeed() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const queryClient = useQueryClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  const [accepting, setAccepting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ACCEPTED_KEY = 'shell_accepted_proposals_v2'; // keyed by `${addr}:${blobId}`
  const [accepted, setAccepted] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      return JSON.parse(localStorage.getItem(ACCEPTED_KEY) ?? '{}');
    } catch {
      return {};
    }
  });
  const seenDigests = useRef<Set<string>>(new Set());

  // User's own alive OrderCommitments + collateral values + originating tx digest.
  // We match a proposal to one of these by (collateralType, collateralValue) below.
  const { data: aliveOrders } = useQuery({
    queryKey: ['alive-orders-with-collateral', account?.address],
    queryFn: async () => {
      if (!account) return [];
      const orders = await getActiveOrders(suiClient, {
        shellPackageId: SHELL_PACKAGE_ID,
        trader: account.address,
      });
      if (orders.length === 0) return [];

      // Re-fetch each commitment with showContent to read the collateral
      // balance, and resolve the originating tx digest from the object's
      // previousTransaction (set when the order was first submitted).
      const enriched = await suiClient.multiGetObjects({
        ids: orders.map((o) => o.orderId),
        options: { showContent: true, showPreviousTransaction: true },
      });
      const byId = new Map<
        string,
        { collateral: bigint; submitDigest: string }
      >();
      for (const o of enriched) {
        if (!o.data?.objectId || o.data?.content?.dataType !== 'moveObject') {
          continue;
        }
        const fields = o.data.content.fields as { collateral?: string };
        byId.set(o.data.objectId, {
          collateral: BigInt(fields.collateral ?? '0'),
          submitDigest: o.data.previousTransaction ?? '',
        });
      }
      return orders
        .map((o) => {
          const extra = byId.get(o.orderId);
          if (!extra) return null;
          return {
            orderId: o.orderId,
            collateralType: o.collateralType,
            collateralValue: extra.collateral,
            submitDigest: extra.submitDigest,
            submittedAtMs: o.submittedAtMs,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
    },
    enabled: !!account,
    refetchInterval: 10_000,
  });

  // User's settled receipts — used to mark proposals whose acceptance has
  // already been consumed by `settle`.
  const { data: userReceipts } = useQuery({
    queryKey: ['user-receipts-feed', account?.address],
    queryFn: () =>
      account
        ? getReceipts(suiClient, {
            shellPackageId: SHELL_PACKAGE_ID,
            owner: account.address,
          })
        : Promise.resolve([]),
    enabled: !!account,
    refetchInterval: 10_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['match-proposed', account?.address],
    queryFn: async () => {
      if (!account) return [];
      const res = await suiClient.queryEvents({
        query: { MoveEventType: `${SHELL_PACKAGE_ID_IOI_TYPES}::ioi::MatchProposed` },
        limit: 50,
        order: 'descending',
      });
      const me = account.address.toLowerCase();
      const mine = res.data
        .map((ev) => {
          const j = ev.parsedJson as {
            buy_agent: string;
            sell_agent: string;
            buy_blob_id: unknown;
            sell_blob_id: unknown;
          };
          const buyAgent = j.buy_agent.toLowerCase();
          const sellAgent = j.sell_agent.toLowerCase();
          let side: 'buy' | 'sell' | null = null;
          if (buyAgent === me) side = 'buy';
          else if (sellAgent === me) side = 'sell';
          if (!side) return null;
          const blob =
            side === 'buy'
              ? decodeBlobId(j.buy_blob_id)
              : decodeBlobId(j.sell_blob_id);
          return {
            side,
            counterparty: side === 'buy' ? sellAgent : buyAgent,
            blob,
            txDigest: ev.id.txDigest,
            timestamp: Number(ev.timestampMs ?? Date.now()),
          };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);

      // Enrich each proposal with the BCS-decoded plaintext so we can
      // compute the exact collateral the acceptance order escrows.
      // Walrus blobs are content-addressed and immutable, so this is a
      // one-shot lookup per blob_id.
      return Promise.all(
        mine.map(async (p) => {
          try {
            const bytes = await getBlob(p.blob);
            const parsed = MatchProposalBcs.parse(bytes);
            return {
              ...p,
              agreedPrice: BigInt(parsed.agreed_price),
              agreedSize: BigInt(parsed.agreed_size),
              asset: parsed.asset as string,
            };
          } catch {
            return { ...p, agreedPrice: BigInt(0), agreedSize: BigInt(0), asset: BASE_COIN_TYPE };
          }
        }),
      );
    },
    enabled: !!account,
    refetchInterval: 5_000,
    staleTime: 30_000,
  });

  // Dedupe by (side, agreedPrice, agreedSize, counterparty). The enclave
  // re-emits a fresh MatchProposed every matcher tick while the same IOI
  // pair remains in its in-memory book, so a single trade can spawn many
  // identical-content proposals with different blob_ids. Keep the newest
  // of each group so the UI shows one actionable row per real match.
  // Proposals whose Walrus blob expired (agreedSize=0) are excluded — they
  // can't be decoded, can't be accepted, and would steal receipt matches
  // from real proposals with the same counterparty.
  const displayData = useMemo(() => {
    if (!data) return undefined;
    const byKey = new Map<string, (typeof data)[number]>();
    for (const p of data) {
      if (p.agreedSize === BigInt(0)) continue; // blob expired — skip
      const key = `${p.side}|${p.agreedPrice}|${p.agreedSize}|${p.counterparty}`;
      const existing = byKey.get(key);
      if (!existing || p.timestamp > existing.timestamp) byKey.set(key, p);
    }
    return Array.from(byKey.values()).sort((a, b) => b.timestamp - a.timestamp);
  }, [data]);

  // Exact mapping: for each proposal, compute the expected collateral
  // amount + coin type the acceptance would escrow, then look for a
  // live OrderCommitment with that exact (type, value). If no live one
  // matches, check the user's SettlementReceipts for an exact
  // (filled_price, filled_size, counterparty) match → settled.
  //
  // Keyed by the same (side|price|size|counterparty) string the table
  // uses for dedup — duplicate-content proposals share the same key so
  // the displayed row finds the chain state regardless of which blob_id
  // the greedy claim happened to pick.
  type ChainState =
    | { status: 'settled'; receiptId: string }
    | { status: 'accepted'; digest: string };
  const proposalKey = (p: {
    side: string;
    agreedPrice: bigint;
    agreedSize: bigint;
    counterparty: string;
    asset?: string;
  }) =>
    `${p.side}|${p.agreedPrice}|${p.agreedSize}|${p.counterparty}|${(p as { asset?: string }).asset ?? BASE_COIN_TYPE}`;
  const chainAccepted = useMemo(() => {
    if (!data) return {} as Record<string, ChainState>;
    const out: Record<string, ChainState> = {};
    const remainingOrders = [...(aliveOrders ?? [])];
    const remainingReceipts = [...(userReceipts ?? [])];
    // Dedup by content first so each group claims at most one
    // receipt / order, then sort asc for stable claim order.
    const byKey = new Map<string, (typeof data)[number]>();
    for (const p of data) {
      if (p.agreedSize === BigInt(0)) continue; // blob expired — can't match
      const k = proposalKey(p);
      const existing = byKey.get(k);
      if (!existing || p.timestamp < existing.timestamp) byKey.set(k, p);
    }
    const sorted = Array.from(byKey.values()).sort(
      (a, b) => a.timestamp - b.timestamp,
    );
    for (const p of sorted) {
      const key = proposalKey(p);
      // Settled? Require exact (counterparty + price + size) match so
      // multiple trades between the same two wallets don't cross-claim
      // each other's receipts.
      const rIdx = remainingReceipts.findIndex(
        (r) =>
          r.fields.counterparty.toLowerCase() === p.counterparty.toLowerCase() &&
          BigInt(r.fields.filled_price) === p.agreedPrice &&
          BigInt(r.fields.filled_size) === p.agreedSize,
      );
      if (rIdx >= 0) {
        out[key] = {
          status: 'settled',
          receiptId: remainingReceipts[rIdx].objectId,
        };
        remainingReceipts.splice(rIdx, 1);
        continue;
      }
      // Accepted but not yet settled?
      const baseCoin = (p as { asset?: string }).asset ?? BASE_COIN_TYPE;
      const floatScaling = BigInt(10 ** baseDecimalsFor(baseCoin));
      const expectedType = p.side === 'buy' ? QUOTE_COIN_TYPE : baseCoin;
      const expectedValue =
        p.side === 'sell'
          ? p.agreedSize
          : (p.agreedSize * p.agreedPrice) / floatScaling;
      const oIdx = remainingOrders.findIndex(
        (o) =>
          o.collateralType === expectedType &&
          o.collateralValue === expectedValue,
      );
      if (oIdx >= 0) {
        out[key] = {
          status: 'accepted',
          digest: remainingOrders[oIdx].submitDigest,
        };
        remainingOrders.splice(oIdx, 1);
      }
    }
    return out;
  }, [data, aliveOrders, userReceipts]);

  // Play a chime when new decodable proposals arrive.
  useEffect(() => {
    if (!data) return;
    const isFirstPass = seenDigests.current.size === 0;
    const newUnseen = data.filter((p) => !seenDigests.current.has(p.txDigest));
    // Track ALL digests (including failed blobs) so isFirstPass stays correct.
    data.forEach((p) => seenDigests.current.add(p.txDigest));
    // Only ding when the new proposal actually decoded (blob available).
    const newDecoded = newUnseen.filter((p) => p.agreedSize > BigInt(0));
    if (isFirstPass || newDecoded.length === 0) return;
    playDing();
  }, [data]);

  async function handleAccept(
    blobId: string,
    side: 'buy' | 'sell',
  ): Promise<void> {
    if (!account) return;
    setError(null);
    setAccepting(blobId);
    try {
      // 1. Fetch proposal blob from Walrus + BCS-decode.
      const bytes = await getBlob(blobId);
      const proposal = MatchProposalBcs.parse(bytes);
      const agreedPrice = BigInt(proposal.agreed_price);
      const agreedSize = BigInt(proposal.agreed_size);
      const baseCoin = (proposal.asset as string) || BASE_COIN_TYPE;
      const floatScaling = BigInt(10 ** baseDecimalsFor(baseCoin));

      // 2. Build sealed Shell order with proposal terms.
      const seal = getSealClient(suiClient);
      const { epoch } = await suiClient.getLatestSuiSystemState();
      const expiryEpoch = BigInt(epoch) + BigInt(5);

      const enc = await encryptOrder({
        sealClient: seal,
        shellPackageId: SHELL_PACKAGE_ID,
        threshold: 1,
        order: {
          side,
          size: agreedSize,
          limitPrice: agreedPrice,
          expiryEpoch,
          maxSlippageBps: 50,
          asset: baseCoin,
        },
      });

      // 3. Build PTB with collateral.
      const tx = new Transaction();
      const collateralType = side === 'buy' ? QUOTE_COIN_TYPE : baseCoin;
      const collateralAmount =
        side === 'sell' ? agreedSize : (agreedSize * agreedPrice) / floatScaling;

      let collateral;
      if (collateralType === SUI_TYPE) {
        [collateral] = tx.splitCoins(tx.gas, [tx.pure.u64(collateralAmount)]);
      } else {
        const coins = await suiClient.getCoins({
          owner: account.address,
          coinType: collateralType,
        });
        if (coins.data.length === 0) {
          throw new Error(`No ${collateralType.split('::').pop()} in wallet.`);
        }
        const primary = tx.object(coins.data[0].coinObjectId);
        if (coins.data.length > 1) {
          tx.mergeCoins(
            primary,
            coins.data.slice(1).map((c) => tx.object(c.coinObjectId)),
          );
        }
        [collateral] = tx.splitCoins(primary, [tx.pure.u64(collateralAmount)]);
      }

      submitOrderTx({
        shellPackageId: SHELL_PACKAGE_ID,
        collateralType,
        collateral,
        sealedEnvelope: enc.sealedEnvelope,
        commitHash: enc.commitHash,
        expiryEpoch,
        tx,
      });

      const res = await signAndExecute({ transaction: tx });
      await suiClient.waitForTransaction({ digest: res.digest });
      const key = `${account.address.toLowerCase()}:${blobId}`;
      setAccepted((m) => {
        const next = { ...m, [key]: res.digest };
        try {
          localStorage.setItem(ACCEPTED_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['alive-orders-with-collateral'] });
    } catch (err) {
      setError(friendlyError(err, 'Accept failed'));
    } finally {
      setAccepting(null);
    }
  }

  if (!account) {
    return (
      <div className="glass-panel rounded border border-outline-variant p-4">
        <div className="text-on-surface-variant font-mono-sm text-mono-sm py-8 text-center">
          Connect wallet to see match proposals.
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded border border-outline-variant p-4">
      <div className="flex justify-between items-center mb-4 border-b border-outline-variant pb-2">
        <h2 className="font-body-base text-on-surface font-medium">
          Match Proposals
        </h2>
        <span className="font-mono-sm text-mono-sm text-on-surface-variant">
          {displayData?.length ?? 0} addressed to you
        </span>
      </div>

      {error && (
        <div className="font-mono-sm text-mono-sm text-error mb-3">{error}</div>
      )}

      {isLoading ? (
        <div className="text-on-surface-variant font-mono-sm text-mono-sm py-6 text-center">
          Loading…
        </div>
      ) : displayData && displayData.length > 0 ? (
        <table className="w-full text-left font-mono-sm text-mono-sm">
          <thead>
            <tr className="text-on-surface-variant border-b border-outline-variant">
              <th className="pb-2 pr-3 font-normal">Side</th>
              <th className="pb-2 pr-3 font-normal text-right">Size</th>
              <th className="pb-2 pr-4 font-normal text-right">
                Price ({QUOTE_SYMBOL})
              </th>
              <th className="pb-2 pr-3 font-normal">Counterparty</th>
              <th className="pb-2 pr-3 font-normal">Blob</th>
              <th className="pb-2 pr-3 font-normal">Received</th>
              <th className="pb-2 font-normal text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {displayData.map((p) => {
              const isAccepting = accepting === p.blob;
              const state = chainAccepted[proposalKey(p)];
              const localDigest =
                accepted[`${account.address.toLowerCase()}:${p.blob}`];
              return (
                <tr
                  key={p.txDigest}
                  className="border-b border-[#1E293B] last:border-0 hover:bg-[#1A1D23] transition-colors"
                >
                  <td className="py-3 pr-3">
                    <span
                      className={
                        p.side === 'buy'
                          ? 'text-primary border border-primary px-2 py-0.5 rounded text-[10px]'
                          : 'text-error border border-error px-2 py-0.5 rounded text-[10px]'
                      }
                    >
                      {p.side.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-3 pr-3 text-right text-on-surface font-mono-data">
                    {formatScaled(p.agreedSize, baseDecimalsFor((p as { asset?: string }).asset ?? BASE_COIN_TYPE))}
                    {' '}
                    <span className="text-on-surface-variant text-[10px]">
                      {TRADING_PAIRS.find((tp) => tp.baseCoinType === ((p as { asset?: string }).asset ?? BASE_COIN_TYPE))?.baseSymbol ?? 'SUI'}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-right text-on-surface font-mono-data">
                    {formatScaled(p.agreedPrice, PRICE_DECIMALS)}
                  </td>
                  <td className="py-3 pr-3 text-on-surface-variant">
                    {shortAddr(p.counterparty)}
                  </td>
                  <td className="py-3 pr-3">
                    <a
                      href={`${WALRUS_AGGREGATOR}/v1/blobs/${p.blob}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-secondary hover:text-primary transition-colors"
                      title={p.blob}
                    >
                      {shortBlob(p.blob)}
                    </a>
                  </td>
                  <td className="py-3 pr-3 text-on-surface-variant">
                    {timeAgo(p.timestamp)}
                  </td>
                  <td className="py-3 text-right">
                    {state?.status === 'settled' ? (
                      <a
                        href={`https://suiscan.xyz/${NETWORK}/object/${state.receiptId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-300 border border-emerald-500/60 bg-emerald-500/15 px-2 py-1 rounded text-[10px] hover:bg-emerald-500/25 transition-colors"
                        title={`Receipt ${state.receiptId}`}
                      >
                        SETTLED ↗
                      </a>
                    ) : state?.status === 'accepted' ? (
                      <a
                        href={EXPLORER(state.digest)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary border border-primary/30 px-2 py-1 rounded text-[10px] hover:bg-primary/10 transition-colors"
                      >
                        ACCEPTED ↗
                      </a>
                    ) : localDigest ? (
                      <a
                        href={EXPLORER(localDigest)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-on-surface-variant border border-outline-variant px-2 py-1 rounded text-[10px] hover:bg-surface-container-high transition-colors"
                        title="Submitted but not yet confirmed on-chain via collateral match"
                      >
                        SUBMITTED ↗
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleAccept(p.blob, p.side)}
                        disabled={isAccepting}
                        className="bg-primary/10 border border-primary text-primary px-3 py-1 rounded text-[10px] hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {isAccepting ? 'Accepting…' : 'Accept'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className="text-on-surface-variant font-mono-sm text-mono-sm py-8 text-center">
          No proposals yet. The enclave emits one once a compatible IOI lands.
        </div>
      )}
    </div>
  );
}
