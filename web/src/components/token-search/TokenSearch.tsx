'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSuiClient } from '@mysten/dapp-kit';
import { TRADING_PAIRS, getCoinMetadata, type TradingPair, QUOTE_COIN_TYPE } from '@/lib/sui';

interface ApiPair {
  symbol: string;
  baseCoinType: string;
  baseDecimals: number;
  quoteCoinType: string;
  quoteDecimals: number;
  priceSource: 'deepbook' | 'pyth' | 'fixed';
  deepbookPoolKey?: string;
  pythFeedId?: string;
  fixedPrice?: number;
  enabled?: boolean;
  disabledReason?: string;
}

function apiToTradingPair(p: ApiPair): TradingPair {
  const baseSymbol = p.symbol.split('/')[0] ?? p.baseCoinType.split('::').pop() ?? '?';
  const quoteSymbol = p.symbol.split('/')[1] ?? p.quoteCoinType.split('::').pop() ?? '?';
  return {
    enabled: p.enabled ?? true,
    disabledReason: p.disabledReason,
    baseSymbol,
    baseCoinType: p.baseCoinType,
    baseDecimals: p.baseDecimals,
    quoteSymbol,
    quoteCoinType: p.quoteCoinType,
    quoteDecimals: p.quoteDecimals,
    deepbookPoolKey: p.deepbookPoolKey ?? null,
    priceSource: p.priceSource,
    pythFeedId: p.pythFeedId,
    fixedPrice: p.fixedPrice,
  };
}

function isCoinType(s: string): boolean {
  // Match "0x<hex>::module::TYPE"
  return /^0x[a-fA-F0-9]+::[a-zA-Z_]\w*::[a-zA-Z_]\w*$/.test(s.trim());
}

interface Props {
  value: TradingPair;
  onChange: (p: TradingPair) => void;
  label?: string;
}

export default function TokenSearch({ value, onChange, label = 'Pair' }: Props) {
  const suiClient = useSuiClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const { data: apiPairs = [], isLoading } = useQuery({
    queryKey: ['api-pairs'],
    queryFn: async (): Promise<ApiPair[]> => {
      const r = await fetch('/api/pairs');
      if (!r.ok) return [];
      return (await r.json()) as ApiPair[];
    },
    staleTime: 5 * 60_000,
  });

  const allPairs: TradingPair[] = useMemo(() => {
    const merged: TradingPair[] = [];
    const seen = new Set<string>();
    for (const p of TRADING_PAIRS) {
      if (seen.has(p.baseCoinType)) continue;
      seen.add(p.baseCoinType);
      merged.push(p);
    }
    for (const ap of apiPairs) {
      const tp = apiToTradingPair(ap);
      if (seen.has(tp.baseCoinType)) continue;
      seen.add(tp.baseCoinType);
      merged.push(tp);
    }
    // Enabled pairs first, disabled previews after.
    return merged.sort((a, b) => Number(b.enabled) - Number(a.enabled));
  }, [apiPairs]);

  // Paste-coin-type resolution via on-chain CoinMetadata.
  const pasted = isCoinType(query) ? query.trim() : null;
  const { data: pastedMeta } = useQuery({
    queryKey: ['coin-metadata', pasted],
    enabled: !!pasted,
    queryFn: () => (pasted ? getCoinMetadata(suiClient, pasted) : Promise.resolve(null)),
    staleTime: 5 * 60_000,
  });

  const filtered: TradingPair[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allPairs;
    if (pasted) {
      // Show the pasted token as a virtual entry — no price source unless it matches a registered pair.
      const existing = allPairs.find((p) => p.baseCoinType.toLowerCase() === pasted.toLowerCase());
      if (existing) return [existing];
      if (pastedMeta) {
        return [
          {
            enabled: false,
            disabledReason: 'No price source (DeepBook or Pyth) — cannot match',
            baseSymbol: pastedMeta.symbol,
            baseCoinType: pasted,
            baseDecimals: pastedMeta.decimals,
            quoteSymbol: 'USDC',
            quoteCoinType: QUOTE_COIN_TYPE,
            quoteDecimals: 6,
            deepbookPoolKey: null,
            priceSource: 'fixed',
            iconUrl: pastedMeta.iconUrl ?? undefined,
          },
        ];
      }
      return [];
    }
    return allPairs.filter(
      (p) =>
        p.baseSymbol.toLowerCase().includes(q) ||
        p.quoteSymbol.toLowerCase().includes(q) ||
        (p.label ?? '').toLowerCase().includes(q) ||
        p.baseCoinType.toLowerCase().includes(q),
    );
  }, [allPairs, query, pasted, pastedMeta]);

  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <div className="relative" ref={wrapRef}>
      <label className="block font-mono-sm text-mono-sm text-on-surface-variant mb-1">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded p-2 bg-surface-container-high border border-outline-variant text-on-surface font-mono-sm text-mono-sm focus:outline-none focus:border-primary cursor-pointer flex items-center justify-between"
      >
        <span>{value.baseSymbol}/{value.quoteSymbol}{value.label && value.label !== value.baseSymbol ? ` — ${value.label}` : ''}</span>
        <span className="text-on-surface-variant">▾</span>
      </button>

      {open && (
        <div
          className="absolute z-30 mt-1 w-full border border-outline-variant rounded shadow-lg max-h-80 overflow-auto"
          style={{ backgroundColor: '#1e2024', backdropFilter: 'none' }}
        >
          <div
            className="p-2 border-b border-outline-variant sticky top-0"
            style={{ backgroundColor: '#1e2024', backdropFilter: 'none' }}
          >
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search token name or address"
              className="w-full rounded p-2 border border-outline-variant text-on-surface font-mono-sm text-mono-sm focus:outline-none focus:border-primary"
              style={{ backgroundColor: '#282a2e', backdropFilter: 'none' }}
            />
          </div>
          {isLoading && <div className="p-3 text-mono-sm text-on-surface-variant">Loading…</div>}
          {!isLoading && filtered.length === 0 && (
            <div className="p-3 text-mono-sm text-on-surface-variant">No match.</div>
          )}
          <ul>
            {filtered.map((p) => {
              const disabled = !p.enabled;
              return (
                <li key={p.baseCoinType}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (disabled) return;
                      onChange(p);
                      setOpen(false);
                      setQuery('');
                    }}
                    className={`w-full text-left p-2 border-b border-outline-variant ${
                      disabled
                        ? 'opacity-50 cursor-not-allowed pointer-events-none'
                        : 'cursor-pointer hover:bg-surface-container-high'
                    }`}
                  >
                    <span className="font-mono-sm text-mono-sm text-on-surface">
                      {p.baseSymbol}/{p.quoteSymbol}{p.label && p.label !== p.baseSymbol ? ` — ${p.label}` : ''}
                    </span>
                    {disabled && p.disabledReason && (
                      <span className="block font-mono-sm text-[10px] text-error mt-0.5">{p.disabledReason}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
