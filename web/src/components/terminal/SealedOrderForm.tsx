'use client';

import { useState } from 'react';
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { encryptOrder, submitOrderTx } from '@shell-finance/sdk';
import { SHELL_PACKAGE_ID, COLLATERAL_TYPE, DEFAULT_COLLATERAL_AMOUNT, getSealClient } from '@/lib/sui';
import type { OrderSide } from '@shell-finance/sdk';

/** Result emitted after a successful order submission */
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

export default function SealedOrderForm({ onOrderSubmitted }: Props) {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  const [side, setSide] = useState<OrderSide>('buy');
  const [size, setSize] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [slippage, setSlippage] = useState('0.5');
  const [expiry, setExpiry] = useState('5'); // epochs
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!account) return;
    setError(null);
    setIsSubmitting(true);

    try {
      const seal = getSealClient(suiClient);

      // Resolve current epoch for expiry calculation
      const { epoch } = await suiClient.getLatestSuiSystemState();
      const expiryEpoch = BigInt(epoch) + BigInt(expiry);

      // Encrypt the order under Seal
      const enc = await encryptOrder({
        sealClient: seal,
        shellPackageId: SHELL_PACKAGE_ID,
        threshold: 1,
        order: {
          side,
          size: BigInt(Math.round(parseFloat(size) * 1e9)), // normalize to base units
          limitPrice: BigInt(Math.round(parseFloat(limitPrice) * 1e9)),
          expiryEpoch,
          maxSlippageBps: Math.round(parseFloat(slippage) * 100), // % → bps
        },
      });

      // Persist backup key for recovery — localStorage is fine for testnet
      const backupKeyHex = Array.from(enc.backupKey).map(b => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(`shell_backup_${Date.now()}`, backupKeyHex);

      // Build and sign the transaction
      const tx = new Transaction();
      const [collateral] = tx.splitCoins(tx.gas, [tx.pure.u64(DEFAULT_COLLATERAL_AMOUNT)]);
      submitOrderTx({
        shellPackageId: SHELL_PACKAGE_ID,
        collateralType: COLLATERAL_TYPE,
        collateral,
        sealedEnvelope: enc.sealedEnvelope,
        commitHash: enc.commitHash,
        expiryEpoch,
        tx,
      });

      const res = await signAndExecute({
        transaction: tx,
      });

      // Wait for the transaction to be indexed to get object changes
      const txResult = await suiClient.waitForTransaction({
        digest: res.digest,
        options: { showObjectChanges: true },
      });

      // Find the created OrderCommitment
      const created = txResult.objectChanges?.find(
        (c: { type: string; objectType?: string }) => c.type === 'created' && c.objectType?.includes('OrderCommitment'),
      );

      const commitHashHex = Array.from(enc.commitHash).map(b => b.toString(16).padStart(2, '0')).join('');

      onOrderSubmitted({
        orderId: (created as { objectId?: string })?.objectId,
        digest: res.digest,
        commitHash: commitHashHex,
        backupKey: backupKeyHex,
        side,
        size,
        limitPrice,
        timestamp: Date.now(),
      });

      // Reset form
      setSize('');
      setLimitPrice('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Order submission failed');
    } finally {
      setIsSubmitting(false);
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
        {/* Asset — hardcoded for testnet */}
        <div className="relative group">
          <label className="block font-mono-sm text-mono-sm text-on-surface-variant mb-1">Asset</label>
          <div className="relative">
            <input className="input-sealed w-full rounded p-2 text-on-surface font-mono-data text-mono-data pr-24" type="text" value="SUI/USDC" readOnly />
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
            <span className="absolute right-2 top-2 text-on-surface-variant font-mono-sm pointer-events-none select-none">USDC</span>
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

        {/* Error display */}
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
                Encrypting & Signing...
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
          {/* Collateral note */}
          <div className="mt-2 text-center font-mono-sm text-[10px] text-on-surface-variant">
            Collateral: 0.01 SUI (testnet)
          </div>
        </div>
      </form>
    </div>
  );
}
