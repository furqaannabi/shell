'use client';

import { useQuery } from '@tanstack/react-query';
import { DEEPBOOK_INDEXER_URL, DEEPBOOK_POOL_KEY, QUOTE_SYMBOL, NETWORK } from '@/lib/sui';

const DEPTH = 10;

interface PriceLevel {
  price: string;
  quantity: string;
}

interface IndexerResp {
  bids: [string, string][];
  asks: [string, string][];
  timestamp: string;
}

interface OrderBookData {
  bids: PriceLevel[];
  asks: PriceLevel[];
}

export default function OrderBook() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['deepbook-indexer', NETWORK, DEEPBOOK_POOL_KEY],
    queryFn: async (): Promise<OrderBookData> => {
      const res = await fetch(`${DEEPBOOK_INDEXER_URL}/orderbook/${DEEPBOOK_POOL_KEY}?level=2&depth=${DEPTH * 2}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j: IndexerResp = await res.json();
      const toLevels = (rows: [string, string][]): PriceLevel[] =>
        rows.slice(0, DEPTH).map(([price, quantity]) => ({ price, quantity }));
      return { bids: toLevels(j.bids ?? []), asks: toLevels(j.asks ?? []) };
    },
    refetchInterval: 5000,
  });

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
          Failed to load DeepBook data.
        </span>
      </div>
    );
  }

  const bestBid = data.bids[0]?.price;
  const bestAsk = data.asks[0]?.price;
  const midPrice =
    bestBid && bestAsk ? (parseFloat(bestBid) + parseFloat(bestAsk)) / 2 : null;

  const maxAskSize = Math.max(...data.asks.map(l => parseFloat(l.quantity)), 1);
  const maxBidSize = Math.max(...data.bids.map(l => parseFloat(l.quantity)), 1);

  return (
    <div className="glass-panel rounded-lg p-4 flex flex-col flex-1">
      <div className="flex justify-between items-center mb-1 pb-2 border-b border-[#1E293B]">
        <h2 className="font-headline-md text-[14px] text-on-surface uppercase tracking-wider">Price Reference</h2>
        <span
          className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20"
          title={`DeepBook ${NETWORK} reference data`}
        >
          {NETWORK.toUpperCase()}
        </span>
      </div>
      <p className="text-[9px] text-outline-variant mb-2">SUI/USDC reference book · indicative prices only</p>

      <div className="flex-1 overflow-auto flex flex-col text-[11px] font-mono-data text-on-surface-variant min-h-[200px]">
        <div className="flex flex-col-reverse">
          {data.asks.map((level, i) => {
            const size = parseFloat(level.quantity);
            const width = (size / maxAskSize) * 100;
            return (
              <div key={`ask-${i}`} className="flex justify-between py-1 px-1 hover:bg-surface-container-low relative group">
                <div className="absolute right-0 top-0 bottom-0 bg-error-container/10 z-0 transition-all" style={{ width: `${width}%` }} />
                <span className="text-error relative z-10 font-bold">{parseFloat(level.price).toFixed(4)}</span>
                <span className="relative z-10 text-on-surface/70">{size.toFixed(2)}</span>
              </div>
            );
          })}
        </div>

        <div className="my-2 py-1 text-center font-bold text-on-surface border-y border-[#1E293B] bg-surface-container-low/30">
          {midPrice ? `${midPrice.toFixed(4)} ${QUOTE_SYMBOL}` : '---'}
        </div>

        <div className="flex flex-col">
          {data.bids.map((level, i) => {
            const size = parseFloat(level.quantity);
            const width = (size / maxBidSize) * 100;
            return (
              <div key={`bid-${i}`} className="flex justify-between py-1 px-1 hover:bg-surface-container-low relative group">
                <div className="absolute right-0 top-0 bottom-0 bg-primary-container/10 z-0 transition-all" style={{ width: `${width}%` }} />
                <span className="text-primary relative z-10 font-bold">{parseFloat(level.price).toFixed(4)}</span>
                <span className="relative z-10 text-on-surface/70">{size.toFixed(2)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-2 pt-2 border-t border-[#1E293B] text-white flex justify-between text-[9px] text-outline-variant uppercase">
        <span>Price ({QUOTE_SYMBOL})</span>
        <span>Size (SUI)</span>
      </div>
    </div>
  );
}
