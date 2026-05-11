'use client';

import { useState, useEffect } from 'react';
import { useCurrentAccount, useSuiClient, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { SHELL_PACKAGE_ID, COLLATERAL_TYPE } from '@/lib/sui';
import type { SubmittedOrder } from './SealedOrderForm';

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

export default function ActiveOrders({ orders }: Props) {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  
  const [now, setNow] = useState(Date.now());
  const [orderStatus, setOrderStatus] = useState<Record<string, 'live' | 'settled' | 'checking'>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  // Timer for relative timestamps
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Poll for on-chain existence of orders
  useEffect(() => {
    if (!account || orders.length === 0) return;

    const checkStatus = async () => {
      const liveOrders = orders.filter(o => o.orderId && orderStatus[o.orderId] !== 'settled');
      if (liveOrders.length === 0) return;

      const newStatus = { ...orderStatus };
      for (const order of liveOrders) {
        try {
          // Check if the OrderCommitment object still exists
          const obj = await suiClient.getObject({ id: order.orderId!, options: { showType: true } });
          newStatus[order.orderId!] = obj.error ? 'settled' : 'live';
        } catch (e) {
          newStatus[order.orderId!] = 'settled'; // If error, likely gone/matched
        }
      }
      setOrderStatus(newStatus);
    };

    const interval = setInterval(checkStatus, 10000); // Poll every 10s
    checkStatus();
    return () => clearInterval(interval);
  }, [account, orders, suiClient]);

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
      setOrderStatus(prev => ({ ...prev, [orderId]: 'settled' }));
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
          <span className="text-[10px] text-on-surface-variant bg-surface-container px-1.5 py-0.5 rounded border border-outline-variant">OBSERVE</span>
        </div>
        <div className="flex items-center gap-2">
          {orders.length > 0 && (
            <span className="font-mono-sm text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
              {orders.filter(o => orderStatus[o.orderId!] !== 'settled').length} live
            </span>
          )}
        </div>
      </div>
      <div className="overflow-auto flex-1 w-full">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-on-surface-variant font-mono-sm text-mono-sm gap-2 py-12">
            <span className="material-symbols-outlined text-[32px] opacity-30">shield</span>
            <span>No active orders</span>
            <span className="text-[10px] text-outline-variant">Submit a sealed order to get started</span>
          </div>
        ) : (
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="font-mono-sm text-[11px] text-on-surface-variant uppercase tracking-wider border-b border-[#1E293B]">
                <th className="pb-2 font-normal">Fingerprint</th>
                <th className="pb-2 font-normal">Side</th>
                <th className="pb-2 font-normal text-right">Size</th>
                <th className="pb-2 font-normal text-right">Status</th>
                <th className="pb-2 font-normal text-right">Submitted</th>
                <th className="pb-2 font-normal text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="font-mono-data text-mono-data text-on-surface">
              {orders.map((order, i) => {
                const status = orderStatus[order.orderId!] || 'live';
                const isSettled = status === 'settled';

                return (
                  <tr key={order.digest || i} className={`border-b border-[#1E293B]/50 hover:bg-surface-container-low transition-colors group ${isSettled ? 'opacity-50' : ''}`}>
                    <td className="py-3">
                      <div className="flex flex-col">
                        <span className="text-secondary" title={order.commitHash}>
                          {truncateHash(order.commitHash)}
                        </span>
                        {showKeys[order.orderId!] && (
                          <span className="text-[9px] text-primary/70 break-all max-w-[120px]">
                            Key: {truncateHash(order.backupKey, 12)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={`py-3 ${order.side === 'buy' ? 'text-primary' : 'text-error'}`}>
                      {order.side.toUpperCase()}
                    </td>
                    <td className="py-3 text-right">{order.size} SUI</td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isSettled ? (
                          <>
                            <span className="material-symbols-outlined text-[14px] text-primary">check_circle</span>
                            <span className="text-primary text-[11px]">Matched</span>
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined text-[14px] text-secondary animate-pulse" style={{ fontVariationSettings: "'FILL' 1" }}>shield</span>
                            <span className="text-secondary text-[11px]">Sealed</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="py-3 text-right text-on-surface-variant text-[11px]">
                      {timeAgo(order.timestamp, now)}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => toggleKey(order.orderId!)}
                          className="text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
                          title="View Recovery Key"
                        >
                          <span className="material-symbols-outlined text-[18px]">key</span>
                        </button>
                        {!isSettled && (
                          <button 
                            onClick={() => handleCancel(order.orderId!)}
                            className="text-on-surface-variant hover:text-error transition-colors cursor-pointer"
                            title="Cancel Order"
                          >
                            <span className="material-symbols-outlined text-[18px]">cancel</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
