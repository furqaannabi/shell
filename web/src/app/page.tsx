'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useCurrentAccount, useDisconnectWallet } from '@mysten/dapp-kit';
import LandingConnectButton from '@/components/wallet/LandingConnectButton';

const GITHUB = 'https://github.com/furqaannabi/shell';

const steps = [
  {
    n: '01',
    title: 'Post',
    desc: 'Submit an encrypted IOI to Walrus. Your side, size, and price are sealed — only the Nautilus enclave can read them.',
    icon: 'enhanced_encryption',
  },
  {
    n: '02',
    title: 'Match',
    desc: 'The enclave finds a counterparty with an overlapping IOI. Neither party learns the other\'s original terms.',
    icon: 'dns',
  },
  {
    n: '03',
    title: 'Settle',
    desc: 'A hot-potato MatchInstruction is consumed atomically with a DeepBook trade. Receipt minted on-chain.',
    icon: 'water_drop',
  },
];

const pillars = [
  {
    icon: 'enhanced_encryption',
    title: 'Pre-trade privacy',
    desc: 'Your side, size, and limit price are sealed with Mysten Seal before leaving your browser. The matching engine never sees plaintext orders.',
    accent: 'primary',
  },
  {
    icon: 'dns',
    title: 'Verified execution',
    desc: 'Matching runs inside an AWS Nitro Enclave. PCR attestation is registered on Sui — anyone can verify the enclave image on-chain.',
    accent: 'secondary',
  },
  {
    icon: 'verified',
    title: 'Atomic settlement',
    desc: 'A MatchInstruction hot-potato is consumed in the same PTB as the DeepBook trade. No partial fills, no race conditions.',
    accent: 'primary',
  },
];

