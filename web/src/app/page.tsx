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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[#0A0C10] text-on-surface selection:bg-primary selection:text-on-primary font-body-base overflow-x-hidden">
      {/* Dynamic Web3 Background */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-[#030406]">
        {/* Deep space radial gradient */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(47,58,163,0.15),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(87,241,219,0.1),transparent_50%)]" />

        {/* Perspective Cyber Grid */}
        <div className="absolute bottom-0 left-0 w-full h-[60vh] opacity-30" style={{ perspective: '1000px' }}>
          <div 
            className="absolute inset-0 w-full h-full"
            style={{
              backgroundImage: 'linear-gradient(to right, rgba(87,241,219,0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(87,241,219,0.2) 1px, transparent 1px)',
              backgroundSize: '50px 50px',
              transform: 'rotateX(75deg) scale(2.5) translateY(20%)',
              transformOrigin: 'bottom center',
              maskImage: 'linear-gradient(to top, white 10%, transparent 80%)',
              WebkitMaskImage: 'linear-gradient(to top, white 10%, transparent 80%)',
              willChange: 'transform'
            }}
          />
        </div>

        {/* Crypto Hexagon Pattern (Hardware Accelerated Pan) */}
        <div 
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='103.923' viewBox='0 0 60 103.923' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 103.923L0 86.602V51.961l30-17.32l30 17.32v34.641l-30 17.321zm0-3.464l27-15.588V53.693L30 38.105 3 53.693v31.176l27 15.589zM15 77.942l-15-8.66V34.641l15-8.66 15 8.66v34.64l-15 8.661zm0-3.464l12-6.928V36.373L15 29.445 3 36.373v31.177l12 6.928zM45 77.942l-15-8.66V34.641l15-8.66 15 8.66v34.64l-15 8.661zm0-3.464l12-6.928V36.373L45 29.445 33 36.373v31.177l12 6.928z' fill='%2357f1db' fill-opacity='1' fill-rule='evenodd'/%3E%3C/svg%3E")`,
            backgroundSize: '120px 207.846px',
            animation: 'pan-bg 15s linear infinite',
            willChange: 'background-position'
          }} 
        />

        {/* Floating Glowing Blockchain Nodes / Orbs (Optimized with radial-gradient instead of blur filter) */}
        <div className="absolute top-[15%] left-[20%] w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(87,241,219,0.08)_0%,transparent_60%)] mix-blend-screen rounded-full pointer-events-none" />
        <div className="absolute bottom-[20%] right-[15%] w-[800px] h-[800px] bg-[radial-gradient(circle,rgba(47,58,163,0.12)_0%,transparent_60%)] mix-blend-screen rounded-full pointer-events-none" />
        <div className="absolute top-[40%] left-[60%] w-[500px] h-[500px] bg-[radial-gradient(circle,rgba(60,221,199,0.06)_0%,transparent_60%)] mix-blend-screen rounded-full pointer-events-none" />

        {/* Falling/Moving light streaks (blockchain transactions) */}
        <div className="absolute top-0 left-[20%] w-[2px] h-32 bg-gradient-to-b from-transparent via-primary/80 to-transparent crypto-drop" style={{ animationDelay: '0s', animationDuration: '3s' }} />
        <div className="absolute top-0 left-[60%] w-[2px] h-48 bg-gradient-to-b from-transparent via-secondary/70 to-transparent crypto-drop" style={{ animationDelay: '1.5s', animationDuration: '4.5s' }} />
        <div className="absolute top-0 left-[80%] w-[3px] h-24 bg-gradient-to-b from-transparent via-primary-fixed/90 to-transparent crypto-drop" style={{ animationDelay: '0.5s', animationDuration: '3.5s' }} />
      </div>

      {/* Navbar */}
      <nav className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-12 h-20 transition-all duration-500 ${scrolled ? 'bg-[#0A0C10]/80 backdrop-blur-xl border-b border-outline-variant/30 shadow-[0_4px_30px_rgba(0,0,0,0.5)]' : 'bg-transparent'}`}>
        <div className="font-headline-md text-headline-md font-extrabold tracking-tighter text-primary">SHELL FINANCE</div>
        <div className="flex items-center gap-3">
          <Link
            href="/docs"
            className="h-10 px-4 border border-outline-variant/50 text-on-surface-variant hover:border-primary/50 hover:text-primary transition-all duration-300 font-mono-sm text-sm rounded-lg flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[16px]">menu_book</span>
            Docs
          </Link>
          {mounted && account && (
            <>
              <span className="font-mono-sm text-[12px] text-on-surface-variant hidden sm:inline px-3 py-1.5 rounded-full bg-surface-container-high/50 border border-outline-variant/50">
                {account.address.slice(0, 6)}…{account.address.slice(-4)}
              </span>
              <button
                onClick={() => disconnect()}
                className="h-10 px-4 border border-outline-variant/50 text-on-surface-variant hover:border-error/50 hover:text-error hover:bg-error/10 transition-all duration-300 font-mono-sm text-sm rounded-lg"
              >
                Disconnect
              </button>
              <Link
                href="/terminal"
                className="h-10 px-5 bg-primary text-on-primary hover:bg-primary-fixed hover:shadow-[0_0_15px_rgba(87,241,219,0.4)] transition-all duration-300 font-mono-sm font-semibold text-sm rounded-lg flex items-center gap-2 group"
              >
                <span className="material-symbols-outlined text-[18px] group-hover:scale-110 transition-transform">terminal</span>
                Terminal
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 min-h-screen flex flex-col items-center justify-center text-center px-6 pt-24 pb-12">
        <div className="flex items-center gap-3 mb-10 px-4 py-2 rounded-full border border-primary/20 bg-primary/5 backdrop-blur-sm font-mono-sm text-xs text-primary shadow-[0_0_20px_rgba(45,212,191,0.1)] transition-transform hover:scale-105 duration-300 cursor-default">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(45,212,191,0.8)]"></span>
          ENCLAVE: ACTIVE · Sui Testnet
        </div>

        <h1 className="font-headline-md text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter text-on-surface max-w-4xl leading-[1.1] mb-8">
          Private Order Flow<br />
          <span className="text-primary drop-shadow-sm">on Sui</span>
        </h1>

        <p className="font-body-base text-lg md:text-xl text-on-surface-variant max-w-2xl mb-12 leading-relaxed font-light">
          Seal-encrypted IOIs. TEE matching inside a Nautilus enclave.
          Atomic on-chain settlement — without leaking your alpha.
        </p>

        <div className="w-full max-w-xs relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-primary to-secondary rounded-lg blur opacity-25 group-hover:opacity-60 transition duration-500 group-hover:duration-200"></div>
          {mounted && account ? (
            <Link
              href="/terminal"
              className="relative w-full h-14 bg-primary text-on-primary font-body-base text-lg font-semibold rounded-lg hover:bg-primary-fixed transition-colors flex items-center justify-center gap-3 shadow-[0_0_20px_rgba(45,212,191,0.2)]"
            >
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>terminal</span>
              Enter Terminal
            </Link>
          ) : (
            <div className="relative">
              <LandingConnectButton />
            </div>
          )}
        </div>

        <div className="mt-24 flex flex-wrap justify-center items-center gap-x-8 gap-y-4 font-mono-sm text-xs text-on-surface-variant/60 tracking-wider">
          <span className="flex items-center gap-2"><span className="material-symbols-outlined text-[14px]">lock</span> Seal Encryption</span>
          <span className="text-outline-variant hidden md:inline">·</span>
          <span className="flex items-center gap-2"><span className="material-symbols-outlined text-[14px]">memory</span> AWS Nitro Enclave</span>
          <span className="text-outline-variant hidden md:inline">·</span>
          <span className="flex items-center gap-2"><span className="material-symbols-outlined text-[14px]">layers</span> DeepBook v3</span>
        </div>
      </section>

      {/* How it works */}
      <section className="relative z-10 px-6 md:px-12 py-32 max-w-6xl mx-auto">
        <div className="text-center mb-20">
          <div className="font-mono-sm text-sm text-primary font-medium tracking-[0.2em] mb-4">WORKFLOW</div>
          <h2 className="font-headline-md text-4xl md:text-5xl font-bold text-on-surface tracking-tight">Three steps. <span className="text-on-surface-variant font-light">Zero leaks.</span></h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Connector line (desktop) */}
          <div className="hidden md:block absolute top-12 left-[16.66%] right-[16.66%] h-[2px] bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

          {steps.map((s, i) => (
            <div key={s.n} className="group glass-panel rounded-2xl bg-surface-container-low/40 backdrop-blur-md border border-outline-variant/30 p-8 flex flex-col gap-6 hover:border-primary/40 hover:bg-surface-container-low/60 hover:-translate-y-2 transition-all duration-500 relative overflow-hidden shadow-lg">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full blur-2xl group-hover:bg-primary/10 transition-colors duration-500"></div>
              
              <div className="flex items-center justify-between relative z-10">
                <div className="w-14 h-14 rounded-xl bg-surface-container-high border border-outline-variant/50 flex items-center justify-center text-primary group-hover:scale-110 group-hover:border-primary/50 group-hover:bg-primary/10 transition-all duration-500 shadow-inner">
                  <span className="material-symbols-outlined text-[28px]">{s.icon}</span>
                </div>
                <span className="font-mono-sm text-5xl font-black text-outline-variant/20 group-hover:text-primary/20 transition-colors duration-500 select-none">{s.n}</span>
              </div>
              
              <div className="relative z-10">
                <h3 className="font-headline-md text-2xl font-semibold text-on-surface mb-3 group-hover:text-primary transition-colors">{s.title}</h3>
                <p className="font-body-base text-on-surface-variant leading-relaxed opacity-90 group-hover:opacity-100 transition-opacity">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Why Shell */}
      <section className="relative z-10 px-6 md:px-12 py-32 max-w-6xl mx-auto">
        <div className="text-center mb-20">
          <div className="font-mono-sm text-sm text-secondary font-medium tracking-[0.2em] mb-4">ARCHITECTURE</div>
          <h2 className="font-headline-md text-4xl md:text-5xl font-bold text-on-surface tracking-tight">Built for <span className="text-primary">institutional flow.</span></h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {pillars.map((p) => (
            <div key={p.title} className="group glass-panel rounded-2xl bg-surface-container-lowest/50 backdrop-blur-sm border border-outline-variant/30 p-8 flex flex-col gap-5 hover:border-outline-variant hover:shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)] transition-all duration-500">
              <div className={`w-12 h-12 rounded-xl border flex items-center justify-center shrink-0 transition-all duration-500 group-hover:scale-110 ${p.accent === 'secondary' ? 'border-secondary/30 bg-secondary/10 text-secondary group-hover:border-secondary/60 group-hover:shadow-[0_0_15px_rgba(189,194,255,0.2)]' : 'border-primary/30 bg-primary/10 text-primary group-hover:border-primary/60 group-hover:shadow-[0_0_15px_rgba(87,241,219,0.2)]'}`}>
                <span className="material-symbols-outlined text-[24px]">{p.icon}</span>
              </div>
              <div>
                <h3 className="font-headline-md text-xl font-semibold text-on-surface mb-3 group-hover:text-on-surface transition-colors">{p.title}</h3>
                <p className="font-body-base text-on-surface-variant leading-relaxed text-sm opacity-80 group-hover:opacity-100 transition-opacity">{p.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA — only show when not connected */}
      {(!mounted || !account) && (
        <section className="relative z-10 px-6 md:px-12 py-32 max-w-3xl mx-auto text-center">
          <div className="glass-panel rounded-3xl bg-surface-container-high/30 backdrop-blur-xl border border-outline-variant/40 p-12 flex flex-col items-center gap-8 relative overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.3)]">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50"></div>
            <div className="absolute -inset-24 bg-[radial-gradient(ellipse_at_center,rgba(45,212,191,0.1)_0%,transparent_70%)] pointer-events-none"></div>

            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary shadow-[0_0_30px_rgba(45,212,191,0.15)] z-10">
              <span className="material-symbols-outlined text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>lock</span>
            </div>
            <div className="z-10">
              <h2 className="font-headline-md text-3xl md:text-4xl font-bold text-on-surface mb-4 tracking-tight">Ready to trade privately?</h2>
              <p className="font-body-base text-lg text-on-surface-variant max-w-md mx-auto">Connect your Sui wallet to open a sealed session.</p>
            </div>

            <div className="w-full max-w-sm z-10">
              <div className="w-full [&>button]:!rounded-xl [&>button]:!text-lg [&>button]:!shadow-[0_0_20px_rgba(45,212,191,0.2)] [&>button]:!transition-all [&>button]:!duration-300 [&>button:hover]:!shadow-[0_0_30px_rgba(45,212,191,0.4)]">
                <LandingConnectButton />
              </div>
            </div>

            <p className="font-mono-sm text-xs text-outline-variant z-10 mt-2">
              By authenticating, you verify clearance for Restricted Order Flow.
            </p>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="relative z-10 border-t border-outline-variant/20 px-6 md:px-12 py-8 flex flex-col sm:flex-row items-center justify-between gap-6 font-mono-sm text-xs text-on-surface-variant/50 bg-[#0A0C10]/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 rounded flex items-center justify-center bg-primary/20 text-primary">
            <span className="material-symbols-outlined text-[12px]">security</span>
          </div>
          <span>SHELL FINANCE · Sui Testnet</span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/docs" className="hover:text-primary transition-colors flex items-center gap-2">
            <span className="material-symbols-outlined text-[14px]">menu_book</span>
            Docs
          </Link>
          <a href={GITHUB} target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors flex items-center gap-2">
            <span className="material-symbols-outlined text-[14px]">code</span>
            GitHub
          </a>
          <span className="px-2 py-1 rounded bg-surface-container-high border border-outline-variant/30 text-on-surface-variant text-[10px]">v2.4.1-TE</span>
        </div>
      </footer>
    </div>
  );
}
