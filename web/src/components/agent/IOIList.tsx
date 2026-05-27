'use client';

import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit';
import { useQuery } from '@tanstack/react-query';
import { NETWORK, SHELL_PACKAGE_ID_IOI_TYPES } from '@/lib/sui';

function shortBlob(b: string): string {
  return b.length > 14 ? `${b.slice(0, 8)}…${b.slice(-4)}` : b;
}

function timeAgo(ms: number): string {
  const d = Date.now() - ms;
  if (d < 60_000) return `${Math.floor(d / 1000)}s ago`;
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  return `${Math.floor(d / 3_600_000)}h ago`;
}

const WALRUS_AGGREGATOR =
  process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR ??
  'https://aggregator.walrus-testnet.walrus.space';

const EXPLORER = (id: string) => `https://suiscan.xyz/${NETWORK}/tx/${id}`;

export default function IOIList() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();

  const { data: currentEpoch } = useQuery({
    queryKey: ['sui-epoch'],
    queryFn: async () => {
      const state = await suiClient.getLatestSuiSystemState();
      return BigInt(state.epoch);
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['iois-posted', account?.address],
    queryFn: async () => {
      if (!account) return [];
      const res = await suiClient.queryEvents({
        query: { MoveEventType: `${SHELL_PACKAGE_ID_IOI_TYPES}::ioi::IoisPosted` },
        limit: 50,
        order: 'descending',
      });
      return res.data
        .filter(
          (ev) =>
            (ev.parsedJson as { agent_id?: string }).agent_id?.toLowerCase() ===
            account.address.toLowerCase(),
        )
        .map((ev) => {
          const j = ev.parsedJson as {
            blob_id?: string | number[];
            expiry_epoch?: string;
          };
          const blobRaw = j.blob_id;
          const blob =
            typeof blobRaw === 'string'
              ? hexToUtf8(blobRaw)
              : Array.isArray(blobRaw)
                ? new TextDecoder().decode(new Uint8Array(blobRaw))
                : '?';
          return {
            blob,
            expiry: BigInt(j.expiry_epoch ?? '0'),
            txDigest: ev.id.txDigest,
            timestamp: Number(ev.timestampMs ?? Date.now()),
          };
        });
    },
    enabled: !!account,
    refetchInterval: 10_000,
  });


  // An IOI is "active" until its expiry epoch. MatchProposed events do NOT
  // consume it — the enclave can re-propose, and the user may still reject.
  const activeIois = (() => {
    if (!data) return [];
    const nonExpired = currentEpoch !== undefined
      ? data.filter((ioi) => ioi.expiry > currentEpoch)
      : data;
    return [...nonExpired].sort((a, b) => b.timestamp - a.timestamp);
  })();

  if (!account) {
    return (
      <div className="text-on-surface-variant font-mono-sm text-mono-sm py-8 text-center">
        Connect wallet to see your IOIs.
      </div>
    );
  }

  return (
    <div className="glass-panel rounded border border-outline-variant p-4">
      <div className="flex justify-between items-center mb-4 border-b border-outline-variant pb-2">
        <h2 className="font-body-base text-on-surface font-medium">
          Active IOIs
        </h2>
        <span className="font-mono-sm text-mono-sm text-on-surface-variant">
          {activeIois.length} active
        </span>
      </div>

      {isLoading ? (
        <div className="text-on-surface-variant font-mono-sm text-mono-sm py-6 text-center">
          Loading…
        </div>
      ) : activeIois.length > 0 ? (
        <table className="w-full text-left font-mono-sm text-mono-sm">
          <thead>
            <tr className="text-on-surface-variant border-b border-outline-variant">
              <th className="pb-2 font-normal">
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[12px]">lock</span>
                  IOI (encrypted)
                </span>
              </th>
              <th className="pb-2 font-normal">Expiry Epoch</th>
              <th className="pb-2 font-normal">Posted</th>
              <th className="pb-2 font-normal text-right">Tx</th>
            </tr>
          </thead>
          <tbody>
            {activeIois.map((ioi) => (
              <tr
                key={ioi.txDigest}
                className="border-b border-[#1E293B] last:border-0 hover:bg-[#1A1D23] transition-colors"
              >
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <a
                      href={`${WALRUS_AGGREGATOR}/v1/blobs/${ioi.blob}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-secondary hover:text-primary transition-colors"
                      title={ioi.blob}
                    >
                      {shortBlob(ioi.blob)}
                    </a>
                    <span className="text-[9px] border border-outline-variant text-on-surface-variant px-1 rounded opacity-60">ENCRYPTED</span>
                  </div>
                </td>
                <td className="py-3 text-on-surface">{ioi.expiry.toString()}</td>
                <td className="py-3 text-on-surface-variant">
                  {timeAgo(ioi.timestamp)}
                </td>
                <td className="py-3 text-right">
                  <a
                    href={EXPLORER(ioi.txDigest)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-secondary hover:text-primary transition-colors"
                  >
                    {ioi.txDigest.slice(0, 6)}…
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="text-on-surface-variant font-mono-sm text-mono-sm py-8 text-center">
          No IOIs posted yet. Fill the form on the left and click{' '}
          <span className="text-primary">Post IOI</span> to publish one.
        </div>
      )}
    </div>
  );
}

function hexToUtf8(hex: string): string {
  const s = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(s.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  }
  return new TextDecoder().decode(bytes);
}
