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
      <div className="mb-8 border-b border-outline-variant pb-4">
        <h1 className="font-headline-md text-headline-md text-on-surface font-semibold">Settings</h1>
        <p className="font-mono-sm text-mono-sm text-on-surface-variant mt-1">Protocol configuration and connected wallet.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-margin">

        {/* Account */}
        <div className="lg:col-span-7 flex flex-col gap-margin">
          <section className="glass-panel rounded-lg p-6 border border-outline-variant">
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-body-base text-body-base text-primary font-medium tracking-wide">Account</h2>
              <span className="font-mono-sm text-mono-sm text-outline px-2 py-1 bg-surface-container-highest rounded">
                {account ? 'CONNECTED' : 'NOT CONNECTED'}
              </span>
            </div>
            <div className="space-y-4">
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

              {/* zkLogin */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-surface rounded border border-outline-variant gap-4">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 shrink-0 rounded-full bg-surface-container-highest flex items-center justify-center border border-outline-variant ${account ? 'shadow-[0_0_8px_rgba(45,212,191,0.3)]' : ''}`}>
                    <span className={`material-symbols-outlined ${account ? 'text-primary' : 'text-outline-variant'}`}>fingerprint</span>
                  </div>
                  <div>
                    <div className="font-body-base text-body-base text-on-surface font-medium flex items-center gap-2">
                      zkLogin
                      {account && <span className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0"></span>}
                    </div>
                    <div className="font-mono-sm text-mono-sm text-on-surface-variant">
                      {account ? 'Session active.' : 'Not authenticated.'}
                    </div>
                  </div>
                </div>
                <div className={`font-mono-sm text-mono-sm shrink-0 self-start sm:self-auto ${account ? 'text-primary' : 'text-outline-variant'}`}>
                  {account ? 'ACTIVE' : 'INACTIVE'}
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Network & Infrastructure */}
        <div className="lg:col-span-5 flex flex-col gap-margin">
          <section className="glass-panel rounded-lg p-6 border border-outline-variant">
            <h2 className="font-body-base text-body-base text-primary font-medium tracking-wide mb-4">Network &amp; Infrastructure</h2>

            <div className="flex items-center gap-2 mb-4 p-3 bg-surface rounded border border-outline-variant">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0"></span>
              <span className="font-mono-sm text-mono-sm text-on-surface uppercase tracking-widest">{NETWORK}</span>
              <span className="ml-auto font-mono-sm text-mono-sm text-primary">LIVE</span>
            </div>

            <div className="space-y-0">
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
          </section>
        </div>
      </div>
    </div>
  );
}
