'use client';

import { useState } from 'react';
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { encryptOrder, submitOrderTx, getOrderCollateralType, settleMatchTx } from '@/lib/shell-sdk';
import type { OrderSide } from '@/lib/shell-sdk';
import {
  SHELL_PACKAGE_ID, QUOTE_SYMBOL, ENCLAVE_URL, ENCLAVE_ID,
  collateralTypeFor, getSealClient,
} from '@/lib/sui';

export interface SubmittedOrder {
  orderId?: string;
  digest: string;
  commitHash: string;
  backupKey: string;
  side: OrderSide;
  size: string;
  limitPrice: string;
  timestamp: number;
}

interface Props {
  onOrderSubmitted: (order: SubmittedOrder) => void;
}

function hexFromBytes(arr: number[]): string {
  return '0x' + arr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function bytesFromHex(hex: string): Uint8Array {
  const s = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
  return out;
}

export default function SealedOrderForm({ onOrderSubmitted }: Props) {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  const [side, setSide] = useState<OrderSide>('buy');
  const [size, setSize] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [slippage, setSlippage] = useState('0.5');
  const [expiry, setExpiry] = useState('5');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Collateral the user will escrow:
  //   sell → the SUI being sold (= size)
  //   buy  → the DUSDC being paid (= size × limitPrice)
  const displayCollateral = (() => {
    if (side === 'sell') return size ? `${size} SUI` : '? SUI';
    if (!size || !limitPrice) return `? ${QUOTE_SYMBOL}`;
    return `${(parseFloat(size) * parseFloat(limitPrice)).toFixed(2)} ${QUOTE_SYMBOL}`;
  })();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!account) return;
    setError(null);
    setIsSubmitting(true);

    try {
      const seal = getSealClient(suiClient);
      const { epoch } = await suiClient.getLatestSuiSystemState();
      const expiryEpoch = BigInt(epoch) + BigInt(expiry);

      // size in mist (SUI 9 decimals), price in µDUSDC (6 decimals)
      const sizeBase = BigInt(Math.round(parseFloat(size) * 1_000_000_000));
      const priceBase = BigInt(Math.round(parseFloat(limitPrice) * 1_000_000));
      const maxSlippageBps = Math.round(parseFloat(slippage) * 100);

      setStatus('Encrypting...');
      const enc = await encryptOrder({
        sealClient: seal,
        shellPackageId: SHELL_PACKAGE_ID,
        threshold: 1,
        order: {
          side,
          size: sizeBase,
          limitPrice: priceBase,
          expiryEpoch,
          maxSlippageBps,
        },
      });

      const backupKeyHex = Array.from(enc.backupKey).map(b => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(`shell_backup_${Date.now()}`, backupKeyHex);

      const tx = new Transaction();
      const collateralType = collateralTypeFor(side);
      const SUI_TYPE = '0x2::sui::SUI';

      // sell escrows SUI (= size), buy escrows DUSDC (= size × price / 1e9)
      const collateralAmount = side === 'sell'
        ? sizeBase
        : (sizeBase * priceBase) / BigInt(1_000_000_000);

      let collateral;
      if (collateralType === SUI_TYPE) {
        [collateral] = tx.splitCoins(tx.gas, [tx.pure.u64(collateralAmount)]);
      } else {
        const coins = await suiClient.getCoins({ owner: account.address, coinType: collateralType });
        if (coins.data.length === 0) {
          throw new Error(`No ${collateralType.split('::').pop()} coins in wallet.`);
        }
        const primary = tx.object(coins.data[0].coinObjectId);
        if (coins.data.length > 1) {
          tx.mergeCoins(primary, coins.data.slice(1).map(c => tx.object(c.coinObjectId)));
        }
        [collateral] = tx.splitCoins(primary, [tx.pure.u64(collateralAmount)]);
      }

      submitOrderTx({
        shellPackageId: SHELL_PACKAGE_ID,
        collateralType,
        collateral,
        sealedEnvelope: enc.sealedEnvelope,
        commitHash: enc.commitHash,
        expiryEpoch,
        tx,
      });

      setStatus('Signing...');
      const res = await signAndExecute({ transaction: tx });

      const txResult = await suiClient.waitForTransaction({
        digest: res.digest,
        options: { showObjectChanges: true },
      });

      const created = txResult.objectChanges?.find(
        (c: { type: string; objectType?: string }) =>
          c.type === 'created' && c.objectType?.includes('OrderCommitment'),
      );
      const orderId = (created as { objectId?: string })?.objectId;
      const commitHashHex = Array.from(enc.commitHash).map(b => b.toString(16).padStart(2, '0')).join('');

      onOrderSubmitted({
        orderId,
        digest: res.digest,
        commitHash: commitHashHex,
        backupKey: backupKeyHex,
        side,
        size,
        limitPrice,
        timestamp: Date.now(),
      });

      // ── Trigger enclave matching ─────────────────────────────────────────
      if (orderId) {
        setStatus('Triggering matching...');
        try {
          const enclaveRes = await fetch('/api/enclave/process_data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              payload: {
                orders: [{
                  order_id: orderId,
                  trader: account.address,
                  plaintext: {
                    side,
                    size: Number(sizeBase),
                    limit_price: Number(priceBase),
                    expiry_epoch: Number(expiryEpoch),
                    max_slippage_bps: maxSlippageBps,
                  },
                }],
              },
            }),
          });

          if (enclaveRes.ok) {
            const signed = await enclaveRes.json();
            for (const match of signed.matches ?? []) {
              setStatus('Settling match...');
              const p = match.envelope.data;
              const makerOrderId = hexFromBytes(p.maker_order);
              const takerOrderId = hexFromBytes(p.taker_order);

              const [makerT, takerT] = await Promise.all([
                getOrderCollateralType(suiClient, makerOrderId),
                getOrderCollateralType(suiClient, takerOrderId),
              ]);

              const settleTx = settleMatchTx({
                shellPackageId: SHELL_PACKAGE_ID,
                enclaveId: ENCLAVE_ID,
                timestampMs: BigInt(signed.timestamp_ms),
                maker: hexFromBytes(p.maker),
                taker: hexFromBytes(p.taker),
                makerOrderId,
                takerOrderId,
                makerCollateralType: makerT,
                takerCollateralType: takerT,
                filledSize: BigInt(p.filled_size),
                filledPrice: BigInt(p.filled_price),
                deepbookTxDigest: new Uint8Array(p.deepbook_tx_digest),
                signature: bytesFromHex(match.signature),
              });

              await signAndExecute({ transaction: settleTx });
            }
          }
        } catch (enclaveErr) {
          // Order is on-chain regardless; enclave errors are non-fatal
          console.error('Enclave trigger failed:', enclaveErr);
        }
      }

      setSize('');
      setLimitPrice('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Order submission failed');
    } finally {
      setIsSubmitting(false);
      setStatus('');
    }
  }

  return (
    <div className="glass-panel glass-panel-active rounded-lg p-4 flex flex-col h-full min-h-[500px] lg:min-h-0">
      <div className="flex justify-between items-center mb-4 pb-2 border-b border-[#1E293B]">
        <h2 className="font-headline-md text-[18px] text-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>lock</span>
          Sealed Order
        </h2>
        {account && (
          <span className="font-mono-sm text-[10px] text-primary border border-primary/30 px-2 py-0.5 rounded bg-primary/10">
            TESTNET
          </span>
        )}
      </div>
      <form className="flex flex-col gap-4 flex-1" onSubmit={handleSubmit}>
        {/* Asset */}
        <div className="relative group">
          <label className="block font-mono-sm text-mono-sm text-on-surface-variant mb-1">Asset</label>
          <div className="relative">
            <input className="input-sealed w-full rounded p-2 text-on-surface font-mono-data text-mono-data pr-24" type="text" value={`SUI/${QUOTE_SYMBOL}`} readOnly />
            <span className="absolute right-2 top-2 text-primary font-mono-sm text-[10px] pointer-events-none select-none">ENCRYPTED</span>
          </div>
        </div>

        {/* Side */}
        <div className="grid grid-cols-2 gap-2">
          <button
            className={`py-2 rounded font-mono-sm text-mono-sm transition-colors cursor-pointer border ${
              side === 'buy'
                ? 'bg-primary/20 border-primary text-primary'
                : 'bg-surface-container-high border-outline-variant text-on-surface hover:border-primary'
            }`}
            type="button"
            onClick={() => setSide('buy')}
          >
            Buy
          </button>
          <button
            className={`py-2 rounded font-mono-sm text-mono-sm transition-colors cursor-pointer border ${
              side === 'sell'
                ? 'bg-error/20 border-error text-error'
                : 'bg-surface-container-high border-outline-variant text-on-surface hover:border-error'
            }`}
            type="button"
            onClick={() => setSide('sell')}
          >
            Sell
          </button>
        </div>

        {/* Size */}
        <div className="relative group">
          <label className="block font-mono-sm text-mono-sm text-on-surface-variant mb-1">Size</label>
          <div className="relative">
            <input
              className="input-sealed w-full rounded p-2 text-on-surface font-mono-data text-mono-data text-right pr-16"
              placeholder="0.00"
              type="text"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              inputMode="decimal"
            />
            <span className="absolute right-2 top-2 text-on-surface-variant font-mono-sm pointer-events-none select-none">SUI</span>
          </div>
        </div>

        {/* Limit Price */}
        <div className="relative group">
          <label className="block font-mono-sm text-mono-sm text-on-surface-variant mb-1 flex justify-between">
            Limit Price
            <span className="text-secondary text-[10px] border border-secondary/30 px-1 rounded">Private</span>
          </label>
          <div className="relative">
            <input
              className="input-sealed w-full rounded p-2 text-on-surface font-mono-data text-mono-data text-right pr-20"
              placeholder="0.00"
              type="text"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              inputMode="decimal"
            />
            <span className="absolute right-2 top-2 text-on-surface-variant font-mono-sm pointer-events-none select-none">{QUOTE_SYMBOL}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Expiry */}
          <div className="relative group">
            <label className="block font-mono-sm text-mono-sm text-on-surface-variant mb-1">Expiry (epochs)</label>
            <select
              className="input-sealed w-full rounded p-2 text-on-surface font-mono-sm text-mono-sm appearance-none cursor-pointer"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
            >
              <option value="1">1 Epoch (~24h)</option>
              <option value="5">5 Epochs (~5d)</option>
              <option value="10">10 Epochs (~10d)</option>
            </select>
          </div>
          {/* Max Slippage */}
          <div className="relative group">
            <label className="block font-mono-sm text-mono-sm text-on-surface-variant mb-1">Max Slippage</label>
            <div className="relative">
              <input
                className="input-sealed w-full rounded p-2 text-on-surface font-mono-data text-mono-data text-right pr-10"
                type="text"
                value={slippage}
                onChange={(e) => setSlippage(e.target.value)}
                inputMode="decimal"
              />
              <span className="absolute right-2 top-2 text-on-surface-variant font-mono-sm pointer-events-none select-none">%</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-2 bg-error/10 border border-error/30 rounded font-mono-sm text-mono-sm text-error">
            {error}
          </div>
        )}

        <div className="mt-auto pt-4">
          <button
            className="w-full bg-primary text-on-primary py-3 rounded font-mono-sm text-mono-sm font-bold uppercase tracking-wider hover:opacity-90 transition-opacity shadow-[0_0_8px_rgba(87,241,219,0.3)] flex justify-center items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            type="submit"
            disabled={!account || isSubmitting || !size || !limitPrice}
          >
            {isSubmitting ? (
              <>
                <span className="material-symbols-outlined text-[18px] animate-spin">sync</span>
                {status || 'Processing...'}
              </>
            ) : !account ? (
              <>
                <span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>
                Connect Wallet First
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]">verified_user</span>
                Submit Sealed Order
              </>
            )}
          </button>
          <div className="mt-2 text-center font-mono-sm text-[10px] text-on-surface-variant">
            Collateral: {displayCollateral} (testnet)
          </div>
        </div>
      </form>
    </div>
  );
}
