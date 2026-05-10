export default function OperatorPage() {
  return (
    <div className="max-w-container-max mx-auto space-y-margin w-full">
      {/* Enclave Header */}
      <header className="glass-panel p-6 rounded border border-outline-variant flex justify-between items-start">
        <div>
          <h1 className="font-headline-md text-headline-md text-on-surface mb-1">Nautilus Enclave Management</h1>
          <div className="flex items-center gap-4 font-mono-sm text-mono-sm text-on-surface-variant">
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div> 
              ID: ENCL-994A-BX
            </span>
            <span className="text-outline">|</span>
            <span>Region: us-east-secure</span>
            <span className="text-outline">|</span>
            <span>Uptime: 99.999%</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-on-surface-variant uppercase tracking-widest mb-1">PCR Integrity</div>
          <div className="font-mono-data text-primary border border-primary px-3 py-1 rounded inline-block bg-primary/10 shadow-[0_0_8px_rgba(87,241,219,0.3)]">ATTESTED SECURE</div>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-margin">
        {/* PCR Table */}
        <div className="col-span-12 xl:col-span-8 glass-panel rounded border border-outline-variant p-4">
          <div className="flex justify-between items-center mb-4 border-b border-outline-variant pb-2">
            <h2 className="font-body-base text-on-surface font-medium">Registered Platform Configuration Registers (PCRs)</h2>
            <button className="text-xs border border-outline-variant px-2 py-1 rounded hover:border-primary text-on-surface-variant hover:text-primary transition-colors">Add PCR</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono-sm text-mono-sm">
              <thead>
                <tr className="text-on-surface-variant border-b border-outline-variant">
                  <th className="pb-2 font-normal">Index</th>
                  <th className="pb-2 font-normal">Hash (SHA-384)</th>
                  <th className="pb-2 font-normal">Component</th>
                  <th className="pb-2 font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-[#1E293B] hover:bg-[#1A1D23] transition-colors">
                  <td className="py-3 text-on-surface">PCR0</td>
                  <td className="py-3 text-on-surface-variant truncate max-w-[200px]">e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855</td>
                  <td className="py-3 text-on-surface">Core Bios</td>
                  <td className="py-3"><span className="text-primary border border-primary px-2 py-0.5 rounded text-[10px]">APPROVED</span></td>
                </tr>
                <tr className="border-b border-[#1E293B] hover:bg-[#1A1D23] transition-colors">
                  <td className="py-3 text-on-surface">PCR1</td>
                  <td className="py-3 text-on-surface-variant truncate max-w-[200px]">8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92</td>
                  <td className="py-3 text-on-surface">Host Platform</td>
                  <td className="py-3"><span className="text-primary border border-primary px-2 py-0.5 rounded text-[10px]">APPROVED</span></td>
                </tr>
                <tr className="border-b border-[#1E293B] hover:bg-[#1A1D23] transition-colors">
                  <td className="py-3 text-on-surface">PCR8</td>
                  <td className="py-3 text-on-surface-variant truncate max-w-[200px]">ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad</td>
                  <td className="py-3 text-on-surface">Matching Engine OS</td>
                  <td className="py-3"><span className="text-tertiary-container border border-outline-variant px-2 py-0.5 rounded text-[10px]">PENDING</span></td>
                </tr>
                <tr className="hover:bg-[#1A1D23] transition-colors">
                  <td className="py-3 text-on-surface">PCR16</td>
                  <td className="py-3 text-outline-variant truncate max-w-[200px]">c3ab8ff13720e8ad9047dd39466b3c8974e592c2fa383d4a3960714caef0c4f2</td>
                  <td className="py-3 text-outline-variant">Legacy Runtime</td>
                  <td className="py-3"><span className="text-error border border-error/50 px-2 py-0.5 rounded text-[10px] opacity-70">DEPRECATED</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Side Panel Metrics & Alerts */}
        <div className="col-span-12 xl:col-span-4 flex flex-col gap-margin">
          {/* Performance Metrics */}
          <div className="glass-panel rounded border border-outline-variant p-4 flex-1">
            <h2 className="font-body-base text-on-surface font-medium border-b border-outline-variant pb-2 mb-4">Enclave Telemetry</h2>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between font-mono-sm text-mono-sm mb-1">
                  <span className="text-on-surface-variant">Matching Latency</span>
                  <span className="text-primary">1.2ms</span>
                </div>
                <div className="h-1 bg-surface-container-high rounded overflow-hidden">
                  <div className="h-full bg-primary w-1/4"></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between font-mono-sm text-mono-sm mb-1">
                  <span className="text-on-surface-variant">Throughput (TPS)</span>
                  <span className="text-on-surface">14,205</span>
                </div>
                <div className="h-1 bg-surface-container-high rounded overflow-hidden">
                  <div className="h-full bg-secondary w-3/4"></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between font-mono-sm text-mono-sm mb-1">
                  <span className="text-on-surface-variant">Batch Window</span>
                  <span className="text-on-surface">50ms Fixed</span>
                </div>
                <div className="h-1 bg-surface-container-high rounded overflow-hidden">
                  <div className="h-full bg-outline-variant w-full"></div>
                </div>
              </div>
            </div>
          </div>

          {/* Alert Log */}
          <div className="glass-panel rounded border border-outline-variant p-4 flex-1 flex flex-col">
            <h2 className="font-body-base text-on-surface font-medium border-b border-outline-variant pb-2 mb-4 flex justify-between">
              Security Events
              <span className="material-symbols-outlined text-on-surface-variant text-sm">filter_list</span>
            </h2>
            <div className="flex-1 overflow-y-auto space-y-3 font-mono-sm text-mono-sm">
              <div className="flex gap-2">
                <span className="text-primary">▶</span>
                <div>
                  <div className="text-on-surface">Quote Attestation Verified</div>
                  <div className="text-outline-variant text-[10px]">10:42:01.005 UTC</div>
                </div>
              </div>
              <div className="flex gap-2">
                <span className="text-primary">▶</span>
                <div>
                  <div className="text-on-surface">Sealed State Committed</div>
                  <div className="text-outline-variant text-[10px]">10:41:59.120 UTC</div>
                </div>
              </div>
              <div className="flex gap-2">
                <span className="text-secondary">▶</span>
                <div>
                  <div className="text-secondary">Key Exchange Rotated</div>
                  <div className="text-outline-variant text-[10px]">10:15:00.000 UTC</div>
                </div>
              </div>
              <div className="flex gap-2">
                <span className="text-outline-variant">▶</span>
                <div>
                  <div className="text-on-surface-variant">Heartbeat Ack</div>
                  <div className="text-outline-variant text-[10px]">10:14:00.000 UTC</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
