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
import { parseMatchProposal } from '@/lib/ioi';
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

const WALRUS_EXPLORER = 'https://walruscan.com/testnet/blob';

const EXPLORER = (id: string) => `https://suiscan.xyz/${NETWORK}/tx/${id}`;
const SUI_TYPE = '0x2::sui::SUI';

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function shortBlob(b: string): string {
  return b.length > 14 ? `${b.slice(0, 8)}…${b.slice(-4)}` : b;
}

function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3_600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3_600)}h ago`;
  if (s < 604_800) return `${Math.floor(s / 86_400)}d ago`;
  if (s < 2_592_000) return `${Math.floor(s / 604_800)}w ago`;
  if (s < 31_536_000) return `${Math.floor(s / 2_592_000)}mo ago`;
  return `${Math.floor(s / 31_536_000)}y ago`;
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

export default function ProposalFeed({ embedded }: { embedded?: boolean } = {}) {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const queryClient = useQueryClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  const [accepting, setAccepting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ACCEPTED_KEY = 'shell_accepted_proposals_v2'; // keyed by `${addr}:${blobId}` OR `${addr}:key:${proposalKey}`
  const [accepted, setAccepted] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      return JSON.parse(localStorage.getItem(ACCEPTED_KEY) ?? '{}');
    } catch {
      return {};
    }
  });
  const seenDigests = useRef<Set<string>>(new Set());
  const seenDigestsForAccount = useRef<string | undefined>(undefined);
  const DECODED_CACHE_KEY = 'shell_decoded_proposals_v1';
  type DecodedEntry = { agreedPrice: string; agreedSize: string; asset: string; matchId: string; expiryMs: string };
  // Persist last-good decoded fields per blob so 404s don't kill proposals
  // across hot-reloads and page refreshes.
  const decodedCache = useRef<Map<string, {
    agreedPrice: bigint;
    agreedSize: bigint;
    asset: string;
    matchId: bigint;
    expiryMs: bigint;
  }>>((() => {
    const m = new Map<string, { agreedPrice: bigint; agreedSize: bigint; asset: string; matchId: bigint; expiryMs: bigint }>();
    if (typeof window === 'undefined') return m;
    try {
      const raw = JSON.parse(localStorage.getItem(DECODED_CACHE_KEY) ?? '{}') as Record<string, DecodedEntry>;
      for (const [blob, v] of Object.entries(raw)) {
        m.set(blob, { agreedPrice: BigInt(v.agreedPrice), agreedSize: BigInt(v.agreedSize), asset: v.asset, matchId: BigInt(v.matchId), expiryMs: BigInt(v.expiryMs) });
      }
    } catch {}
    return m;
  })());
  const CONFIRMED_KEY = 'shell_confirmed_accepted_v1';
  const CLAIMED_RECEIPTS_KEY = 'shell_claimed_receipts_v1';

  // Proposal keys whose ACCEPTED state was ever observed (persisted across
  // refreshes). Required before receipt matching is allowed.
  const [confirmedAcceptedKeys, setConfirmedAcceptedKeys] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try { return new Set(JSON.parse(localStorage.getItem(CONFIRMED_KEY) ?? '[]')); } catch { return new Set(); }
  });

  // Receipt objectIds already claimed by a prior SETTLED display. Prevents
  // a new proposal with the same (price, size, counterparty) from claiming
  // a receipt that belongs to an older trade.
  const [claimedReceiptIds, setClaimedReceiptIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try { return new Set(JSON.parse(localStorage.getItem(CLAIMED_RECEIPTS_KEY) ?? '[]')); } catch { return new Set(); }
  });

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
        // collateral is Balance<T> on-chain → JSON: { value: "123" }
        const fields = o.data.content.fields as { collateral?: { value?: string } };
        const rawCollateral = fields.collateral?.value ?? '0';
        console.debug('[aliveOrders] objectId', o.data.objectId, 'collateral raw:', fields.collateral, 'parsed:', rawCollateral);
        byId.set(o.data.objectId, {
          collateral: BigInt(rawCollateral),
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
            const parsed = parseMatchProposal(bytes);
            const decoded = {
              agreedPrice: BigInt(parsed.agreed_price),
              agreedSize: BigInt(parsed.agreed_size),
              asset: parsed.asset as string,
              matchId: BigInt(parsed.match_id),
              expiryMs: BigInt(parsed.expiry_ms),
            };
            decodedCache.current.set(p.blob, decoded);
            try {
              const raw: Record<string, DecodedEntry> = {};
              for (const [k, v] of decodedCache.current.entries()) {
                raw[k] = { agreedPrice: v.agreedPrice.toString(), agreedSize: v.agreedSize.toString(), asset: v.asset, matchId: v.matchId.toString(), expiryMs: v.expiryMs.toString() };
              }
              localStorage.setItem(DECODED_CACHE_KEY, JSON.stringify(raw));
            } catch {}
            return { ...p, ...decoded };
          } catch {
            const cached = decodedCache.current.get(p.blob);
            if (cached) return { ...p, ...cached };
            return { ...p, agreedPrice: BigInt(0), agreedSize: BigInt(0), asset: BASE_COIN_TYPE, matchId: BigInt(0), expiryMs: BigInt(0) };
          }
        }),
      );
    },
    enabled: !!account,
    refetchInterval: 5_000,
    staleTime: 30_000,
  });

  // Dedupe proposals. New enclave (with match_id) uses the match_id as the
  // key so each distinct match attempt gets its own row, even when terms are
  // identical. Old enclave blobs (match_id = 0) fall back to content-based
  // dedup `side|price|size|counterparty` — keeps newest of each group.
  // Expired blobs (agreedSize = 0) are excluded.
  const displayData = useMemo(() => {
    if (!data) return undefined;
    console.log('[ProposalFeed] displayData: raw proposals:', data.length,
      data.map(p => ({ blob: p.blob.slice(0,8), agreedSize: p.agreedSize.toString(), matchId: (p as {matchId?:bigint}).matchId?.toString() }))
    );
    const byKey = new Map<string, (typeof data)[number]>();
    for (const p of data) {
      if (p.agreedSize === BigInt(0)) continue;
      const key =
        (p as { matchId?: bigint }).matchId && (p as { matchId?: bigint }).matchId! > BigInt(0)
          ? `mid:${(p as { matchId?: bigint }).matchId!.toString()}`
          : `${p.side}|${p.agreedPrice}|${p.agreedSize}|${p.counterparty}`;
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
  // Content-based key — used for acceptedProposalKeys tracking.
  const proposalKey = (p: {
    side: string;
    agreedPrice: bigint;
    agreedSize: bigint;
    counterparty: string;
    asset?: string;
  }) =>
    `${p.side}|${p.agreedPrice}|${p.agreedSize}|${p.counterparty}|${(p as { asset?: string }).asset ?? BASE_COIN_TYPE}`;
  // Row key — unique per match attempt. Uses match_id when present so a new
  // match with the same terms as an old settled trade gets its own row/state.
  const rowKey = (p: {
    side: string;
    agreedPrice: bigint;
    agreedSize: bigint;
    counterparty: string;
    asset?: string;
    matchId?: bigint;
  }) =>
    p.matchId && p.matchId > BigInt(0)
      ? `mid:${p.matchId.toString()}`
      : proposalKey(p);

  // Set of proposalKeys this wallet actually accepted (persisted in localStorage
  // under `addr:key:proposalKey`). Also back-compat: derive keys from old
  // blob-format entries (`addr:blobId`) by cross-referencing with current data.
  const acceptedProposalKeys = useMemo(() => {
    if (!account) return new Set<string>();
    const addr = account.address.toLowerCase();
    const prefix = `${addr}:key:`;
    const keys = new Set<string>(
      Object.keys(accepted)
        .filter((k) => k.startsWith(prefix))
        .map((k) => k.slice(prefix.length)),
    );
    // Old-format entries: `addr:blobId` (no `key:` prefix). Cross-reference
    // with decoded proposals to recover the proposalKey.
    if (data) {
      for (const p of data) {
        if (p.agreedSize > BigInt(0) && accepted[`${addr}:${p.blob}`]) {
          keys.add(proposalKey(p));
        }
      }
    }
    return keys;
  }, [accepted, account, data]);

  const chainAccepted = useMemo(() => {
    if (!data) return {} as Record<string, ChainState>;
    const out: Record<string, ChainState> = {};
    const remainingOrders = [...(aliveOrders ?? [])];
    const remainingReceipts = [...(userReceipts ?? [])];
    // Dedup by rowKey so each distinct match_id gets its own slot.
    // Sort asc (oldest first) for stable receipt/order claim order.
    const byKey = new Map<string, (typeof data)[number]>();
    for (const p of data) {
      if (p.agreedSize === BigInt(0)) continue; // blob not decoded — skip
      const k = rowKey(p as typeof p & { matchId?: bigint });
      const existing = byKey.get(k);
      if (!existing || p.timestamp < existing.timestamp) byKey.set(k, p);
    }
    const sorted = Array.from(byKey.values()).sort(
      (a, b) => a.timestamp - b.timestamp,
    );
    for (const p of sorted) {
      const rk = rowKey(p as typeof p & { matchId?: bigint });
      const ck = proposalKey(p); // content key — for acceptedProposalKeys lookup
      if (acceptedProposalKeys.has(ck)) {
        const rIdx = remainingReceipts.findIndex(
          (r) =>
            r.fields.counterparty.toLowerCase() === p.counterparty.toLowerCase() &&
            BigInt(r.fields.filled_price) === p.agreedPrice &&
            BigInt(r.fields.filled_size) === p.agreedSize,
        );
        if (rIdx >= 0) {
          out[rk] = {
            status: 'settled',
            receiptId: remainingReceipts[rIdx].objectId,
          };
          remainingReceipts.splice(rIdx, 1);
          continue;
        }
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
        out[rk] = {
          status: 'accepted',
          digest: remainingOrders[oIdx].submitDigest,
        };
        remainingOrders.splice(oIdx, 1);
      }
    }
    return out;
  }, [data, aliveOrders, userReceipts, acceptedProposalKeys, claimedReceiptIds]);

  // When chainAccepted finds a live OrderCommitment → persist the key.
  // When chainAccepted shows SETTLED → persist the receipt objectId so it
  // can't be re-claimed by a new proposal with the same (price, size, counterparty).
  useEffect(() => {
    const newAccepted = Object.entries(chainAccepted)
      .filter(([, s]) => s.status === 'accepted')
      .map(([k]) => k)
      .filter((k) => !confirmedAcceptedKeys.has(k));
    const newClaimed = Object.values(chainAccepted)
      .filter((s): s is { status: 'settled'; receiptId: string } => s.status === 'settled')
      .map((s) => s.receiptId)
      .filter((id) => !claimedReceiptIds.has(id));
    if (newAccepted.length > 0) {
      setConfirmedAcceptedKeys((prev) => {
        const next = new Set([...prev, ...newAccepted]);
        try { localStorage.setItem(CONFIRMED_KEY, JSON.stringify([...next])); } catch {}
        return next;
      });
    }
    if (newClaimed.length > 0) {
      setClaimedReceiptIds((prev) => {
        const next = new Set([...prev, ...newClaimed]);
        try { localStorage.setItem(CLAIMED_RECEIPTS_KEY, JSON.stringify([...next])); } catch {}
        return next;
      });
    }
  }, [chainAccepted]); // eslint-disable-line react-hooks/exhaustive-deps

  // Back-compat bootstrap: auto-populate confirmedAcceptedKeys for old
  // blob-format accepted entries. Old trades never went through the
  // key: tracking path so confirmedAcceptedKeys was never set for them,
  // blocking receipt matching. Safe to bypass the "observed ACCEPTED" gate
  // here because these are historical trades whose OrderCommitment is gone.
  useEffect(() => {
    if (!data || !account) return;
    const addr = account.address.toLowerCase();
    const toConfirm = data
      .filter((p) => p.agreedSize > BigInt(0) && accepted[`${addr}:${p.blob}`])
      .map((p) => proposalKey(p));
    if (toConfirm.length === 0) return;
    setConfirmedAcceptedKeys((prev) => {
      const next = new Set([...prev, ...toConfirm]);
      if (next.size === prev.size) return prev;
      try { localStorage.setItem(CONFIRMED_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  }, [data, accepted, account]); // eslint-disable-line react-hooks/exhaustive-deps

  // Play a chime when new decodable proposals arrive.
  useEffect(() => {
    if (!data) return;
    // Reset when wallet changes so old wallet's proposals don't ding on reconnect.
    if (seenDigestsForAccount.current !== account?.address) {
      seenDigests.current = new Set();
      seenDigestsForAccount.current = account?.address;
    }
    const isFirstPass = seenDigests.current.size === 0;
    const newUnseen = data.filter((p) => !seenDigests.current.has(p.txDigest));
    // Track ALL digests (including failed blobs) so isFirstPass stays correct.
    data.forEach((p) => seenDigests.current.add(p.txDigest));
    // Only ding when the new proposal actually decoded (blob available).
    const newDecoded = newUnseen.filter((p) => p.agreedSize > BigInt(0));
    if (isFirstPass || newDecoded.length === 0) return;
    playDing();
  }, [data, account?.address]);

  async function handleAccept(
    blobId: string,
    side: 'buy' | 'sell',
    counterparty: string,
  ): Promise<void> {
    if (!account) return;
    setError(null);
    setAccepting(blobId);
    try {
      // 1. Decode proposal — use cache if blob is no longer available.
      const cached = decodedCache.current.get(blobId);
      let agreedPrice: bigint;
      let agreedSize: bigint;
      let baseCoin: string;
      if (cached) {
        agreedPrice = cached.agreedPrice;
        agreedSize = cached.agreedSize;
        baseCoin = cached.asset || BASE_COIN_TYPE;
      } else {
        const bytes = await getBlob(blobId);
        const proposal = parseMatchProposal(bytes);
        agreedPrice = BigInt(proposal.agreed_price);
        agreedSize = BigInt(proposal.agreed_size);
        baseCoin = (proposal.asset as string) || BASE_COIN_TYPE;
      }
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

      // Pre-flight balance check — avoids silent on-chain failure.
      const GAS_BUFFER = BigInt(200_000_000); // 0.2 SUI reserved for gas
      if (collateralType === SUI_TYPE) {
        const bal = await suiClient.getBalance({ owner: account.address, coinType: SUI_TYPE });
        const available = BigInt(bal.totalBalance);
        const needed = collateralAmount + GAS_BUFFER;
        if (available < needed) {
          const fmt = (n: bigint) => (Number(n) / 1e9).toFixed(3);
          throw new Error(
            `Insufficient SUI: need ${fmt(collateralAmount)} collateral + 0.2 gas = ${fmt(needed)} SUI, wallet has ${fmt(available)} SUI.`,
          );
        }
      } else {
        const coins = await suiClient.getCoins({ owner: account.address, coinType: collateralType });
        const totalCoin = coins.data.reduce((s, c) => s + BigInt(c.balance), BigInt(0));
        if (totalCoin < collateralAmount) {
          const pair = TRADING_PAIRS.find((tp) => tp.quoteCoinType === collateralType || tp.baseCoinType === collateralType);
          const isBase = pair?.baseCoinType === collateralType;
          const decimals = isBase ? (pair?.baseDecimals ?? 6) : (pair?.quoteDecimals ?? 6);
          const sym = (isBase ? pair?.baseSymbol : pair?.quoteSymbol) ?? collateralType.split('::').pop() ?? collateralType;
          const fmt = (n: bigint) => (Number(n) / 10 ** decimals).toFixed(decimals);
          throw new Error(
            `Insufficient ${sym}: need ${fmt(collateralAmount)} ${sym}, wallet has ${fmt(totalCoin)} ${sym}.`,
          );
        }
      }

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
      const txResult = await suiClient.waitForTransaction({
        digest: res.digest,
        options: { showEffects: true },
      });
      if (txResult.effects?.status?.status !== 'success') {
        throw new Error(`Transaction failed: ${txResult.effects?.status?.error ?? 'unknown error'}`);
      }
      const addr = account.address.toLowerCase();
      const key = `${addr}:${blobId}`;
      const pKey = proposalKey({ side, agreedPrice, agreedSize, counterparty, asset: baseCoin });
      const keyKey = `${addr}:key:${pKey}`;
      setAccepted((m) => {
        const next = { ...m, [key]: res.digest, [keyKey]: res.digest };
        try {
          localStorage.setItem(ACCEPTED_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['alive-orders-with-collateral'] });
      queryClient.invalidateQueries({ queryKey: ['user-receipts-feed'] });
    } catch (err) {
      setError(friendlyError(err, 'Accept failed'));
    } finally {
      setAccepting(null);
    }
  }

  if (!account) {
    return (
      <div className={embedded ? 'p-0' : 'glass-panel rounded border border-outline-variant p-4'}>
        <div className="text-on-surface-variant font-mono-sm text-mono-sm py-8 text-center">
          Connect wallet to see match proposals.
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? 'p-0' : 'glass-panel rounded border border-outline-variant p-4'}>
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
          <thead className="sticky top-0 bg-[#0D1117] z-10">
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
              const state = chainAccepted[rowKey(p as typeof p & { matchId?: bigint })];
              const localDigest =
                accepted[`${account.address.toLowerCase()}:${p.blob}`];
              const pExpiry = (p as { expiryMs?: bigint }).expiryMs;
              const expiryMs = pExpiry && pExpiry > BigInt(0) ? Number(pExpiry) : 0;
              const secsLeft = expiryMs > 0 ? Math.ceil((expiryMs - Date.now()) / 1000) : null;
              const isExpired = secsLeft !== null && secsLeft <= 0;
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
                      href={`${WALRUS_EXPLORER}/${p.blob}`}
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
                    ) : isExpired ? (
                      <span className="text-on-surface-variant border border-outline-variant px-2 py-1 rounded text-[10px] opacity-40">
                        EXPIRED
                      </span>
                    ) : (
                      <div className="flex flex-col items-end gap-0.5">
                        <button
                          type="button"
                          onClick={() => handleAccept(p.blob, p.side, p.counterparty)}
                          disabled={isAccepting}
                          className="bg-primary/10 border border-primary text-primary px-3 py-1 rounded text-[10px] hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          {isAccepting ? 'Accepting…' : 'Accept'}
                        </button>
                        {secsLeft !== null && secsLeft < 60 && (
                          <span className={`text-[9px] ${secsLeft < 30 ? 'text-yellow-400' : 'text-on-surface-variant'}`}>
                            {secsLeft}s
                          </span>
                        )}
                      </div>
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
