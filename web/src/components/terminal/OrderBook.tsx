'use client';

import { useSuiClient, useCurrentAccount } from '@mysten/dapp-kit';
import { useQuery } from '@tanstack/react-query';
import { deepbook } from '@mysten/deepbook-v3';
import { DEEPBOOK_POOL_KEY, QUOTE_SYMBOL } from '@/lib/sui';

interface PriceLevel {
  price: string;
  quantity: string;
}

interface OrderBookData {
  bids: PriceLevel[];
  asks: PriceLevel[];
}

export default function OrderBook() {
  const suiClient = useSuiClient();
  const account = useCurrentAccount();

  const { data, isLoading, error } = useQuery({
    queryKey: ['deepbook-orderbook', account?.address],
    enabled: !!account?.address,
    queryFn: async (): Promise<OrderBookData> => {
      const dbClient = (suiClient as any).$extend
        ? (suiClient as any).$extend(deepbook({ address: account!.address }))
        : (suiClient as any).extend(deepbook({ address: account!.address }));

      const toLevels = (r: { prices: number[]; quantities: number[] } | undefined): PriceLevel[] => {
        if (!r?.prices) return [];
        return r.prices.map((p, i) => ({
          price: String(p),
          quantity: String(r.quantities[i] ?? 0),
        }));
      };

      const safeFetch = async (isBid: boolean) => {
        try {
          return await dbClient.deepbook.getLevel2Range(DEEPBOOK_POOL_KEY, 0, 10000, isBid);
        } catch {
          return { prices: [], quantities: [] };
        }
      };
      const [bidsRaw, asksRaw] = await Promise.all([safeFetch(true), safeFetch(false)]);
      return {
        bids: toLevels(bidsRaw).slice(0, 10),
        asks: toLevels(asksRaw).slice(0, 10),
      };
    },
    refetchInterval: 5000,
  });

  if (!account) {
    return (
      <div className="glass-panel rounded-lg p-4 flex flex-col flex-1 items-center justify-center">
        <span className="material-symbols-outlined text-on-surface-variant opacity-50">account_balance_wallet</span>
        <span className="text-[11px] text-on-surface-variant mt-2 text-center">Connect wallet to view order book.</span>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="glass-panel rounded-lg p-4 flex flex-col flex-1 items-center justify-center">
        <span className="material-symbols-outlined animate-spin text-primary">sync</span>
        <span className="text-[11px] text-on-surface-variant mt-2">Loading Order Book...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="glass-panel rounded-lg p-4 flex flex-col flex-1 items-center justify-center">
        <span className="material-symbols-outlined text-error opacity-50">error</span>
        <span className="text-[11px] text-on-surface-variant mt-2 text-center">
          Failed to load DeepBook data.<br/>
          Check testnet connectivity.
        </span>
      </div>
    );
  }

  // Calculate mid price
  const bestBid = data.bids?.[0]?.price;
  const bestAsk = data.asks?.[0]?.price;
  const midPrice = bestBid && bestAsk ? (parseFloat(bestBid) + parseFloat(bestAsk)) / 2 : null;

  return (
    <div className="glass-panel rounded-lg p-4 flex flex-col flex-1">
      <div className="flex justify-between items-center mb-2 pb-2 border-b border-[#1E293B]">
        <h2 className="font-headline-md text-[14px] text-on-surface uppercase tracking-wider">DeepBook Reference</h2>
        <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">LIVE</span>
      </div>
      
      <div className="flex-1 overflow-auto flex flex-col text-[11px] font-mono-data text-on-surface-variant min-h-[200px]">
        {/* Asks (Sells) - Sorted descending so highest is at top */}
        <div className="flex flex-col-reverse">
          {(data.asks ?? []).map((level, i) => {
            const size = parseFloat(level.quantity);
            const maxSize = Math.max(...(data.asks ?? []).map(l => parseFloat(l.quantity)), 1);
            const width = (size / maxSize) * 100;
            
            return (
              <div key={`ask-${i}`} className="flex justify-between py-1 px-1 hover:bg-surface-container-low relative group">
                <div 
                  className="absolute right-0 top-0 bottom-0 bg-error-container/10 z-0 transition-all" 
                  style={{ width: `${width}%` }}
                ></div>
                <span className="text-error relative z-10 font-bold">{parseFloat(level.price).toFixed(4)}</span>
                <span className="relative z-10 text-on-surface/70">{size.toFixed(2)}</span>
              </div>
            );
          })}
        </div>
        
        {/* Mid Price */}
        <div className="my-2 py-1 text-center font-bold text-on-surface border-y border-[#1E293B] bg-surface-container-low/30">
          {midPrice ? `${midPrice.toFixed(4)} ${QUOTE_SYMBOL}` : '---'}
        </div>
        
        {/* Bids (Buys) */}
        <div className="flex flex-col">
          {(data.bids ?? []).map((level, i) => {
            const size = parseFloat(level.quantity);
            const maxSize = Math.max(...(data.bids ?? []).map(l => parseFloat(l.quantity)), 1);
            const width = (size / maxSize) * 100;
            
            return (
              <div key={`bid-${i}`} className="flex justify-between py-1 px-1 hover:bg-surface-container-low relative group">
                <div 
                  className="absolute right-0 top-0 bottom-0 bg-primary-container/10 z-0 transition-all" 
                  style={{ width: `${width}%` }}
                ></div>
                <span className="text-primary relative z-10 font-bold">{parseFloat(level.price).toFixed(4)}</span>
                <span className="relative z-10 text-on-surface/70">{size.toFixed(2)}</span>
              </div>
            );
          })}
        </div>
      </div>
      
      <div className="mt-2 pt-2 border-t border-[#1E293B] flex justify-between text-[9px] text-outline-variant uppercase">
        <span>Price ({QUOTE_SYMBOL})</span>
        <span>Size (SUI)</span>
      </div>
    </div>
  );
}
