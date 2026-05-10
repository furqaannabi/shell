export default function SettingsPage() {
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
              <span className="font-mono-sm text-mono-sm text-outline px-2 py-1 bg-surface-container-highest rounded">AUTH_REQ</span>
            </div>
            <div className="space-y-6">
              {/* Connected Wallet */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-surface rounded border border-outline-variant hover:bg-surface-container transition-colors gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 shrink-0 rounded-full bg-surface-container-highest flex items-center justify-center border border-outline-variant">
                    <span className="material-symbols-outlined text-primary">account_balance_wallet</span>
                  </div>
                  <div>
                    <div className="font-mono-data text-mono-data text-on-surface">0x7F4A...B921</div>
                    <div className="font-mono-sm text-mono-sm text-on-surface-variant">Connected Wallet (Hardware)</div>
                  </div>
                </div>
                <button className="px-3 py-1 border border-outline-variant text-on-surface-variant font-mono-sm text-mono-sm rounded hover:text-error hover:border-error transition-colors shrink-0 w-full sm:w-auto">
                  Disconnect
                </button>
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
              {/* Key List */}
              <div className="border border-outline-variant rounded overflow-x-auto bg-surface">
                <div className="min-w-[500px]">
                  {/* Header Row */}
                  <div className="grid grid-cols-12 gap-4 p-3 bg-surface-container-low border-b border-outline-variant font-mono-sm text-mono-sm text-on-surface-variant">
                    <div className="col-span-4">KEY NAME</div>
                    <div className="col-span-5">PREFIX</div>
                    <div className="col-span-3 text-right">STATUS</div>
                  </div>
                  
                  {/* Data Rows */}
                  <div className="grid grid-cols-12 gap-4 p-3 border-b border-outline-variant hover:bg-surface-container transition-colors items-center">
                    <div className="col-span-4 font-mono-data text-mono-data text-on-surface">Algorithmic_Prod</div>
                    <div className="col-span-5 font-mono-sm text-mono-sm text-on-surface-variant">sk_live_9f8a...</div>
                    <div className="col-span-3 text-right">
                      <span className="inline-block px-2 py-0.5 bg-primary/10 text-primary font-mono-sm text-mono-sm border border-primary/30 rounded">ACTIVE</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-12 gap-4 p-3 hover:bg-surface-container transition-colors items-center">
                    <div className="col-span-4 font-mono-data text-mono-data text-on-surface">Reporting_Read</div>
                    <div className="col-span-5 font-mono-sm text-mono-sm text-on-surface-variant">sk_test_2b4c...</div>
                    <div className="col-span-3 text-right">
                      <span className="inline-block px-2 py-0.5 bg-outline-variant/30 text-on-surface-variant font-mono-sm text-mono-sm border border-outline-variant rounded">REVOKED</span>
                    </div>
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
              
              {/* Slippage Input */}
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

              {/* Matching Window */}
              <div className="space-y-2">
                <label className="font-mono-sm text-mono-sm text-on-surface-variant block">Matching Window (ms)</label>
                <div className="relative rounded transition-all focus-within:shadow-[0_0_8px_rgba(189,194,255,0.3)] focus-within:border-[#bdc2ff]">
                  <input 
                    className="w-full bg-[#0A0C10] border border-outline-variant rounded p-3 text-on-surface font-mono-data text-mono-data focus:outline-none focus:border-secondary" 
                    type="text" 
                    defaultValue="250"
                  />
                  <span className="absolute top-3 right-3 font-mono-sm text-mono-sm text-outline-variant">ENCRYPTED</span>
                </div>
              </div>

              <hr className="border-outline-variant"/>

              {/* Notifications */}
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
            <h2 className="font-body-base text-body-base text-primary font-medium tracking-wide mb-6">Network &amp; Infrastructure</h2>
            <div className="space-y-6">
              {/* Enclave Preference */}
              <div className="space-y-3">
                <label className="font-mono-sm text-mono-sm text-on-surface-variant block">Enclave Environment</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button className="p-3 border border-primary bg-primary/5 rounded text-primary font-mono-sm text-mono-sm text-center shadow-[0_0_8px_rgba(87,241,219,0.3)] transition-all">
                    AWS Nitro
                  </button>
                  <button className="p-3 border border-outline-variant bg-surface rounded text-on-surface-variant font-mono-sm text-mono-sm text-center hover:border-secondary hover:text-secondary transition-all">
                    Marlin Oyster
                  </button>
                </div>
              </div>

              {/* RPC Node */}
              <div className="space-y-2">
                <label className="font-mono-sm text-mono-sm text-on-surface-variant block">RPC Endpoint</label>
                <div className="relative rounded transition-all">
                  <select className="w-full bg-[#0A0C10] border border-outline-variant rounded p-3 text-on-surface font-mono-data text-mono-data appearance-none focus:outline-none focus:border-secondary">
                    <option>Mainnet (Default, Low Latency)</option>
                    <option>Custom Node...</option>
                  </select>
                  <span className="material-symbols-outlined absolute right-3 top-3 text-outline-variant pointer-events-none">expand_more</span>
                </div>
              </div>

              <hr className="border-outline-variant"/>

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
            </div>
          </section>
        </div>
      </div>

      {/* Action Footer */}
      <div className="mt-8 pt-4 flex flex-col-reverse sm:flex-row justify-end gap-4 border-t border-outline-variant pb-8">
        <button className="px-6 py-2 border border-outline-variant text-on-surface-variant font-mono-sm text-mono-sm font-semibold rounded hover:bg-surface-container transition-colors w-full sm:w-auto">
          Discard Changes
        </button>
        <button className="px-6 py-2 bg-primary text-[#0A0C10] font-mono-sm text-mono-sm font-semibold rounded hover:shadow-[0_0_8px_rgba(45,212,191,0.3)] transition-all w-full sm:w-auto">
          Save Configuration
        </button>
      </div>
    </div>
  );
}
