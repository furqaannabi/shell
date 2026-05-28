'use client';

import { useState, useEffect } from 'react';
import { useCurrentAccount, useSuiClient, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { SHELL_PACKAGE_ID, QUOTE_SYMBOL, TRADING_PAIRS, NETWORK } from '@/lib/sui';
import { getActiveOrders, cancelOrderTx, getReceipts } from '@/lib/shell-sdk';
import type { SubmittedOrder } from './SealedOrderForm';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { friendlyError } from '@/lib/errors';

interface Props {
  orders: SubmittedOrder[];
}

function symbolFor(coinType: string): string {
  for (const p of TRADING_PAIRS) {
    if (p.baseCoinType === coinType) return p.baseSymbol;
    if (p.quoteCoinType === coinType) return p.quoteSymbol;
  }
  return coinType.split('::').pop() ?? '?';
}

function truncateHash(hash: string, chars = 6): string {
  if (hash.length <= chars * 2 + 2) return hash;
  return `${hash.slice(0, chars)}...${hash.slice(-chars)}`;
}

function timeAgo(ts: number, now: number): string {
  const s = Math.floor((now - ts) / 1000);
  if (s < 0) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3_600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3_600)}h ago`;
  if (s < 604_800) return `${Math.floor(s / 86_400)}d ago`;
  if (s < 2_592_000) return `${Math.floor(s / 604_800)}w ago`;
  if (s < 31_536_000) return `${Math.floor(s / 2_592_000)}mo ago`;
  return `${Math.floor(s / 31_536_000)}y ago`;
}

export default function ActiveOrders({ orders: sessionOrders }: Props) {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  const queryClient = useQueryClient();
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
    refetchInterval: 5_000,
  });

  const { data: receipts } = useQuery({
    queryKey: ['user-receipts-active', account?.address],
    queryFn: () => getReceipts(suiClient, { shellPackageId: SHELL_PACKAGE_ID, owner: account!.address }),
    enabled: !!account,
    refetchInterval: 10_000,
  });

  // Side, size, limit price are encrypted on-chain — only known for orders
  // submitted this session. A refresh wipes them until decrypt flow ships.
  const onChainIds = new Set((onChainOrders ?? []).map(o => o.orderId));

  const mergedOrders = (onChainOrders || []).map((oc) => {
    const local = sessionOrders.find((s) => s.orderId === oc.orderId);
    const baseSymbol = local?.baseSymbol ?? symbolFor(oc.collateralType);
    return {
      ...oc,
      side: local?.side as 'buy' | 'sell' | undefined,
      size: local?.size,
      limitPrice: local?.limitPrice,
      backupKey: local?.backupKey || '',
      isLocal: !!local,
      baseSymbol,
      status: 'active' as 'active' | 'settled' | 'matched' | 'expired',
      receiptId: undefined as string | undefined,
    };
  });

  // Session orders that disappeared from chain — find their settlement receipt.
  const settledRows = sessionOrders
    .filter(o => o.orderId && !onChainIds.has(o.orderId))
    .map((o) => {
      const baseDecimals = TRADING_PAIRS.find(p => p.baseCoinType === o.baseCoinType)?.baseDecimals ?? 9;
      const sizeRaw = BigInt(Math.round(parseFloat(o.size || '0') * 10 ** baseDecimals));
      const receipt = receipts?.find(r =>
        BigInt(r.fields.filled_size) === sizeRaw &&
        Number(r.objectId) > 0  // valid objectId
      ) ?? receipts?.find(r => BigInt(r.fields.filled_size) === sizeRaw);
      const expired = currentEpoch !== undefined && (o as { expiryEpoch?: number }).expiryEpoch !== undefined
        ? (o as unknown as { expiryEpoch: number }).expiryEpoch <= currentEpoch
        : false;
      const status = receipt ? 'settled' : expired ? 'expired' : 'matched';
      return {
        orderId: o.orderId ?? '',
        collateralType: '',
        expiryEpoch: (o as unknown as { expiryEpoch?: number }).expiryEpoch ?? 0,
        submittedAtMs: o.timestamp,
        side: o.side as 'buy' | 'sell' | undefined,
        size: o.size,
        limitPrice: o.limitPrice,
        backupKey: o.backupKey,
        isLocal: true,
        baseSymbol: o.baseSymbol,
        status: status as 'active' | 'settled' | 'matched' | 'expired',
        receiptId: receipt?.objectId,
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
      const res = await signAndExecute({ transaction: tx });
      await suiClient.waitForTransaction({ digest: res.digest });
      queryClient.invalidateQueries({ queryKey: ['active-commitments', account.address] });
    } catch (e) {
      console.error('Failed to cancel order:', e);
      toast.error(friendlyError(e, 'Cancel failed — please try again'));
    }
  }

  function toggleKey(id: string) {
    setShowKeys(prev => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="glass-panel rounded-lg border border-outline-variant p-4 flex flex-col h-full">
      <div className="flex justify-between items-center mb-4 pb-2 border-b border-[#1E293B]">
        <div className="flex items-center gap-2">
          <h2 className="font-headline-md text-[18px] text-on-surface">Orders</h2>
          <span className="text-[10px] text-on-surface-variant bg-surface-container px-1.5 py-0.5 rounded border border-outline-variant">LIVE CHAIN</span>
        </div>
        <div className="flex items-center gap-2">
          {isLoading && <span className="material-symbols-outlined text-[14px] animate-spin text-primary">sync</span>}
          {(() => {
            const liveCount = mergedOrders.filter(o =>
              currentEpoch === undefined || o.expiryEpoch > currentEpoch
            ).length;
            return liveCount > 0 ? (
              <span className="font-mono-sm text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                {liveCount} live
              </span>
            ) : null;
          })()}
        </div>
      </div>
      <div className="overflow-auto flex-1 w-full max-h-[55vh] lg:max-h-none">
        {mergedOrders.length === 0 && settledRows.length === 0 ? (
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
                <tr key={order.orderId} className="border-b border-[#1E293B]/50 hover:bg-surface-container-low transition-colors">
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
                    {order.side ? order.side.toUpperCase() : <span className="text-[10px] italic">SEALED</span>}
                  </td>
                  <td className="py-3 text-right">
                    {order.size
                      ? <span>{order.size} <span className="text-on-surface-variant text-[10px]">{order.baseSymbol}</span></span>
                      : <span className="text-[10px] text-on-surface-variant italic">ENCRYPTED</span>}
                  </td>
                  <td className="py-3 text-right">
                    {order.limitPrice
                      ? `${order.limitPrice} ${QUOTE_SYMBOL}`
                      : <span className="text-[10px] text-on-surface-variant italic">ENCRYPTED</span>}
                  </td>
                  <td className="py-3 text-right">
                    {(() => {
                      const epochsLeft = currentEpoch !== undefined ? order.expiryEpoch - currentEpoch : null;
                      if (epochsLeft === null) return <span className="text-[10px] text-outline-variant">—</span>;
                      if (epochsLeft <= 0) return <span className="text-[10px] text-error font-bold uppercase">EXPIRED</span>;
                      return (
                        <span className="text-[9px] text-secondary/70 uppercase tracking-wider animate-pulse">
                          awaiting match
                        </span>
                      );
                    })()}
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {order.backupKey && (
                        <button onClick={() => toggleKey(order.orderId)} className="text-on-surface-variant hover:text-primary transition-colors cursor-pointer" title="View Recovery Key">
                          <span className="material-symbols-outlined text-[18px]">key</span>
                        </button>
                      )}
                      {(() => {
                        const expired = currentEpoch !== undefined && order.expiryEpoch <= currentEpoch;
                        return expired ? (
                          <button onClick={() => handleCancel(order.orderId, order.collateralType)} className="text-error animate-pulse transition-colors cursor-pointer" title="Cancel & Reclaim Collateral">
                            <span className="material-symbols-outlined text-[18px]">cancel</span>
                          </button>
                        ) : (
                          <span className="text-outline-variant opacity-30 cursor-not-allowed" title="Cancel only available after expiry">
                            <span className="material-symbols-outlined text-[18px]">cancel</span>
                          </span>
                        );
                      })()}
                    </div>
                  </td>
                </tr>
              ))}
              {settledRows.map((order) => (
                <tr key={`settled-${order.orderId}`} className="border-b border-[#1E293B]/30 opacity-60">
                  <td className="py-3">
                    <span className="text-on-surface-variant text-[11px]">{truncateHash(order.orderId)}</span>
                  </td>
                  <td className={`py-3 ${order.side === 'buy' ? 'text-primary' : order.side === 'sell' ? 'text-error' : 'text-on-surface-variant'}`}>
                    {order.side ? order.side.toUpperCase() : <span className="text-[10px] italic">—</span>}
                  </td>
                  <td className="py-3 text-right">
                    {order.size
                      ? <span>{order.size} <span className="text-on-surface-variant text-[10px]">{order.baseSymbol}</span></span>
                      : <span className="text-[10px] text-on-surface-variant italic">—</span>}
                  </td>
                  <td className="py-3 text-right">
                    {order.limitPrice ? `${order.limitPrice} ${QUOTE_SYMBOL}` : <span className="text-[10px] text-on-surface-variant italic">—</span>}
                  </td>
                  <td className="py-3 text-right">
                    {order.status === 'settled' && order.receiptId ? (
                      <a href={`https://suiscan.xyz/${NETWORK}/object/${order.receiptId}`} target="_blank" rel="noopener noreferrer"
                        className="text-emerald-300 border border-emerald-500/60 bg-emerald-500/15 px-2 py-0.5 rounded text-[10px] hover:bg-emerald-500/25 transition-colors">
                        SETTLED ↗
                      </a>
                    ) : order.status === 'matched' ? (
                      <span className="text-[10px] text-[#57F1DB] border border-[#57F1DB]/30 bg-[#57F1DB]/10 px-2 py-0.5 rounded animate-pulse">MATCHED</span>
                    ) : (
                      <span className="text-[10px] text-on-surface-variant border border-outline-variant px-2 py-0.5 rounded opacity-50">EXPIRED</span>
                    )}
                  </td>
                  <td className="py-3 text-right">
                    <span className="text-outline-variant opacity-20">
                      <span className="material-symbols-outlined text-[18px]">cancel</span>
                    </span>
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
