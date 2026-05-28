'use client';

import { useState } from 'react';
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from '@mysten/dapp-kit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Transaction } from '@mysten/sui/transactions';
import { encryptIoi } from '@/lib/ioi';
import { putBlob } from '@/lib/walrus';
import { friendlyError } from '@/lib/errors';
import {
  DEEPBOOK_INDEXER_URL,
  SHELL_PACKAGE_ID,
  SHELL_PACKAGE_ID_LATEST,
  getSealClient,
  TRADING_PAIRS,
  DEFAULT_PAIR,
  type TradingPair,
} from '@/lib/sui';

interface MidPrice {
  bid: number;
  ask: number;
  mid: number;
}

async function fetchMidPrice(pair: TradingPair): Promise<MidPrice | null> {
  if (pair.priceSource === 'fixed' && pair.fixedPrice != null) {
    return { bid: pair.fixedPrice, ask: pair.fixedPrice, mid: pair.fixedPrice };
  }
  try {
    const res = await fetch(
      `${DEEPBOOK_INDEXER_URL}/orderbook/${pair.deepbookPoolKey}?level=2&depth=2`,
    );
    if (!res.ok) return null;
    const j = (await res.json()) as {
      bids: [string, string][];
      asks: [string, string][];
    };
    const bid = parseFloat(j.bids[0]?.[0] ?? '0');
    const ask = parseFloat(j.asks[0]?.[0] ?? '0');
    if (!bid || !ask) return null;
    return { bid, ask, mid: (bid + ask) / 2 };
  } catch {
    return null;
  }
}

