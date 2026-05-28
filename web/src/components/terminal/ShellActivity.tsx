'use client';

import { useQuery } from '@tanstack/react-query';
import { useSuiClient } from '@mysten/dapp-kit';
import {
  SHELL_PACKAGE_ID,
  SHELL_PACKAGE_ID_IOI_TYPES,
  DEEPBOOK_INDEXER_URL,
  DEEPBOOK_POOL_KEY,
  QUOTE_SYMBOL,
  NETWORK,
} from '@/lib/sui';

// 24 buckets × 5 min = last 2 hours shown in a 4×6 grid
const BUCKETS = 24;
const BUCKET_MS = 5 * 60_000;

interface Bucket {
  order: number;
  ioi: number;
  match: number;
  total: number;
}

export default function ShellActivity() {
  const suiClient = useSuiClient();

  const { data: midPrice } = useQuery({
    queryKey: ['deepbook-mid', NETWORK, DEEPBOOK_POOL_KEY],
    queryFn: async (): Promise<number | null> => {
      try {
        const res = await fetch(`${DEEPBOOK_INDEXER_URL}/orderbook/${DEEPBOOK_POOL_KEY}?level=2&depth=2`);
        if (!res.ok) return null;
        const j = await res.json() as { bids?: [string, string][]; asks?: [string, string][] };
        const bid = parseFloat(j.bids?.[0]?.[0] ?? '0');
        const ask = parseFloat(j.asks?.[0]?.[0] ?? '0');
        return bid > 0 && ask > 0 ? (bid + ask) / 2 : null;
      } catch { return null; }
    },
    refetchInterval: 15_000,
  });

  const { data } = useQuery({
    queryKey: ['shell-activity-heat'],
    queryFn: async () => {
      const [orders, iois, matches] = await Promise.all([
        suiClient.queryEvents({ query: { MoveEventType: `${SHELL_PACKAGE_ID}::pool::OrderSubmitted` }, limit: 50, order: 'descending' }),
        suiClient.queryEvents({ query: { MoveEventType: `${SHELL_PACKAGE_ID_IOI_TYPES}::ioi::IoisPosted` }, limit: 50, order: 'descending' }),
        suiClient.queryEvents({ query: { MoveEventType: `${SHELL_PACKAGE_ID_IOI_TYPES}::ioi::MatchProposed` }, limit: 50, order: 'descending' }),
      ]);

      const now = Date.now();
      const buckets: Bucket[] = Array.from({ length: BUCKETS }, () => ({ order: 0, ioi: 0, match: 0, total: 0 }));

      const place = (tsMs: number, key: 'order' | 'ioi' | 'match') => {
        const age = now - tsMs;
        const idx = Math.floor(age / BUCKET_MS);
        if (idx >= 0 && idx < BUCKETS) {
          buckets[idx][key]++;
          buckets[idx].total++;
        }
      };

      orders.data.forEach(ev => place(Number(ev.timestampMs ?? 0), 'order'));
      iois.data.forEach(ev => place(Number(ev.timestampMs ?? 0), 'ioi'));
      matches.data.forEach(ev => place(Number(ev.timestampMs ?? 0), 'match'));

      const totals = {
        order: orders.data.length,
        ioi: iois.data.length,
        match: matches.data.length,
      };

      return { buckets, totals };
    },
    refetchInterval: 10_000,
  });

  const maxTotal = Math.max(...(data?.buckets.map(b => b.total) ?? [1]), 1);

  // dominant type → teal for match, primary for order, secondary for ioi
  function cellColor(b: Bucket): string {
    if (b.total === 0) return 'bg-surface-container-high opacity-30';
    const intensity = Math.max(0.15, b.total / maxTotal);
    if (b.match >= b.order && b.match >= b.ioi) return `bg-[#57F1DB]`;
    if (b.order >= b.ioi) return `bg-primary`;
    return `bg-secondary`;
  }

  function cellOpacity(b: Bucket): number {
    if (b.total === 0) return 0.12;
    return 0.2 + (b.total / maxTotal) * 0.8;
  }

  // buckets[0] = most recent → show newest on right
  const reversed = [...(data?.buckets ?? Array.from({ length: BUCKETS }, () => ({ order: 0, ioi: 0, match: 0, total: 0 })))].reverse();

  return (
    <div className="glass-panel rounded-lg p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="font-headline-md text-[13px] text-on-surface uppercase tracking-wider">Shell Activity</h2>
        {midPrice != null
          ? <span className="font-mono-data text-[11px]">ref <span className="text-primary font-bold">{midPrice.toFixed(4)}</span> <span className="text-on-surface-variant">{QUOTE_SYMBOL}</span></span>
          : <span className="text-[10px] text-on-surface-variant">ref —</span>}
      </div>

      {/* Stat chips */}
      <div className="flex gap-2">
        {([
          { label: 'ORDER', val: data?.totals.order ?? 0, cls: 'text-primary border-primary/30 bg-primary/10' },
          { label: 'IOI',   val: data?.totals.ioi   ?? 0, cls: 'text-secondary border-secondary/30 bg-secondary/10' },
          { label: 'MATCH', val: data?.totals.match  ?? 0, cls: 'text-[#57F1DB] border-[#57F1DB]/30 bg-[#57F1DB]/10' },
        ] as const).map(({ label, val, cls }) => (
          <span key={label} className={`font-mono-sm text-[10px] border px-2 py-0.5 rounded ${cls}`}>
            {label} <span className="font-bold">{val}</span>
          </span>
        ))}
      </div>

      {/* Heatmap grid: 4 rows × 6 cols = 24 buckets */}
      <div className="grid grid-cols-6 gap-1">
        {Array.from({ length: 4 }).map((_, row) =>
          reversed.slice(row * 6, row * 6 + 6).map((b, col) => {
            const idx = row * 6 + col;
            const title = b.total > 0
              ? `${b.total} event(s): ${b.order} order, ${b.ioi} IOI, ${b.match} match`
              : 'No activity';
            return (
              <div
                key={idx}
                title={title}
                className={`h-4 rounded-sm ${cellColor(b)}`}
                style={{ opacity: cellOpacity(b) }}
              />
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-between text-[9px] text-on-surface-variant/50 uppercase">
        <span>2 h · 5 min buckets · dark pool</span>
        <span>older ← → now</span>
      </div>
    </div>
  );
}
