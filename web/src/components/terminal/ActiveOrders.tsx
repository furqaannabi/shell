'use client';

import type { SubmittedOrder } from './SealedOrderForm';

interface Props {
  orders: SubmittedOrder[];
}

/** Truncate a hex string for display */
function truncateHash(hash: string, chars = 8): string {
  if (hash.length <= chars * 2 + 2) return hash;
  return `${hash.slice(0, chars)}...${hash.slice(-chars)}`;
}

/** Relative time since timestamp */
function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function ActiveOrders({ orders }: Props) {
  return (
    <div className="glass-panel rounded-lg p-4 flex flex-col h-full">
      <div className="flex justify-between items-center mb-4 pb-2 border-b border-[#1E293B]">
        <h2 className="font-headline-md text-[18px] text-on-surface">Active Orders</h2>
        <div className="flex items-center gap-2">
          {orders.length > 0 && (
            <span className="font-mono-sm text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
              {orders.length} live
            </span>
          )}
          <button className="text-on-surface-variant hover:text-primary transition-colors cursor-pointer">
            <span className="material-symbols-outlined text-[20px]">filter_list</span>
          </button>
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
          <table className="w-full text-left border-collapse min-w-[500px]">
            <thead>
              <tr className="font-mono-sm text-[11px] text-on-surface-variant uppercase tracking-wider border-b border-[#1E293B]">
                <th className="pb-2 font-normal">Fingerprint</th>
                <th className="pb-2 font-normal">Side</th>
                <th className="pb-2 font-normal text-right">Size</th>
                <th className="pb-2 font-normal text-right">Status</th>
                <th className="pb-2 font-normal text-right">Submitted</th>
              </tr>
            </thead>
            <tbody className="font-mono-data text-mono-data text-on-surface">
              {orders.map((order, i) => (
                <tr key={order.digest || i} className="border-b border-transparent hover:bg-surface-container-low transition-colors group">
                  <td className="py-3">
                    <span className="text-secondary" title={order.commitHash}>
                      {truncateHash(order.commitHash)}
                    </span>
                  </td>
                  <td className={`py-3 ${order.side === 'buy' ? 'text-primary' : 'text-error'}`}>
                    {order.side.toUpperCase()}
                  </td>
                  <td className="py-3 text-right">{order.size}</td>
                  <td className="py-3 text-right flex items-center justify-end gap-1">
                    <span className="material-symbols-outlined text-[14px] text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>shield</span>
                    <span className="text-secondary text-[12px]">Sealed</span>
                  </td>
                  <td className="py-3 text-right text-on-surface-variant text-[12px]">
                    {timeAgo(order.timestamp)}
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
