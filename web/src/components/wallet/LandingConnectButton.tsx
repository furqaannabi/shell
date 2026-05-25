'use client';

import { useRouter } from 'next/navigation';
import { useConnectWallet, useCurrentAccount, useWallets } from '@mysten/dapp-kit';
import { useEffect, useRef, useState } from 'react';

/**
 * Landing page wallet connect button.
 * Connects to the first available wallet, then redirects to /terminal.
 */
export default function LandingConnectButton() {
  const router = useRouter();
  const account = useCurrentAccount();
  const wallets = useWallets();
  const { mutate: connect, isPending } = useConnectWallet();
  const [mounted, setMounted] = useState(false);
  const userClicked = useRef(false);
  useEffect(() => { setMounted(true); }, []);

  // Only redirect on explicit user-initiated connect, not autoConnect
  useEffect(() => {
    if (account && userClicked.current) {
      router.push('/terminal');
    }
  }, [account, router]);

  return (
    <button
      onClick={() => {
        if (wallets.length > 0) {
          userClicked.current = true;
          if (account) {
            router.push('/terminal');
          } else {
            connect({ wallet: wallets[0] });
          }
        }
      }}
      disabled={mounted && (isPending || wallets.length === 0)}
      className="w-full h-14 bg-primary text-on-primary font-body-base text-body-base font-semibold rounded hover:bg-primary-fixed transition-colors btn-glow flex items-center justify-center gap-3 hover:shadow-[0_0_8px_rgba(45,212,191,0.3)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isPending ? (
        <>
          <span className="material-symbols-outlined animate-spin">sync</span>
          Connecting...
        </>
      ) : (
        <>
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>account_balance_wallet</span>
          Connect Wallet
        </>
      )}
    </button>
  );
}