export default function LandingPage() {
  const account = useCurrentAccount();
  const { mutate: disconnect } = useDisconnectWallet();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[#0A0C10] text-on-surface selection:bg-primary selection:text-on-primary">
      {/* Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div style={{ backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.025) 1px, transparent 1px)', backgroundSize: '32px 32px' }} className="absolute inset-0" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(45,212,191,0.08)_0%,transparent_70%)]" />
      </div>

      {/* Navbar */}
      <nav className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-12 h-16 transition-all duration-300 ${scrolled ? 'bg-[#0A0C10]/90 backdrop-blur-md border-b border-outline-variant/50' : 'bg-transparent'}`}>
        <div className="font-headline-md text-headline-md font-bold tracking-tighter text-primary">SHELL FINANCE</div>
        <div className="flex items-center gap-3">
          {account ? (
            <>
              <span className="font-mono-sm text-[11px] text-on-surface-variant hidden sm:inline">
                {account.address.slice(0, 6)}…{account.address.slice(-4)}
              </span>
              <button
                onClick={() => disconnect()}
                className="h-9 px-4 border border-outline-variant text-on-surface-variant hover:border-error hover:text-error transition-colors font-mono-sm text-mono-sm rounded"
              >
                Disconnect
              </button>
              <Link
                href="/terminal"
                className="h-9 px-4 border border-primary bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-mono-sm text-mono-sm rounded flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[16px]">terminal</span>
                Terminal
              </Link>
            </>
          ) : (
            <Link
              href="/terminal"
              className="h-9 px-4 border border-outline-variant bg-surface-container text-on-surface hover:border-primary hover:text-primary transition-colors font-mono-sm text-mono-sm rounded flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[16px]">terminal</span>
              Launch Terminal
            </Link>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 min-h-screen flex flex-col items-center justify-center text-center px-6 pt-16">
        <div className="flex items-center gap-2 mb-8 px-3 py-1.5 rounded border border-outline-variant bg-surface-container/50 font-mono-sm text-mono-sm text-on-surface-variant">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
          ENCLAVE: ACTIVE · Sui Testnet
        </div>

        <h1 className="font-headline-md text-4xl md:text-6xl font-bold tracking-tight text-on-surface max-w-3xl leading-tight mb-6">
          Private Order Flow<br />
          <span className="text-primary">on Sui</span>
        </h1>

        <p className="font-body-base text-body-base text-on-surface-variant max-w-xl mb-10 leading-relaxed">
          Seal-encrypted IOIs. TEE matching inside a Nautilus enclave.
          Atomic on-chain settlement — without leaking your alpha.
        </p>

        <div className="w-full max-w-xs">
          {account ? (
            <Link
              href="/terminal"
              className="w-full h-14 bg-primary text-on-primary font-body-base font-semibold rounded hover:opacity-90 transition-opacity flex items-center justify-center gap-3"
            >
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>terminal</span>
              Enter Terminal
            </Link>
          ) : (
            <LandingConnectButton />
          )}
        </div>

        <div className="mt-20 flex items-center gap-6 font-mono-sm text-mono-sm text-on-surface-variant/50 text-[11px]">
          <span>Seal Encryption</span>
          <span className="text-outline-variant">·</span>
          <span>AWS Nitro Enclave</span>
          <span className="text-outline-variant">·</span>
          <span>DeepBook v3</span>
        </div>
      </section>

      {/* How it works */}
      <section className="relative z-10 px-6 md:px-12 py-24 max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <div className="font-mono-sm text-mono-sm text-primary uppercase tracking-widest mb-3">How it works</div>
          <h2 className="font-headline-md text-3xl md:text-4xl font-bold text-on-surface">Three steps. Zero leaks.</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
          {/* Connector line (desktop) */}
          <div className="hidden md:block absolute top-10 left-[calc(33%+1rem)] right-[calc(33%+1rem)] h-px bg-gradient-to-r from-primary/30 via-primary/60 to-primary/30" />

          {steps.map((s) => (
            <div key={s.n} className="glass-panel rounded border border-outline-variant p-6 flex flex-col gap-4 relative">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded bg-primary/10 border border-primary/30 flex items-center justify-center text-primary shrink-0">
                  <span className="material-symbols-outlined text-[18px]">{s.icon}</span>
                </div>
                <span className="font-mono-sm text-[10px] text-primary tracking-widest">{s.n}</span>
              </div>
              <h3 className="font-body-base text-body-base font-semibold text-on-surface">{s.title}</h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why Shell */}
      <section className="relative z-10 px-6 md:px-12 py-24 max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <div className="font-mono-sm text-mono-sm text-secondary uppercase tracking-widest mb-3">Why Shell</div>
          <h2 className="font-headline-md text-3xl md:text-4xl font-bold text-on-surface">Built for institutional flow.</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {pillars.map((p) => (
            <div key={p.title} className="glass-panel rounded border border-outline-variant p-6 flex flex-col gap-4 group hover:border-primary/40 transition-colors">
              <div className={`w-10 h-10 rounded border flex items-center justify-center shrink-0 transition-colors ${p.accent === 'secondary' ? 'border-secondary/30 bg-secondary/10 text-secondary group-hover:border-secondary/60' : 'border-primary/30 bg-primary/10 text-primary group-hover:border-primary/60'}`}>
                <span className="material-symbols-outlined text-[20px]">{p.icon}</span>
              </div>
              <h3 className="font-body-base text-body-base font-semibold text-on-surface">{p.title}</h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 px-6 md:px-12 py-24 max-w-lg mx-auto text-center">
        <div className="glass-panel rounded border border-outline-variant p-10 flex flex-col items-center gap-6">
          <div className="w-12 h-12 rounded bg-primary/10 border border-primary/30 flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>lock</span>
          </div>
          <div>
            <h2 className="font-headline-md text-2xl font-bold text-on-surface mb-2">Ready to trade privately?</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">Connect your Sui wallet to open a sealed session.</p>
          </div>

          <div className="w-full">
            {account ? (
              <Link
                href="/terminal"
                className="w-full h-14 bg-primary text-on-primary font-body-base font-semibold rounded hover:opacity-90 transition-opacity flex items-center justify-center gap-3"
              >
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>terminal</span>
                Enter Terminal
              </Link>
            ) : (
              <LandingConnectButton />
            )}
          </div>

          <p className="font-body-sm text-[11px] text-outline-variant">
            By authenticating, you verify clearance for Restricted Order Flow.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-outline-variant/30 px-6 md:px-12 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono-sm text-mono-sm text-on-surface-variant/50">
        <span>SHELL FINANCE · Sui Testnet</span>
        <div className="flex items-center gap-4">
          <a href={GITHUB} target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">GitHub</a>
          <span>v2.4.1-TE</span>
        </div>
      </footer>
    </div>
  );
}
