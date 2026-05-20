'use client';

import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit';
import { useQuery } from '@tanstack/react-query';
import { NETWORK, SHELL_PACKAGE_ID } from '@/lib/sui';

const WALRUS_AGGREGATOR =
  process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR ??
  'https://aggregator.walrus-testnet.walrus.space';

const EXPLORER = (id: string) => `https://suiscan.xyz/${NETWORK}/tx/${id}`;

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

  const { data, isLoading } = useQuery({
    queryKey: ['match-proposed', account?.address],
    queryFn: async () => {
      if (!account) return [];
      const res = await suiClient.queryEvents({
        query: { MoveEventType: `${SHELL_PACKAGE_ID}::ioi::MatchProposed` },
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

  if (!account) {
    return (
      <div className="text-on-surface-variant font-mono-sm text-mono-sm py-8 text-center">
        Connect wallet to see match proposals.
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

      {isLoading ? (
        <div className="text-on-surface-variant font-mono-sm text-mono-sm py-6 text-center">
          Loading…
        </div>
      ) : data && data.length > 0 ? (
        <table className="w-full text-left font-mono-sm text-mono-sm">
          <thead>
            <tr className="text-on-surface-variant border-b border-outline-variant">
              <th className="pb-2 font-normal">Your Side</th>
              <th className="pb-2 font-normal">Counterparty</th>
              <th className="pb-2 font-normal">Proposal Blob</th>
              <th className="pb-2 font-normal">Received</th>
              <th className="pb-2 font-normal text-right">Tx</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p) => (
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
                  <a
                    href={EXPLORER(p.txDigest)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-secondary hover:text-primary transition-colors"
                  >
                    {p.txDigest.slice(0, 6)}…
                  </a>
                </td>
              </tr>
            ))}
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