export default function IOIForm() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const queryClient = useQueryClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  const [pair, setPair] = useState<TradingPair>(DEFAULT_PAIR);
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [sizeLo, setSizeLo] = useState('');
  const [sizeHi, setSizeHi] = useState('');
  const [priceLo, setPriceLo] = useState('');
  const [priceHi, setPriceHi] = useState('');
  const [ttlMin, setTtlMin] = useState('30');

  const { data: market } = useQuery({
    queryKey: ['deepbook-mid', pair.baseCoinType],
    queryFn: () => fetchMidPrice(pair),
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  async function applyMarketRange() {
    let m = market;
    if (!m) m = await fetchMidPrice(pair);
    if (!m) {
      setError('Reference price unavailable');
      return;
    }
    const lo = side === 'buy' ? m.mid * 0.99 : m.mid * 0.98;
    const hi = side === 'buy' ? m.mid * 1.02 : m.mid * 1.01;
    setPriceLo(lo.toFixed(3));
    setPriceHi(hi.toFixed(3));
    if (!sizeLo) setSizeLo('1');
    if (!sizeHi) setSizeHi('10');
  }
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!account) {
      setError('Connect wallet first');
      return;
    }
    setError(null);
    setStatus(null);
    setSubmitting(true);

    try {
      // Parse inputs to base units.
      // Size = base raw (pair.baseDecimals). Price = 1e6-scaled quote_per_base.
      const baseScale = 10 ** pair.baseDecimals;
      const sizeLoBase = BigInt(Math.round(parseFloat(sizeLo) * baseScale));
      const sizeHiBase = BigInt(Math.round(parseFloat(sizeHi) * baseScale));
      const priceLoBase = BigInt(Math.round(parseFloat(priceLo) * 1_000_000));
      const priceHiBase = BigInt(Math.round(parseFloat(priceHi) * 1_000_000));
      if (sizeLoBase > sizeHiBase || priceLoBase > priceHiBase) {
        throw new Error('lo must be <= hi for size and price');
      }
      const expiryMs =
        BigInt(Date.now()) + BigInt(parseInt(ttlMin, 10) * 60_000);

      // Encrypt under the Shell enclave identity.
      setStatus('Encrypting…');
      const seal = getSealClient(suiClient);
      const envelope = await encryptIoi(seal, SHELL_PACKAGE_ID, {
        side,
        asset: pair.baseCoinType,
        sizeLo: sizeLoBase,
        sizeHi: sizeHiBase,
        priceLo: priceLoBase,
        priceHi: priceHiBase,
        expiryMs,
      });

      // Upload to Walrus.
      setStatus('Uploading to Walrus…');
      const blobId = await putBlob(envelope, 2);

      // On-chain pointer so the enclave's poller picks it up.
      setStatus('Submitting on-chain pointer…');
      const { epoch } = await suiClient.getLatestSuiSystemState();
      const expiryEpoch = BigInt(epoch) + BigInt(7);

      const tx = new Transaction();
      tx.moveCall({
        target: `${SHELL_PACKAGE_ID_LATEST}::ioi::record_ioi`,
        arguments: [
          tx.pure.vector('u8', Array.from(new TextEncoder().encode(blobId))),
          tx.pure.u64(expiryEpoch),
        ],
      });

      const res = await signAndExecute({ transaction: tx });
      await suiClient.waitForTransaction({ digest: res.digest });

      setStatus(`IOI posted — blob ${blobId.slice(0, 8)}…`);
      queryClient.invalidateQueries({ queryKey: ['iois-posted'] });
      setSizeLo('');
      setSizeHi('');
      setPriceLo('');
      setPriceHi('');
    } catch (err) {
      setError(friendlyError(err, 'IOI submission failed'));
      setStatus(null);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="glass-panel rounded border border-outline-variant p-4">
      <div className="flex justify-between items-center mb-4 border-b border-outline-variant pb-2">
        <h2 className="font-body-base text-on-surface font-medium">
          Post an IOI
        </h2>
        {account && (
          <span className="font-mono-sm text-[10px] text-primary border border-primary/30 px-2 py-0.5 rounded bg-primary/10">
            SEAL → WALRUS
          </span>
        )}
      </div>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        {/* Pair selector */}
        <div>
          <label className="block font-mono-sm text-mono-sm text-on-surface-variant mb-1">Pair</label>
          <select
            className="w-full rounded p-2 bg-surface-container-high border border-outline-variant text-on-surface font-mono-sm text-mono-sm focus:outline-none focus:border-primary cursor-pointer"
            value={pair.baseCoinType}
            onChange={(e) => {
              const p = TRADING_PAIRS.find((t) => t.baseCoinType === e.target.value && t.enabled);
              if (p) { setPair(p); setSizeLo(''); setSizeHi(''); setPriceLo(''); setPriceHi(''); }
            }}
          >
            {TRADING_PAIRS.map((p) => (
              <option key={p.baseCoinType} value={p.baseCoinType} disabled={!p.enabled}>
                {p.baseSymbol}/{p.quoteSymbol}{p.label ? ` — ${p.label}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setSide('buy')}
            className={`py-2 rounded font-mono-sm text-mono-sm border transition-colors cursor-pointer ${
              side === 'buy'
                ? 'bg-primary/20 border-primary text-primary'
                : 'bg-surface-container-high border-outline-variant text-on-surface hover:border-primary'
            }`}
          >
            Buy
          </button>
          <button
            type="button"
            onClick={() => setSide('sell')}
            className={`py-2 rounded font-mono-sm text-mono-sm border transition-colors cursor-pointer ${
              side === 'sell'
                ? 'bg-error/20 border-error text-error'
                : 'bg-surface-container-high border-outline-variant text-on-surface hover:border-error'
            }`}
          >
            Sell
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block font-mono-sm text-mono-sm text-on-surface-variant mb-1">
              Size min ({pair.baseSymbol})
            </span>
            <input
              className="input-sealed w-full rounded p-2 text-on-surface font-mono-data text-mono-data"
              value={sizeLo}
              onChange={(e) => setSizeLo(e.target.value)}
              placeholder="1.0"
              inputMode="decimal"
            />
          </label>
          <label className="block">
            <span className="block font-mono-sm text-mono-sm text-on-surface-variant mb-1">
              Size max ({pair.baseSymbol})
            </span>
            <input
              className="input-sealed w-full rounded p-2 text-on-surface font-mono-data text-mono-data"
              value={sizeHi}
              onChange={(e) => setSizeHi(e.target.value)}
              placeholder="10.0"
              inputMode="decimal"
            />
          </label>
        </div>

        <div className="flex justify-between items-center font-mono-sm text-[10px] text-on-surface-variant">
          <span>
            {market ? (
              <>
                <span className="opacity-60">{pair.priceSource === 'fixed' ? 'NAV' : 'DeepBook ref'}</span>{' '}
                <span className="text-secondary">
                  {market.mid.toFixed(3)} {pair.quoteSymbol}
                </span>
                {pair.priceSource === 'deepbook' && (
                  <span className="opacity-60">
                    {' '}
                    (bid {market.bid.toFixed(3)} / ask {market.ask.toFixed(3)})
                  </span>
                )}
              </>
            ) : (
              <span className="opacity-60">Reference price unavailable</span>
            )}
          </span>
          <button
            type="button"
            onClick={() => void applyMarketRange()}
            className="text-primary border border-primary/30 px-2 py-0.5 rounded hover:bg-primary/10 transition-colors cursor-pointer"
            title="Fill price range around reference price. Shell settles directly between counterparties — this is a reference only, not a constraint."
          >
            Use ref price ±2%
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block font-mono-sm text-mono-sm text-on-surface-variant mb-1">
              Price min ({pair.quoteSymbol})
            </span>
            <input
              className="input-sealed w-full rounded p-2 text-on-surface font-mono-data text-mono-data"
              value={priceLo}
              onChange={(e) => setPriceLo(e.target.value)}
              placeholder={
                market
                  ? (market.mid * (side === 'buy' ? 0.99 : 0.98)).toFixed(3)
                  : '1.040'
              }
              inputMode="decimal"
            />
          </label>
          <label className="block">
            <span className="block font-mono-sm text-mono-sm text-on-surface-variant mb-1">
              Price max ({pair.quoteSymbol})
            </span>
            <input
              className="input-sealed w-full rounded p-2 text-on-surface font-mono-data text-mono-data"
              value={priceHi}
              onChange={(e) => setPriceHi(e.target.value)}
              placeholder={
                market
                  ? (market.mid * (side === 'buy' ? 1.02 : 1.01)).toFixed(3)
                  : '1.080'
              }
              inputMode="decimal"
            />
          </label>
        </div>

        <label className="block">
          <span className="block font-mono-sm text-mono-sm text-on-surface-variant mb-1">
            Time-to-live (minutes)
          </span>
          <input
            className="input-sealed w-full rounded p-2 text-on-surface font-mono-data text-mono-data"
            value={ttlMin}
            onChange={(e) => setTtlMin(e.target.value)}
            inputMode="numeric"
          />
        </label>

        <button
          type="submit"
          disabled={!account || submitting}
          className="py-2 rounded font-mono-sm text-mono-sm bg-primary/10 border border-primary text-primary hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? status ?? 'Submitting…' : 'Post IOI'}
        </button>

        {status && !submitting && (
          <div className="flex items-center gap-2 p-2 bg-emerald-500/10 border border-emerald-500/40 rounded font-mono-sm text-mono-sm text-emerald-300">
            <span className="material-symbols-outlined text-[14px]">check_circle</span>
            {status}
          </div>
        )}
        {error && (
          <div className="font-mono-sm text-mono-sm text-error">{error}</div>
        )}
      </form>
    </div>
  );
}
