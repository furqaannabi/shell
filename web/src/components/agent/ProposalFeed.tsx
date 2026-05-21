'use client';

import { useState, useEffect, useRef } from 'react';
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from '@mysten/dapp-kit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Transaction } from '@mysten/sui/transactions';
import { encryptOrder, submitOrderTx } from '@/lib/shell-sdk';
import { getBlob } from '@/lib/walrus';
import { MatchProposalBcs } from '@/lib/ioi';
import { friendlyError } from '@/lib/errors';
import {
  collateralTypeFor,
  getSealClient,
  NETWORK,
  SHELL_PACKAGE_ID,
  SHELL_PACKAGE_ID_LATEST,
} from '@/lib/sui';

const WALRUS_AGGREGATOR =
  process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR ??
  'https://aggregator.walrus-testnet.walrus.space';

const EXPLORER = (id: string) => `https://suiscan.xyz/${NETWORK}/tx/${id}`;
const SUI_TYPE = '0x2::sui::SUI';
const FLOAT_SCALING = BigInt(1_000_000_000);

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
  const [accepted, setAccepted] = useState<Record<string, string>>({});
  const seenDigests = useRef<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['match-proposed', account?.address],
    queryFn: async () => {
      if (!account) return [];
      const res = await suiClient.queryEvents({
        query: { MoveEventType: `${SHELL_PACKAGE_ID_LATEST}::ioi::MatchProposed` },
        limit: 50,
        order: 'descending',
      });
      const me = account.address.toLowerCase();
      return res.data
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
    },
    enabled: !!account,
    refetchInterval: 5_000,
  });

  // Play a chime when new proposals arrive.
  useEffect(() => {
    if (!data) return;
    const newOnes = data.filter((p) => !seenDigests.current.has(p.txDigest));
    if (newOnes.length === 0) return;
    newOnes.forEach((p) => seenDigests.current.add(p.txDigest));
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } catch {
      // AudioContext blocked (e.g. no user gesture yet) — silent fail.
    }
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
        },
      });

      // 3. Build PTB with collateral.
      const tx = new Transaction();
      const collateralType = collateralTypeFor(side);
      const collateralAmount =
        side === 'sell' ? agreedSize : (agreedSize * agreedPrice) / FLOAT_SCALING;

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
      setAccepted((m) => ({ ...m, [blobId]: res.digest }));
      queryClient.invalidateQueries({ queryKey: ['active-commitments'] });
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
          {data?.length ?? 0} addressed to you
        </span>
      </div>

      {error && (
        <div className="font-mono-sm text-mono-sm text-error mb-3">{error}</div>
      )}

      {isLoading ? (
        <div className="text-on-surface-variant font-mono-sm text-mono-sm py-6 text-center">
          Loading…
        </div>
      ) : data && data.length > 0 ? (
        <table className="w-full text-left font-mono-sm text-mono-sm">
          <thead>
            <tr className="text-on-surface-variant border-b border-outline-variant">
              <th className="pb-2 font-normal">Side</th>
              <th className="pb-2 font-normal">Counterparty</th>
              <th className="pb-2 font-normal">Blob</th>
              <th className="pb-2 font-normal">Received</th>
              <th className="pb-2 font-normal text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p) => {
              const isAccepting = accepting === p.blob;
              const acceptedDigest = accepted[p.blob];
              return (
                <tr
                  key={p.txDigest}
                  className="border-b border-[#1E293B] last:border-0 hover:bg-[#1A1D23] transition-colors"
                >
                  <td className="py-3">
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
                  <td className="py-3 text-on-surface-variant">
                    {shortAddr(p.counterparty)}
                  </td>
                  <td className="py-3">
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
                  <td className="py-3 text-on-surface-variant">
                    {timeAgo(p.timestamp)}
                  </td>
                  <td className="py-3 text-right">
                    {acceptedDigest ? (
                      <a
                        href={EXPLORER(acceptedDigest)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary border border-primary/30 px-2 py-1 rounded text-[10px] hover:bg-primary/10 transition-colors"
                      >
                        ACCEPTED ↗
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
