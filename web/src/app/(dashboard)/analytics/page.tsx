'use client';

import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit';
import { useQuery } from '@tanstack/react-query';
import { getActiveOrders, getReceipts } from '@/lib/shell-sdk';
import {
  SHELL_PACKAGE_ID,
  SHELL_PACKAGE_ID_IOI_TYPES,
  NETWORK,
  QUOTE_SYMBOL,
} from '@/lib/sui';

function truncateAddr(addr: string, chars = 4): string {
  if (addr.length <= chars * 2 + 2) return addr;
  return `${addr.slice(0, chars + 2)}...${addr.slice(-chars)}`;
}

function formatScaled(raw: string, decimals: number): string {
  const n = BigInt(raw);
  const scale = BigInt(10 ** decimals);
  const whole = n / scale;
  const frac = n % scale;
  if (frac === BigInt(0)) return whole.toString();
  return `${whole}.${frac.toString().padStart(decimals, '0').replace(/0+$/, '')}`;
}

const EXPLORER_OBJ = (id: string) => `https://suiscan.xyz/${NETWORK}/object/${id}`;
const EXPLORER_TX  = (id: string) => `https://suiscan.xyz/${NETWORK}/tx/${id}`;

export default function AnalyticsPage() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const me = account?.address.toLowerCase();

  // ── User-specific queries ────────────────────────────────────────────────
  const { data: myIois } = useQuery({
    queryKey: ['analytics-my-iois', me],
    queryFn: async () => {
      const res = await suiClient.queryEvents({
        query: { MoveEventType: `${SHELL_PACKAGE_ID_IOI_TYPES}::ioi::IoisPosted` },
        limit: 50,
        order: 'descending',
      });
      return res.data.filter(
        (ev) => (ev.parsedJson as { agent_id?: string }).agent_id?.toLowerCase() === me,
      );
    },
    enabled: !!me,
    refetchInterval: 15_000,
  });

  const { data: myMatches } = useQuery({
    queryKey: ['analytics-my-matches', me],
    queryFn: async () => {
      const res = await suiClient.queryEvents({
        query: { MoveEventType: `${SHELL_PACKAGE_ID_IOI_TYPES}::ioi::MatchProposed` },
        limit: 50,
        order: 'descending',
      });
      return res.data.filter((ev) => {
        const j = ev.parsedJson as { buy_agent?: string; sell_agent?: string };
        return j.buy_agent?.toLowerCase() === me || j.sell_agent?.toLowerCase() === me;
      });
    },
    enabled: !!me,
    refetchInterval: 15_000,
  });

  const { data: myOrders } = useQuery({
    queryKey: ['analytics-my-orders', me],
    queryFn: () => getActiveOrders(suiClient, { shellPackageId: SHELL_PACKAGE_ID, trader: account!.address }),
    enabled: !!me,
    refetchInterval: 15_000,
  });

  const { data: myFills } = useQuery({
    queryKey: ['analytics-my-fills', me],
    queryFn: () => getReceipts(suiClient, { shellPackageId: SHELL_PACKAGE_ID, owner: account!.address }),
    enabled: !!me,
    refetchInterval: 15_000,
  });

  // ── Protocol-wide counts (no wallet needed) ──────────────────────────────
  const { data: protoOrders } = useQuery({
    queryKey: ['analytics-proto-orders'],
    queryFn: () =>
      suiClient.queryEvents({
        query: { MoveEventType: `${SHELL_PACKAGE_ID}::pool::OrderSubmitted` },
        limit: 50,
        order: 'descending',
      }),
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const { data: protoIois } = useQuery({
    queryKey: ['analytics-proto-iois'],
    queryFn: () =>
      suiClient.queryEvents({
        query: { MoveEventType: `${SHELL_PACKAGE_ID_IOI_TYPES}::ioi::IoisPosted` },
        limit: 50,
        order: 'descending',
      }),
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const { data: protoMatches } = useQuery({
    queryKey: ['analytics-proto-matches'],
    queryFn: () =>
      suiClient.queryEvents({
        query: { MoveEventType: `${SHELL_PACKAGE_ID_IOI_TYPES}::ioi::MatchProposed` },
        limit: 50,
        order: 'descending',
      }),
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const sortedFills = myFills
    ? [...myFills].sort((a, b) => b.objectId.localeCompare(a.objectId))
    : [];

  return (
    <div className="flex flex-col gap-gutter w-full h-full overflow-hidden">

      {/* User stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-gutter">
        {[
          { label: 'My IOIs',        value: myIois?.length,   note: 'posted' },
          { label: 'My Matches',     value: myMatches?.length, note: 'proposed' },
          { label: 'My Open Orders', value: myOrders?.length, note: 'active' },
          { label: 'My Fills',       value: sortedFills.length, note: 'settled' },
        ].map(({ label, value, note }) => (
          <div key={label} className="glass-panel p-4 rounded border border-outline-variant flex flex-col gap-1">
            <div className="font-mono-sm text-[10px] text-on-surface-variant uppercase tracking-wider">{label}</div>
            <div className="font-headline-md text-headline-md text-primary mt-1">
              {!account ? '—' : value ?? '—'}
            </div>
            <div className="font-mono-sm text-[10px] text-on-surface-variant">{note}</div>
          </div>
        ))}
      </div>

      {!account && (
        <div className="glass-panel rounded border border-outline-variant p-4 text-center font-mono-sm text-mono-sm text-on-surface-variant">
          Connect wallet to view your activity
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-gutter flex-1 min-h-0">

        {/* My fills table */}
        <div className="flex-1 glass-panel rounded border border-outline-variant flex flex-col overflow-hidden">
          <div className="px-6 py-3 border-b border-outline-variant bg-surface-container-low/50 flex items-center justify-between">
            <h3 className="font-mono-sm text-mono-sm text-on-surface-variant uppercase tracking-wider">My Settlement Fills</h3>
            <span className="font-mono-sm text-[10px] text-on-surface-variant">{sortedFills.length} receipts</span>
          </div>
          {!account ? (
            <div className="flex-1 flex items-center justify-center text-on-surface-variant font-mono-sm text-[11px]">
              Connect wallet
            </div>
          ) : sortedFills.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-on-surface-variant gap-2">
              <span className="material-symbols-outlined text-[28px] opacity-20">receipt_long</span>
              <span className="font-mono-sm text-[11px]">No fills yet</span>
            </div>
          ) : (
            <div className="overflow-auto flex-1">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-surface-container-lowest/90 backdrop-blur border-b border-outline-variant">
                  <tr>
                    <th className="font-mono-sm text-[10px] text-on-surface-variant py-2 px-6 font-normal">PRICE ({QUOTE_SYMBOL})</th>
                    <th className="font-mono-sm text-[10px] text-on-surface-variant py-2 px-6 font-normal">SIZE (SUI)</th>
                    <th className="font-mono-sm text-[10px] text-on-surface-variant py-2 px-6 font-normal">FEE ({QUOTE_SYMBOL})</th>
                    <th className="font-mono-sm text-[10px] text-on-surface-variant py-2 px-6 font-normal">COUNTERPARTY</th>
                    <th className="font-mono-sm text-[10px] text-on-surface-variant py-2 px-6 font-normal text-right">RECEIPT</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedFills.map((r) => (
                    <tr key={r.objectId} className="border-b border-outline-variant/30 hover:bg-surface-container-high/30 transition-colors">
                      <td className="py-2 px-6 font-mono-data text-[11px] text-primary">
                        {formatScaled(r.fields.filled_price, 6)}
                      </td>
                      <td className="py-2 px-6 font-mono-data text-[11px]">
                        {formatScaled(r.fields.filled_size, 9)}
                      </td>
                      <td className="py-2 px-6 font-mono-data text-[11px] text-outline-variant">
                        {formatScaled((
                          (BigInt(r.fields.filled_size) * BigInt(r.fields.filled_price)) / BigInt(1_000_000_000) * BigInt(10) / BigInt(10_000)
                        ).toString(), 6)}
                      </td>
                      <td className="py-2 px-6 font-mono-data text-[11px] text-on-surface-variant">
                        {truncateAddr(r.fields.counterparty)}
                      </td>
                      <td className="py-2 px-6 text-right">
                        <a
                          href={EXPLORER_OBJ(r.objectId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono-sm text-[10px] text-secondary hover:text-primary transition-colors"
                        >
                          {truncateAddr(r.objectId)}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right sidebar: active orders + protocol stats */}
        <div className="w-full lg:w-64 flex flex-col gap-gutter flex-shrink-0 min-h-0">
          {/* My active orders */}
          <div className="glass-panel rounded border border-outline-variant flex flex-col overflow-hidden flex-1">
            <div className="px-4 py-3 border-b border-outline-variant bg-surface-container-low/50">
              <h3 className="font-mono-sm text-mono-sm text-on-surface-variant uppercase tracking-wider">My Open Orders</h3>
            </div>
            {!account ? (
              <div className="flex-1 flex items-center justify-center text-on-surface-variant font-mono-sm text-[11px]">Connect wallet</div>
            ) : !myOrders || myOrders.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-on-surface-variant font-mono-sm text-[11px]">No open orders</div>
            ) : (
              <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
                {myOrders.map((o) => (
                  <a
                    key={o.orderId}
                    href={EXPLORER_OBJ(o.orderId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex justify-between font-mono-sm text-[10px] text-on-surface-variant hover:text-primary transition-colors"
                  >
                    <span>{truncateAddr(o.orderId)}</span>
                    <span>ep {o.expiryEpoch}</span>
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Protocol stats (secondary) */}
          <div className="glass-panel rounded border border-outline-variant p-4 flex-shrink-0">
            <div className="font-mono-sm text-[10px] text-on-surface-variant uppercase tracking-wider mb-3">Protocol (last 50)</div>
            <div className="space-y-2">
              {[
                { label: 'Orders', value: protoOrders?.data.length },
                { label: 'IOIs',   value: protoIois?.data.length },
                { label: 'Matches',value: protoMatches?.data.length },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between font-mono-sm text-[11px]">
                  <span className="text-on-surface-variant">{label}</span>
                  <span className="text-on-surface">{value ?? '—'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
