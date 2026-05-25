import LandingConnectButton from '@/components/wallet/LandingConnectButton';

export default function LoginPage() {
  return (
    <>
      <div className="absolute inset-0 bg-grid z-0 pointer-events-none" style={{ backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '32px 32px' }}></div>
      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none bg-[radial-gradient(circle_at_center,rgba(45,212,191,0.15)_0%,transparent_60%)]"></div>
      
      <main className="relative z-10 w-full min-h-screen flex items-center justify-center p-gutter md:p-margin bg-[#0A0C10] text-on-surface font-body-base overflow-hidden selection:bg-primary selection:text-on-primary">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-gutter items-stretch">
          
          {/* Left Panel: Branding & Explainer */}
          <div className="lg:col-span-7 glass-panel rounded-xl p-8 md:p-12 flex flex-col justify-between">
            {/* Header / Logo */}
            <div className="mb-12">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded bg-surface-container-high border border-outline-variant flex items-center justify-center text-primary shadow-[0_0_8px_rgba(45,212,191,0.2)]">
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>security</span>
                </div>
                <h1 className="font-headline-md text-headline-md font-bold tracking-tighter text-on-surface">SHELL FINANCE</h1>
              </div>
              <p className="font-mono-sm text-mono-sm text-primary uppercase tracking-widest">Confidential Order Flow</p>
            </div>
            
            {/* Technical Explainer */}
            <div className="space-y-8 flex-grow flex flex-col justify-center">
              {/* Feature 1 */}
              <div className="flex items-start gap-4 group">
                <div className="mt-1 flex-shrink-0 w-8 h-8 rounded border border-outline-variant bg-surface-container flex items-center justify-center text-on-surface-variant group-hover:border-primary group-hover:text-primary transition-colors">
                  <span className="material-symbols-outlined text-[18px]">enhanced_encryption</span>
                </div>
                <div>
                  <h3 className="font-body-base text-body-base font-semibold text-on-surface mb-1">Seal Encryption</h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">Your intent is private. Orders are encrypted client-side before reaching the matching engine.</p>
                </div>
              </div>
              
              {/* Feature 2 */}
              <div className="flex items-start gap-4 group">
                <div className="mt-1 flex-shrink-0 w-8 h-8 rounded border border-outline-variant bg-surface-container flex items-center justify-center text-on-surface-variant group-hover:border-secondary group-hover:text-secondary transition-colors">
                  <span className="material-symbols-outlined text-[18px]">dns</span>
                </div>
                <div>
                  <h3 className="font-body-base text-body-base font-semibold text-on-surface mb-1">Nautilus Enclave</h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">Match without trust. Execution occurs inside a hardware-secured Trusted Execution Environment.</p>
                </div>
              </div>
              
              {/* Feature 3 */}
              <div className="flex items-start gap-4 group">
                <div className="mt-1 flex-shrink-0 w-8 h-8 rounded border border-outline-variant bg-surface-container flex items-center justify-center text-on-surface-variant group-hover:border-primary group-hover:text-primary transition-colors">
                  <span className="material-symbols-outlined text-[18px]">water_drop</span>
                </div>
                <div>
                  <h3 className="font-body-base text-body-base font-semibold text-on-surface mb-1">DeepBook Settlement</h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">Liquidity without the leak. Atomic settlement on Sui preserves institutional alpha.</p>
                </div>
              </div>
            </div>
            
            {/* Footer Info */}
            <div className="mt-12 pt-6 border-t border-outline-variant/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_4px_rgba(45,212,191,0.5)] animate-pulse"></div>
                <span className="font-mono-sm text-mono-sm text-on-surface-variant">SYSTEM: ONLINE</span>
              </div>
              <span className="font-mono-sm text-mono-sm text-outline">v2.4.1-TE</span>
            </div>
          </div>
          
          {/* Right Panel: Login Actions */}
          <div className="lg:col-span-5 glass-panel rounded-xl p-8 md:p-12 flex flex-col justify-center bg-surface-container-lowest/50">
            <div className="mb-10 text-center">
              <h2 className="font-headline-md text-headline-md text-on-surface mb-2">Authenticate</h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Initialize secure session to access terminal.</p>
            </div>
            
            <div className="space-y-4">
              {/* Primary Wallet Connect */}
              <LandingConnectButton />
              
            </div>
            
            {/* Terms */}
            <div className="mt-8 text-center">
              <p className="font-body-sm text-body-sm text-outline-variant text-[12px]">
                By authenticating, you verify clearance for <br/> Restricted Order Flow.
              </p>
            </div>
          </div>
          
        </div>
      </main>
    </>
  );
}
