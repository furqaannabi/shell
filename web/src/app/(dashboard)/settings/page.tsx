'use client';

import { useCurrentAccount } from '@mysten/dapp-kit';
import { NETWORK, SHELL_PACKAGE_ID, ENCLAVE_ID, ENCLAVE_CONFIG_ID, ENCLAVE_URL, POOL_ID } from '@/lib/sui';

function truncate(addr: string, chars = 6): string {
  if (addr.length <= chars * 2 + 2) return addr;
  return `${addr.slice(0, chars + 2)}...${addr.slice(-chars)}`;
}

function ConfigRow({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex items-start justify-between py-2 border-b border-outline-variant last:border-0 gap-4">
      <span className="font-mono-sm text-mono-sm text-on-surface-variant shrink-0">{label}</span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono-sm text-[10px] text-secondary hover:text-primary transition-colors break-all text-right"
        >
          {value}
        </a>
      ) : (
        <span className="font-mono-sm text-[10px] text-on-surface break-all text-right">{value}</span>
      )}
    </div>
  );
}

const EXPLORER = (id: string) => `https://suiscan.xyz/${NETWORK}/object/${id}`;

export default function SettingsPage() {
  const account = useCurrentAccount();

  return (
    <div className="w-full h-full overflow-y-auto pb-8 pr-2">
      {/* Header */}
      <div className="mb-8 border-b border-outline-variant pb-4">
        <h1 className="font-headline-md text-headline-md text-on-surface font-semibold">Settings</h1>
        <p className="font-mono-sm text-mono-sm text-on-surface-variant mt-1">Configure enclave parameters and institutional infrastructure.</p>
      </div>

      {/* Bento Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-margin">

        {/* Account & Security Column */}
        <div className="lg:col-span-7 flex flex-col gap-margin">
          {/* Wallet & Authentication */}
          <section className="glass-panel rounded-lg p-6 border border-outline-variant">
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-body-base text-body-base text-primary font-medium tracking-wide">Account &amp; Security</h2>
              <span className="font-mono-sm text-mono-sm text-outline px-2 py-1 bg-surface-container-highest rounded">
                {account ? 'CONNECTED' : 'NOT CONNECTED'}
              </span>
            </div>
            <div className="space-y-6">
              {/* Connected Wallet */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-surface rounded border border-outline-variant hover:bg-surface-container transition-colors gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 shrink-0 rounded-full bg-surface-container-highest flex items-center justify-center border border-outline-variant">
                    <span className={`material-symbols-outlined ${account ? 'text-primary' : 'text-outline-variant'}`}>account_balance_wallet</span>
                  </div>
                  <div>
                    {account ? (
                      <>
                        <div className="font-mono-data text-mono-data text-on-surface" title={account.address}>
                          {truncate(account.address)}
                        </div>
                        <div className="font-mono-sm text-mono-sm text-on-surface-variant">Connected Wallet</div>
                      </>
                    ) : (
                      <>
                        <div className="font-mono-data text-mono-data text-on-surface-variant">—</div>
                        <div className="font-mono-sm text-mono-sm text-outline-variant">No wallet connected</div>
                      </>
                    )}
                  </div>
                </div>
                {account && (
                  <a
                    href={`https://suiscan.xyz/${NETWORK}/account/${account.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1 border border-outline-variant text-on-surface-variant font-mono-sm text-mono-sm rounded hover:border-primary hover:text-primary transition-colors shrink-0 w-full sm:w-auto text-center"
                  >
                    View on Explorer
                  </a>
                )}
              </div>

              {/* zkLogin Status */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-surface rounded border border-outline-variant gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 shrink-0 rounded-full bg-surface-container-highest flex items-center justify-center border border-outline-variant shadow-[0_0_8px_rgba(45,212,191,0.3)]">
                    <span className="material-symbols-outlined text-primary">fingerprint</span>
                  </div>
                  <div>
                    <div className="font-body-base text-body-base text-on-surface font-medium flex items-center gap-2">
                      zkLogin Status
                      <span className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0"></span>
                    </div>
                    <div className="font-mono-sm text-mono-sm text-on-surface-variant">Zero-knowledge proof active for session.</div>
                  </div>
                </div>
                <div className="font-mono-sm text-mono-sm text-primary shrink-0 self-start sm:self-auto">VERIFIED</div>
              </div>
            </div>
          </section>

          {/* API Key Management */}
          <section className="glass-panel rounded-lg p-6 border border-outline-variant">
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-body-base text-body-base text-primary font-medium tracking-wide">API Credentials</h2>
              <button className="flex items-center gap-2 px-3 py-1 bg-surface border border-secondary text-secondary font-mono-sm text-mono-sm rounded hover:shadow-[0_0_8px_rgba(189,194,255,0.3)] transition-all">
                <span className="material-symbols-outlined text-[16px]">add</span> Generate Key
              </button>
            </div>

            <div className="space-y-4">
              <div className="border border-outline-variant rounded overflow-x-auto bg-surface">
                <div className="min-w-[500px]">
                  <div className="grid grid-cols-12 gap-4 p-3 bg-surface-container-low border-b border-outline-variant font-mono-sm text-mono-sm text-on-surface-variant">
                    <div className="col-span-4">KEY NAME</div>
                    <div className="col-span-5">PREFIX</div>
                    <div className="col-span-3 text-right">STATUS</div>
                  </div>
                  <div className="p-4 text-center font-mono-sm text-mono-sm text-outline-variant">
                    No API keys configured
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Settings Columns (Preferences & Infra) */}
        <div className="lg:col-span-5 flex flex-col gap-margin">
          {/* Trade Preferences */}
          <section className="glass-panel rounded-lg p-6 border border-outline-variant">
            <h2 className="font-body-base text-body-base text-primary font-medium tracking-wide mb-6">Trade Preferences</h2>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="font-mono-sm text-mono-sm text-on-surface-variant block">Default Max Slippage (%)</label>
                <div className="relative rounded transition-all focus-within:shadow-[0_0_8px_rgba(189,194,255,0.3)] focus-within:border-[#bdc2ff]">
                  <input
                    className="w-full bg-[#0A0C10] border border-outline-variant rounded p-3 text-on-surface font-mono-data text-mono-data focus:outline-none focus:border-secondary"
                    type="text"
                    defaultValue="0.1"
                  />
                  <span className="absolute top-3 right-3 font-mono-sm text-mono-sm text-outline-variant">ENCRYPTED</span>
                </div>
              </div>

              <hr className="border-outline-variant"/>

              <div className="space-y-4">
                <h3 className="font-mono-sm text-mono-sm text-on-surface-variant">Alert Routing</h3>
                <div className="flex items-center justify-between">
                  <span className="font-body-sm text-body-sm text-on-surface">Security Anomalies</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-9 h-5 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:absolute after:top-[2px] after:left-[2px] after:bg-[#0A0C10] after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary border border-outline-variant"></div>
                  </label>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-body-sm text-body-sm text-on-surface">Fill Receipts (Webhooks)</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-9 h-5 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:absolute after:top-[2px] after:left-[2px] after:bg-[#0A0C10] after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary border border-outline-variant"></div>
                  </label>
                </div>
              </div>
            </div>
          </section>

          {/* Network & Infrastructure */}
          <section className="glass-panel rounded-lg p-6 border border-outline-variant">
            <h2 className="font-body-base text-body-base text-primary font-medium tracking-wide mb-4">Network &amp; Infrastructure</h2>

            {/* Network badge */}
            <div className="flex items-center gap-2 mb-4 p-3 bg-surface rounded border border-outline-variant">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0"></span>
              <span className="font-mono-sm text-mono-sm text-on-surface uppercase tracking-widest">{NETWORK}</span>
              <span className="ml-auto font-mono-sm text-mono-sm text-primary">LIVE</span>
            </div>

            {/* Protocol config */}
            <div className="space-y-0 mb-4">
              <ConfigRow
                label="Package"
                value={truncate(SHELL_PACKAGE_ID)}
                href={EXPLORER(SHELL_PACKAGE_ID)}
              />
              <ConfigRow
                label="Pool"
                value={truncate(POOL_ID)}
                href={EXPLORER(POOL_ID)}
              />
              <ConfigRow
                label="Enclave Object"
                value={truncate(ENCLAVE_ID)}
                href={EXPLORER(ENCLAVE_ID)}
              />
              <ConfigRow
                label="Enclave Config"
                value={truncate(ENCLAVE_CONFIG_ID)}
                href={EXPLORER(ENCLAVE_CONFIG_ID)}
              />
              <ConfigRow
                label="Enclave URL"
                value={ENCLAVE_URL || '—'}
              />
            </div>

            <hr className="border-outline-variant mb-4"/>

            {/* Gas Sponsorship */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-surface rounded border border-outline-variant gap-4">
              <div>
                <div className="font-body-sm text-body-sm text-on-surface font-medium">Gas Sponsorship (Enoki)</div>
                <div className="font-mono-sm text-mono-sm text-on-surface-variant mt-1">Route fees to institutional pool</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 self-start sm:self-auto">
                <input type="checkbox" className="sr-only peer" defaultChecked />
                <div className="w-9 h-5 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:absolute after:top-[2px] after:left-[2px] after:bg-[#0A0C10] after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary border border-outline-variant"></div>
              </label>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
