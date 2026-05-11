'use client';

import { useState, useEffect } from 'react';
import { useCurrentAccount, useSuiClient, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { SHELL_PACKAGE_ID, COLLATERAL_TYPE } from '@/lib/sui';
import type { SubmittedOrder } from './SealedOrderForm';
import { useQuery } from '@tanstack/react-query';

interface Props {
  orders: SubmittedOrder[];
}

/** Truncate a hex string for display */
function truncateHash(hash: string, chars = 6): string {
  if (hash.length <= chars * 2 + 2) return hash;
  return `${hash.slice(0, chars)}...${hash.slice(-chars)}`;
}

/** Relative time since timestamp */
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

  // ── 1. Fetch live OrderCommitment objects from the chain ────────────────
  const { data: onChainOrders, isLoading } = useQuery({
    queryKey: ['active-commitments', account?.address],
    queryFn: async () => {
      if (!account) return [];
      const res = await suiClient.getOwnedObjects({
        owner: account.address,
        filter: { StructType: `${SHELL_PACKAGE_ID}::pool::OrderCommitment` },
        options: { showContent: true },
      });

      return res.data.map(obj => {
        const fields = (obj.data!.content as any).fields;
        return {
          orderId: obj.data!.objectId,
          commitHash: Array.from(fields.commit_hash as number[]).map(b => b.toString(16).padStart(2, '0')).join(''),
          side: fields.side === 0 ? 'buy' : 'sell', // assuming enum mapping
          timestamp: Number(fields.expiry_epoch), // placeholder for sorting
        };
      });
    },
    enabled: !!account,
    refetchInterval: 10_000,
  });

  // ── 2. Merge on-chain reality with local session metadata ────────────────
  const mergedOrders = (onChainOrders || []).map(oc => {
    const local = sessionOrders.find(s => s.orderId === oc.orderId);
    return {
      ...oc,
      size: local?.size || '?',
      limitPrice: local?.limitPrice || '?',
      backupKey: local?.backupKey || '',
      isLocal: !!local,
    };
  });

  // Timer for relative timestamps
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  async function handleCancel(orderId: string) {
    if (!account) return;
    try {
      const tx = new Transaction();
      const [coin] = tx.moveCall({
        target: `${SHELL_PACKAGE_ID}::pool::cancel_expired`,
        typeArguments: [COLLATERAL_TYPE],
        arguments: [tx.object(orderId)],
      });
      tx.transferObjects([coin], account.address);
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
                <th className="pb-2 font-normal text-right">Status</th>
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
                  <td className={`py-3 ${order.side === 'buy' ? 'text-primary' : 'text-error'}`}>
                    {order.side.toUpperCase()}
                  </td>
                  <td className="py-3 text-right">
                    {order.size === '?' ? (
                      <span className="text-[10px] text-on-surface-variant italic">ENCRYPTED</span>
                    ) : (
                      `${order.size} SUI`
                    )}
                  </td>
                  <td className="py-3 text-right">
                    {order.limitPrice === '?' ? (
                      <span className="text-[10px] text-on-surface-variant italic">ENCRYPTED</span>
                    ) : (
                      `${order.limitPrice} USDC`
                    )}
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <span className="material-symbols-outlined text-[14px] text-secondary animate-pulse" style={{ fontVariationSettings: "'FILL' 1" }}>shield</span>
                      <span className="text-secondary text-[11px]">Sealed</span>
                    </div>
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
                      <button 
                        onClick={() => handleCancel(order.orderId)}
                        className="text-on-surface-variant hover:text-error transition-colors cursor-pointer"
                        title="Cancel Order"
                      >
                        <span className="material-symbols-outlined text-[18px]">cancel</span>
                      </button>
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
