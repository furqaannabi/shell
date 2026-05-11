'use client';

import { useCurrentAccount, useConnectWallet, useDisconnectWallet, useWallets } from '@mysten/dapp-kit';
import { useState, useRef, useEffect } from 'react';

/** Truncate a Sui address for display: 0x1234...abcd */
function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function ConnectWalletButton() {
  const account = useCurrentAccount();
  const wallets = useWallets();
  const { mutate: connect, isPending } = useConnectWallet();
  const { mutate: disconnect } = useDisconnectWallet();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Connected state — show address + disconnect option
  if (account) {
    return (
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="bg-primary/10 border border-primary/30 text-primary px-3 md:px-4 py-1.5 md:py-2 rounded font-mono-sm text-[11px] md:text-mono-sm font-medium hover:bg-primary/20 transition-colors flex items-center justify-center gap-1.5 md:gap-2 cursor-pointer"
        >
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="hidden md:inline">{truncateAddress(account.address)}</span>
          <span className="md:hidden">Connected</span>
        </button>
        {showMenu && (
          <div className="absolute right-0 top-full mt-2 w-48 glass-panel rounded border border-outline-variant p-2 z-50">
            <div className="px-3 py-2 font-mono-sm text-[10px] text-on-surface-variant border-b border-outline-variant mb-1 truncate">
              {account.address}
            </div>
            <button
              onClick={() => { disconnect(); setShowMenu(false); }}
              className="w-full text-left px-3 py-2 font-mono-sm text-mono-sm text-error hover:bg-error/10 rounded transition-colors cursor-pointer"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  // Disconnected — connect to first available wallet
  return (
    <button
      onClick={() => {
        if (wallets.length > 0) {
          connect({ wallet: wallets[0] });
        }
      }}
      disabled={isPending || wallets.length === 0}
      className="bg-primary text-on-primary px-3 md:px-4 py-1.5 md:py-2 rounded font-mono-sm text-[11px] md:text-mono-sm font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5 md:gap-2 cursor-pointer shadow-[0_0_8px_rgba(87,241,219,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isPending ? (
        <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
      ) : (
        <span className="material-symbols-outlined md:hidden" style={{ fontSize: '16px', lineHeight: '1' }}>account_balance_wallet</span>
      )}
      <span className="hidden md:inline leading-none mt-0.5">
        {isPending ? 'Connecting...' : 'Connect Wallet'}
      </span>
      <span className="md:hidden leading-none mt-0.5">
        {isPending ? '...' : 'Connect'}
      </span>
    </button>
  );
}
