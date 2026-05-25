'use client';

import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit';
import { useQuery } from '@tanstack/react-query';
import { getReceipts } from '@/lib/shell-sdk';
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
const EXPLORER_TX = (id: string) => `https://suiscan.xyz/${NETWORK}/tx/${id}`;

export default function AnalyticsPage() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();

  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ['analytics-orders'],
    queryFn: () =>
      suiClient.queryEvents({
        query: { MoveEventType: `${SHELL_PACKAGE_ID}::pool::OrderSubmitted` },
        limit: 50,
        order: 'descending',
      }),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const { data: iois } = useQuery({
    queryKey: ['analytics-iois'],
    queryFn: () =>
      suiClient.queryEvents({
        query: { MoveEventType: `${SHELL_PACKAGE_ID_IOI_TYPES}::ioi::IoisPosted` },
        limit: 50,
        order: 'descending',
      }),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const { data: matches } = useQuery({
    queryKey: ['analytics-matches'],
    queryFn: () =>
      suiClient.queryEvents({
        query: { MoveEventType: `${SHELL_PACKAGE_ID_IOI_TYPES}::ioi::MatchProposed` },
        limit: 50,
        order: 'descending',
      }),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const { data: myFills } = useQuery({
    queryKey: ['analytics-fills', account?.address],
    queryFn: () =>
      getReceipts(suiClient, {
        shellPackageId: SHELL_PACKAGE_ID,
        owner: account!.address,
      }),
    enabled: !!account,
    refetchInterval: 15_000,
  });

  const recentOrders = orders?.data ?? [];
  const recentFills = myFills
    ? [...myFills].sort((a, b) => b.objectId.localeCompare(a.objectId)).slice(0, 5)
    : [];

  return (
    <div className="flex flex-col gap-gutter w-full h-full overflow-hidden">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-gutter">
        <div className="glass-panel p-5 rounded border border-outline-variant flex flex-col gap-1">
          <div className="font-mono-sm text-mono-sm text-on-surface-variant uppercase tracking-wider">Sealed Orders</div>
          <div className="font-headline-md text-headline-md text-primary mt-1">
            {ordersLoading ? '—' : (orders?.data.length ?? '—')}
          </div>
          <div className="font-mono-sm text-[10px] text-on-surface-variant">latest 50 events</div>
        </div>
        <div className="glass-panel p-5 rounded border border-outline-variant flex flex-col gap-1">
          <div className="font-mono-sm text-mono-sm text-on-surface-variant uppercase tracking-wider">IOIs Posted</div>
          <div className="font-headline-md text-headline-md text-secondary mt-1">
            {iois?.data.length ?? '—'}
          </div>
          <div className="font-mono-sm text-[10px] text-on-surface-variant">latest 50 events</div>
        </div>
        <div className="glass-panel p-5 rounded border border-outline-variant flex flex-col gap-1">
          <div className="font-mono-sm text-mono-sm text-on-surface-variant uppercase tracking-wider">Matches Proposed</div>
          <div className="font-headline-md text-headline-md text-primary mt-1">
            {matches?.data.length ?? '—'}
          </div>
          <div className="font-mono-sm text-[10px] text-on-surface-variant">latest 50 events</div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-gutter flex-1 min-h-0">
        {/* Recent Orders Feed */}
        <div className="flex-1 glass-panel rounded border border-outline-variant flex flex-col overflow-hidden">
          <div className="px-6 py-4 border-b border-outline-variant bg-surface-container-low/50 flex items-center justify-between">
            <h3 className="font-mono-sm text-mono-sm text-on-surface-variant uppercase tracking-wider">Recent Sealed Orders</h3>
            {ordersLoading && (
              <span className="material-symbols-outlined text-[14px] text-on-surface-variant animate-spin">sync</span>
            )}
          </div>

          {recentOrders.length === 0 && !ordersLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center text-on-surface-variant gap-2 py-12">
              <span className="material-symbols-outlined text-[32px] opacity-20">receipt_long</span>
              <span className="font-mono-sm text-[11px]">No orders yet</span>
            </div>
          ) : (
            <div className="overflow-auto flex-1">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-surface-container-lowest/90 backdrop-blur border-b border-outline-variant">
                  <tr>
                    <th className="font-mono-sm text-mono-sm text-on-surface-variant py-3 px-6 font-normal">TRADER</th>
                    <th className="font-mono-sm text-mono-sm text-on-surface-variant py-3 px-6 font-normal">ORDER ID</th>
                    <th className="font-mono-sm text-mono-sm text-on-surface-variant py-3 px-6 font-normal text-right">EXPIRES</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((evt) => {
                    const fields = evt.parsedJson as { order_id?: string; trader?: string; expiry_epoch?: string } | null;
                    return (
                      <tr key={`${evt.id.txDigest}-${evt.id.eventSeq}`} className="border-b border-outline-variant/30 hover:bg-surface-container-high/30 transition-colors">
                        <td className="py-3 px-6 font-mono-data text-[11px]">
                          {fields?.trader ? (
                            <a
                              href={`https://suiscan.xyz/${NETWORK}/account/${fields.trader}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-secondary hover:text-primary transition-colors"
                            >
                              {truncateAddr(fields.trader)}
                            </a>
                          ) : '—'}
                        </td>
                        <td className="py-3 px-6 font-mono-data text-[11px]">
                          {fields?.order_id ? (
                            <a
                              href={EXPLORER_OBJ(fields.order_id)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-secondary hover:text-primary transition-colors"
                            >
                              {truncateAddr(fields.order_id)}
                            </a>
                          ) : (
                            <a
                              href={EXPLORER_TX(evt.id.txDigest)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-outline-variant hover:text-primary transition-colors"
                            >
                              {truncateAddr(evt.id.txDigest)}
                            </a>
                          )}
                        </td>
                        <td className="py-3 px-6 font-mono-data text-[11px] text-on-surface-variant text-right">
                          epoch {fields?.expiry_epoch ?? '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* My Fills Sidebar */}
        <div className="w-full lg:w-72 glass-panel rounded border border-outline-variant flex flex-col flex-shrink-0">
          <div className="px-4 py-3 border-b border-outline-variant bg-surface-container-low/50">
            <h3 className="font-mono-sm text-mono-sm text-on-surface-variant uppercase tracking-wider">My Fills</h3>
          </div>
          {!account ? (
            <div className="flex-1 flex flex-col items-center justify-center text-on-surface-variant gap-2 py-10">
              <span className="material-symbols-outlined text-[24px] opacity-20">account_balance_wallet</span>
              <span className="font-mono-sm text-[11px]">Connect wallet to view</span>
            </div>
          ) : recentFills.length > 0 ? (
            <div className="flex flex-col gap-2 p-3 flex-1 overflow-y-auto">
              {recentFills.map((r) => (
                <a
                  key={r.objectId}
                  href={EXPLORER_OBJ(r.objectId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 border border-outline-variant/30 rounded hover:border-secondary/50 transition-colors"
                >
                  <div className="flex justify-between font-mono-data text-[11px]">
                    <span className="text-primary">FILLED</span>
                    <span className="text-on-surface">
                      {formatScaled(r.fields.filled_price, 6)} {QUOTE_SYMBOL}
                    </span>
                  </div>
                  <div className="flex justify-between font-mono-sm text-[10px] text-on-surface-variant mt-1">
                    <span>{formatScaled(r.fields.filled_size, 9)} SUI</span>
                    <span>CP: {truncateAddr(r.fields.counterparty)}</span>
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-on-surface-variant gap-2 py-10">
              <span className="material-symbols-outlined text-[24px] opacity-20">receipt_long</span>
              <span className="font-mono-sm text-[11px]">No fills yet</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
