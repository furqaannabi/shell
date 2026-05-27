'use client';

import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit';
import { useQuery } from '@tanstack/react-query';
import { getActiveOrders, getReceipts } from '@/lib/shell-sdk';
import {
  SHELL_PACKAGE_ID,
  QUOTE_COIN_TYPE,
  BASE_COIN_TYPE,
  NETWORK,
  QUOTE_SYMBOL,
} from '@/lib/sui';

function formatScaled(raw: string, decimals: number): string {
  const n = BigInt(raw);
  const scale = BigInt(10 ** decimals);
  const whole = n / scale;
  const frac = n % scale;
  if (frac === BigInt(0)) return whole.toString();
  return `${whole}.${frac.toString().padStart(decimals, '0').replace(/0+$/, '')}`;
}

function truncateAddr(addr: string, chars = 4): string {
  if (addr.length <= chars * 2 + 2) return addr;
  return `${addr.slice(0, chars + 2)}...${addr.slice(-chars)}`;
}

export default function PortfolioPage() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();

  const { data: balances, isLoading: balLoading } = useQuery({
    queryKey: ['wallet-balances', account?.address],
    queryFn: async () => {
      const all = await suiClient.getAllBalances({ owner: account!.address });
      const sui = all.find((b) => b.coinType === BASE_COIN_TYPE);
      const usdc = all.find((b) => b.coinType === QUOTE_COIN_TYPE);
      return {
        sui: sui?.totalBalance ?? '0',
        usdc: usdc?.totalBalance ?? '0',
      };
    },
    enabled: !!account,
    refetchInterval: 10_000,
  });

  const { data: orders } = useQuery({
    queryKey: ['active-orders-portfolio', account?.address],
    queryFn: async (): Promise<Array<{ orderId: string; collateralType: string; expiryEpoch: number; submittedAtMs: number; collateralValue: bigint }>> => {
      const list = await getActiveOrders(suiClient, {
        shellPackageId: SHELL_PACKAGE_ID,
        trader: account!.address,
      });
      if (list.length === 0) return [];
      const enriched = await suiClient.multiGetObjects({
        ids: list.map((o) => o.orderId),
        options: { showContent: true },
      });
      return list.map((o) => {
        const obj = enriched.find((x) => x.data?.objectId === o.orderId);
        const fields = obj?.data?.content?.dataType === 'moveObject'
          ? (obj.data.content.fields as { collateral?: string })
          : {};
        return { ...o, collateralValue: BigInt(fields.collateral ?? '0') };
      });
    },
    enabled: !!account,
    refetchInterval: 10_000,
  });

  const { data: receipts } = useQuery({
    queryKey: ['receipts-portfolio', account?.address],
    queryFn: () =>
      getReceipts(suiClient, {
        shellPackageId: SHELL_PACKAGE_ID,
        owner: account!.address,
      }),
    enabled: !!account,
    refetchInterval: 10_000,
  });

  const recentFills = receipts
    ? [...receipts].sort((a, b) => b.objectId.localeCompare(a.objectId)).slice(0, 5)
    : [];

  return (
    <div className="flex flex-col lg:flex-row gap-gutter w-full h-full overflow-y-auto lg:overflow-hidden pb-8 lg:pb-0 pr-2 lg:pr-0">
      {/* Left Column */}
      <div className="flex-1 flex flex-col gap-gutter">
        {/* Header */}
        <div className="glass-panel p-4 rounded border border-outline-variant flex items-center justify-between">
          <div>
            <h1 className="font-headline-md text-body-base text-on-surface font-medium">Portfolio</h1>
            <p className="font-mono-sm text-mono-sm text-on-surface-variant mt-0.5">
              {account ? truncateAddr(account.address, 6) : 'Connect wallet to view balances'}
            </p>
          </div>
          {balLoading && (
            <span className="material-symbols-outlined text-on-surface-variant text-[18px] animate-spin">sync</span>
          )}
        </div>

        {/* Balance Table */}
        <div className="glass-panel rounded border border-outline-variant flex flex-col overflow-hidden flex-1">
          <div className="px-6 py-4 border-b border-outline-variant bg-surface-container-low/50">
            <h3 className="font-mono-sm text-mono-sm text-on-surface-variant uppercase tracking-wider">Wallet Balances</h3>
          </div>

          {!account ? (
            <div className="flex-1 flex items-center justify-center text-on-surface-variant font-mono-sm text-mono-sm">
              Connect wallet to view
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-left">
                <thead className="bg-surface-container-lowest/90 border-b border-outline-variant">
                  <tr>
                    <th className="font-mono-sm text-mono-sm text-on-surface-variant py-3 px-6 font-normal">ASSET</th>
                    <th className="font-mono-sm text-mono-sm text-on-surface-variant py-3 px-6 font-normal text-right">BALANCE</th>
                    <th className="font-mono-sm text-mono-sm text-on-surface-variant py-3 px-6 font-normal text-right">LOCKED IN ORDERS</th>
                  </tr>
                </thead>
                <tbody className="font-mono-data text-mono-data">
                  {/* SUI row */}
                  <tr className="border-b border-outline-variant/30 hover:bg-surface-container-high/30 transition-colors">
                    <td className="py-4 px-6 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#3872E0]/20 flex items-center justify-center text-[#3872E0] border border-[#3872E0]/50">
                        <span className="material-symbols-outlined text-[16px]">water_drop</span>
                      </div>
                      <div>
                        <div className="font-medium text-surface-tint">SUI</div>
                        <div className="font-mono-sm text-mono-sm text-on-surface-variant">Sui Network</div>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      {balances ? formatScaled(balances.sui, 9) : '—'}
                    </td>
                    <td className="py-4 px-6 text-right text-on-surface-variant">
                      {orders
                        ? (() => {
                            const locked = orders
                              .filter((o) => o.collateralType === BASE_COIN_TYPE)
                              .reduce((sum, o) => sum + (o.collateralValue ?? BigInt(0)), BigInt(0));
                            return locked > BigInt(0) ? formatScaled(locked.toString(), 9) + ' SUI' : '—';
                          })()
                        : '—'}
                    </td>
                  </tr>

                  {/* USDC row */}
                  <tr className="border-b border-outline-variant/30 hover:bg-surface-container-high/30 transition-colors">
                    <td className="py-4 px-6 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#2775CA]/20 flex items-center justify-center text-[#2775CA] border border-[#2775CA]/50">
                        <span className="material-symbols-outlined text-[16px]">currency_exchange</span>
                      </div>
                      <div>
                        <div className="font-medium text-surface-tint">{QUOTE_SYMBOL}</div>
                        <div className="font-mono-sm text-mono-sm text-on-surface-variant">USD Coin</div>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      {balances ? formatScaled(balances.usdc, 6) : '—'}
                    </td>
                    <td className="py-4 px-6 text-right text-on-surface-variant">
                      {orders
                        ? (() => {
                            const locked = orders
                              .filter((o) => o.collateralType === QUOTE_COIN_TYPE)
                              .reduce((sum, o) => sum + (o.collateralValue ?? BigInt(0)), BigInt(0));
                            return locked > BigInt(0) ? formatScaled(locked.toString(), 6) + ` ${QUOTE_SYMBOL}` : '—';
                          })()
                        : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Right Sidebar */}
      <div className="w-full lg:w-80 flex flex-col gap-gutter flex-shrink-0">
        {/* Active Orders */}
        <div className="glass-panel rounded border border-outline-variant p-4">
          <div className="flex items-center justify-between mb-3 border-b border-outline-variant pb-2">
            <h3 className="font-body-sm text-body-sm text-on-surface font-medium">Active Orders</h3>
            <span className="font-mono-sm text-mono-sm text-primary">{orders?.length ?? '—'}</span>
          </div>
          {!account ? (
            <p className="font-mono-sm text-mono-sm text-on-surface-variant text-center py-4">Connect wallet</p>
          ) : orders && orders.length > 0 ? (
            <div className="flex flex-col gap-2">
              {orders.slice(0, 4).map((o) => (
                <a
                  key={o.orderId}
                  href={`https://suiscan.xyz/${NETWORK}/object/${o.orderId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex justify-between font-mono-sm text-[10px] text-on-surface-variant hover:text-primary transition-colors"
                >
                  <span>{truncateAddr(o.orderId)}</span>
                  <span className="text-on-surface">epoch {o.expiryEpoch}</span>
                </a>
              ))}
              {orders.length > 4 && (
                <p className="font-mono-sm text-[10px] text-on-surface-variant text-center">
                  +{orders.length - 4} more
                </p>
              )}
            </div>
          ) : (
            <p className="font-mono-sm text-mono-sm text-on-surface-variant text-center py-4 text-[11px]">
              No active orders
            </p>
          )}
        </div>

        {/* Recent Fills */}
        <div className="glass-panel rounded border border-outline-variant p-4 flex-1">
          <div className="flex items-center justify-between mb-3 border-b border-outline-variant pb-2">
            <h3 className="font-body-sm text-body-sm text-on-surface font-medium">Recent Fills</h3>
            <span className="material-symbols-outlined text-on-surface-variant text-[16px]">receipt_long</span>
          </div>
          {!account ? (
            <p className="font-mono-sm text-mono-sm text-on-surface-variant text-center py-4">Connect wallet</p>
          ) : recentFills.length > 0 ? (
            <div className="flex flex-col gap-2">
              {recentFills.map((r) => (
                <a
                  key={r.objectId}
                  href={`https://suiscan.xyz/${NETWORK}/object/${r.objectId}`}
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
            <div className="flex flex-col items-center justify-center py-8 text-on-surface-variant gap-1">
              <span className="material-symbols-outlined text-[24px] opacity-20">receipt_long</span>
              <span className="font-mono-sm text-[11px]">No fills yet</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
