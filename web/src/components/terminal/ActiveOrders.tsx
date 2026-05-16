'use client';

import { useState, useEffect } from 'react';
import { useCurrentAccount, useSuiClient, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { SHELL_PACKAGE_ID, QUOTE_SYMBOL } from '@/lib/sui';
import { getActiveOrders, cancelOrderTx } from '@/lib/shell-sdk';
import type { SubmittedOrder } from './SealedOrderForm';
import { useQuery } from '@tanstack/react-query';

interface Props {
  orders: SubmittedOrder[];
}

function truncateHash(hash: string, chars = 6): string {
  if (hash.length <= chars * 2 + 2) return hash;
  return `${hash.slice(0, chars)}...${hash.slice(-chars)}`;
}

function timeAgo(ts: number, now: number): string {
  const diff = Math.floor((now - ts) / 1000);
  if (diff < 0) return 'Just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function ActiveOrders({ orders: sessionOrders }: Props) {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  const [now, setNow] = useState(Date.now());
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  const { data: currentEpoch } = useQuery({
    queryKey: ['current-epoch'],
    queryFn: async () => {
      const state = await suiClient.getLatestSuiSystemState();
      return Number(state.epoch);
    },
    refetchInterval: 30_000,
  });

  const { data: onChainOrders, isLoading } = useQuery({
    queryKey: ['active-commitments', account?.address],
    queryFn: () =>
      getActiveOrders(suiClient, {
        shellPackageId: SHELL_PACKAGE_ID,
        trader: account!.address,
      }),
    enabled: !!account,
    refetchInterval: 10_000,
  });

  // Side, size, limit price are encrypted on-chain — only known for orders
  // submitted this session. A refresh wipes them until decrypt flow ships.
  const mergedOrders = (onChainOrders || []).map((oc) => {
    const local = sessionOrders.find((s) => s.orderId === oc.orderId);
    return {
      ...oc,
      side: local?.side as 'buy' | 'sell' | undefined,
      size: local?.size,
      limitPrice: local?.limitPrice,
      backupKey: local?.backupKey || '',
      isLocal: !!local,
    };
  });

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  async function handleCancel(orderId: string, collateralType: string) {
    if (!account) return;
    try {
      const tx = cancelOrderTx({
        shellPackageId: SHELL_PACKAGE_ID,
        collateralType,
        orderId,
        recipient: account.address,
      });
      await signAndExecute({ transaction: tx });
    } catch (e) {
      console.error('Failed to cancel order:', e);
      alert('Cancel failed: Order might not be expired yet or already matched.');
    }
  }

  function toggleKey(id: string) {
    setShowKeys(prev => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="glass-panel rounded-lg p-4 flex flex-col h-full">
      <div className="flex justify-between items-center mb-4 pb-2 border-b border-[#1E293B]">
        <div className="flex items-center gap-2">
          <h2 className="font-headline-md text-[18px] text-on-surface">Active Orders</h2>
          <span className="text-[10px] text-on-surface-variant bg-surface-container px-1.5 py-0.5 rounded border border-outline-variant">LIVE CHAIN</span>
        </div>
        <div className="flex items-center gap-2">
          {isLoading && <span className="material-symbols-outlined text-[14px] animate-spin text-primary">sync</span>}
          {mergedOrders.length > 0 && (
            <span className="font-mono-sm text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
              {mergedOrders.length} live
            </span>
          )}
        </div>
      </div>
      <div className="overflow-auto flex-1 w-full">
        {mergedOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-on-surface-variant font-mono-sm text-mono-sm gap-2 py-12">
            <span className="material-symbols-outlined text-[32px] opacity-30">shield</span>
            <span>No active orders found on-chain</span>
            <span className="text-[10px] text-outline-variant">Your orders will appear here after submission</span>
          </div>
        ) : (
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="font-mono-sm text-[11px] text-on-surface-variant uppercase tracking-wider border-b border-[#1E293B]">
                <th className="pb-2 font-normal">Fingerprint</th>
                <th className="pb-2 font-normal">Side</th>
                <th className="pb-2 font-normal text-right">Size</th>
                <th className="pb-2 font-normal text-right">Price</th>
                <th className="pb-2 font-normal text-right">Expiry</th>
                <th className="pb-2 font-normal text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="font-mono-data text-mono-data text-on-surface">
              {mergedOrders.map((order) => (
                <tr key={order.orderId} className="border-b border-[#1E293B]/50 hover:bg-surface-container-low transition-colors group">
                  <td className="py-3">
                    <div className="flex flex-col">
                      <span className="text-secondary" title={order.commitHash}>
                        {truncateHash(order.commitHash)}
                      </span>
                      {showKeys[order.orderId] && order.backupKey && (
                        <span className="text-[9px] text-primary/70 break-all max-w-[120px]">
                          Key: {truncateHash(order.backupKey, 12)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className={`py-3 ${order.side === 'buy' ? 'text-primary' : order.side === 'sell' ? 'text-error' : 'text-on-surface-variant'}`}>
                    {order.side ? order.side.toUpperCase() : (
                      <span className="text-[10px] italic">SEALED</span>
                    )}
                  </td>
                  <td className="py-3 text-right">
                    {order.size ? (
                      `${order.size} SUI`
                    ) : (
                      <span className="text-[10px] text-on-surface-variant italic">ENCRYPTED</span>
                    )}
                  </td>
                  <td className="py-3 text-right">
                    {order.limitPrice ? (
                      `${order.limitPrice} ${QUOTE_SYMBOL}`
                    ) : (
                      <span className="text-[10px] text-on-surface-variant italic">ENCRYPTED</span>
                    )}
                  </td>
                  <td className="py-3 text-right">
                    {(() => {
                      const epochsLeft = currentEpoch !== undefined ? order.expiryEpoch - currentEpoch : null;
                      if (epochsLeft === null) return <span className="text-[10px] text-outline-variant">—</span>;
                      if (epochsLeft <= 0) return (
                        <span className="text-[10px] text-error font-bold uppercase tracking-wider">EXPIRED</span>
                      );
                      const days = Math.floor(epochsLeft);
                      return (
                        <div className="flex flex-col items-end">
                          <span className="text-[11px] text-on-surface-variant">Ep {order.expiryEpoch}</span>
                          <span className="text-[10px] text-outline-variant">~{days}d left</span>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {order.backupKey && (
                        <button
                          onClick={() => toggleKey(order.orderId)}
                          className="text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
                          title="View Recovery Key"
                        >
                          <span className="material-symbols-outlined text-[18px]">key</span>
                        </button>
                      )}
                      {(() => {
                        const expired = currentEpoch !== undefined && order.expiryEpoch <= currentEpoch;
                        return (
                          <button
                            onClick={() => handleCancel(order.orderId, order.collateralType)}
                            className={`transition-colors cursor-pointer ${expired ? 'text-error animate-pulse' : 'text-on-surface-variant hover:text-error'}`}
                            title={expired ? 'Cancel & Reclaim Collateral' : 'Cancel (available after expiry)'}
                          >
                            <span className="material-symbols-outlined text-[18px]">cancel</span>
                          </button>
                        );
                      })()}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
