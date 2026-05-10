export default function OperatorPage() {
  return (
    <div className="max-w-container-max mx-auto space-y-margin w-full h-full overflow-y-auto pb-8 pr-2">
      {/* Top Header Panel: Enclave Status */}
      <section className="glass-panel p-6 rounded border border-outline-variant flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded border border-primary/30 bg-surface-container-low flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-[24px]">security</span>
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="font-headline-md text-[20px] text-on-surface leading-none">Enclave Status</h1>
              <span className="font-mono-sm text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                ACTIVE
              </span>
            </div>
            <div className="font-mono-sm text-mono-sm text-on-surface-variant">
              ID: sgx-zone-alpha-992
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6 lg:gap-12 w-full lg:w-auto">
          <div className="border-l-0 lg:border-l border-outline-variant pl-0 lg:pl-6">
            <div className="font-mono-sm text-mono-sm text-on-surface-variant mb-1">Current PCR0</div>
            <div className="font-mono-data text-[13px] text-secondary">0x8f3c7d9e1a2b4c5d...b2a1</div>
          </div>
          <div className="border-l-0 lg:border-l border-outline-variant pl-0 lg:pl-6">
            <div className="font-mono-sm text-mono-sm text-on-surface-variant mb-1">Matching Window</div>
            <div className="font-mono-sm text-mono-sm text-on-surface flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[14px] text-primary">schedule</span>
              Next match in 08s
            </div>
          </div>
        </div>
      </section>

      {/* Middle Row: Performance & Health */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-margin">
        {/* Enclave Performance Chart */}
        <section className="lg:col-span-8 glass-panel rounded border border-outline-variant p-6 flex flex-col min-h-[300px]">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
            <h2 className="font-body-base text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-on-surface-variant text-[18px]">bar_chart</span>
              Enclave Performance
            </h2>
            <div className="flex gap-2">
              <button className="px-3 py-1 font-mono-sm text-[11px] border border-outline-variant rounded bg-surface text-on-surface-variant hover:text-on-surface transition-colors">Latency</button>
              <button className="px-3 py-1 font-mono-sm text-[11px] border border-primary/50 rounded bg-primary/10 text-primary transition-colors">Throughput</button>
            </div>
          </div>
          
          <div className="flex-1 flex items-end justify-between gap-1 mt-auto relative">
            {/* Chart Grid Lines */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
              <div className="border-t border-outline-variant/20 w-full h-0"></div>
              <div className="border-t border-outline-variant/20 w-full h-0"></div>
              <div className="border-t border-outline-variant/20 w-full h-0"></div>
              <div className="border-t border-outline-variant/20 w-full h-0"></div>
            </div>
            {/* Bars */}
            {[40, 50, 30, 60, 55, 75, 90, 80, 100, 70].map((height, i) => (
              <div key={i} className="w-full bg-outline-variant/40 hover:bg-outline-variant/60 transition-colors relative z-10" style={{ height: `${height}%` }}></div>
            ))}
          </div>
          <div className="flex justify-between font-mono-sm text-[10px] text-outline mt-3">
            <span>10:00</span>
            <span>10:05</span>
            <span>10:10</span>
            <span>10:15</span>
            <span>10:20</span>
          </div>
        </section>

        {/* Protocol Health */}
        <section className="lg:col-span-4 glass-panel rounded border border-outline-variant p-6 flex flex-col">
          <h2 className="font-body-base text-on-surface flex items-center gap-2 mb-6 border-b border-outline-variant pb-4">
            <span className="material-symbols-outlined text-on-surface-variant text-[18px]">health_and_safety</span>
            Protocol Health
          </h2>
          <div className="space-y-6 flex-1">
            <div className="border-b border-outline-variant/50 pb-4">
              <div className="font-mono-sm text-mono-sm text-on-surface-variant mb-2">Active Shared Objects</div>
              <div className="font-headline-md text-headline-md text-on-surface">14,209</div>
            </div>
            <div className="border-b border-outline-variant/50 pb-4">
              <div className="font-mono-sm text-mono-sm text-on-surface-variant mb-2">Treasury Balance</div>
              <div className="font-headline-md text-headline-md text-primary">2.4M <span className="text-on-surface-variant font-mono-sm text-[14px]">SUI</span></div>
            </div>
            <div>
              <div className="font-mono-sm text-mono-sm text-on-surface-variant mb-2">Gas Usage (1h)</div>
              <div className="flex items-end justify-between">
                <div className="font-headline-md text-[20px] text-on-surface">45.2 <span className="text-on-surface-variant font-mono-sm text-[14px]">SUI</span></div>
                <span className="material-symbols-outlined text-error text-[18px]">trending_up</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Bottom Row: Registry & Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-margin">
        {/* PCR Registry */}
        <section className="lg:col-span-8 glass-panel rounded border border-outline-variant p-6 flex flex-col">
          <div className="flex justify-between items-center mb-4 border-b border-outline-variant pb-4">
            <h2 className="font-body-base text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-on-surface-variant text-[18px]">fact_check</span>
              PCR Registry
            </h2>
            <span className="material-symbols-outlined text-on-surface-variant text-[18px] cursor-pointer">more_horiz</span>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full min-w-[600px] text-left">
              <thead>
                <tr className="font-body-sm text-[13px] text-on-surface font-medium border-b border-outline-variant">
                  <th className="pb-3 font-normal">Binary Version</th>
                  <th className="pb-3 font-normal">Measurement (PCR0)</th>
                  <th className="pb-3 font-normal">Status</th>
                  <th className="pb-3 font-normal text-right">Registered At</th>
                </tr>
              </thead>
              <tbody className="font-mono-sm text-[13px] text-on-surface">
                <tr className="border-b border-outline-variant/30 hover:bg-surface-container-high/30 transition-colors">
                  <td className="py-4">v1.2.4-stable</td>
                  <td className="py-4 text-secondary">0x8f3c...4c5d</td>
                  <td className="py-4">
                    <span className="text-primary border border-primary/40 bg-primary/10 px-2 py-0.5 rounded text-[10px]">APPROVED</span>
                  </td>
                  <td className="py-4 text-right text-on-surface-variant">2023-10-24 14:32Z</td>
                </tr>
                <tr className="border-b border-outline-variant/30 hover:bg-surface-container-high/30 transition-colors">
                  <td className="py-4">v1.2.3-stable</td>
                  <td className="py-4 text-on-surface">0x4a2b9c1e7f3d8a5b</td>
                  <td className="py-4">
                    <span className="text-on-surface-variant border border-outline-variant bg-surface-container px-2 py-0.5 rounded text-[10px]">DEPRECATED</span>
                  </td>
                  <td className="py-4 text-right text-on-surface-variant">2023-10-15 09:11Z</td>
                </tr>
                <tr className="hover:bg-surface-container-high/30 transition-colors">
                  <td className="py-4">v1.3.0-rc1</td>
                  <td className="py-4 text-on-surface">0x1e5d9a2b4c7f3c8a</td>
                  <td className="py-4">
                    <span className="text-secondary border border-secondary/40 bg-secondary/10 px-2 py-0.5 rounded text-[10px]">PENDING</span>
                  </td>
                  <td className="py-4 text-right text-on-surface-variant">2023-10-26 18:45Z</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Alert Log */}
        <section className="lg:col-span-4 glass-panel rounded border border-outline-variant p-6 flex flex-col">
          <h2 className="font-body-base text-on-surface flex items-center justify-between mb-4 border-b border-outline-variant pb-4">
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-on-surface-variant text-[18px]">terminal</span>
              Alert Log
            </span>
            <span className="w-2 h-2 rounded-full bg-outline-variant"></span>
          </h2>
          <div className="flex-1 overflow-y-auto space-y-1 font-mono-sm text-[11px] max-h-[300px]">
            <div className="flex gap-3 py-2">
              <span className="text-outline-variant shrink-0">10:24:01</span>
              <span className="text-primary shrink-0">[INFO]</span>
              <span className="text-on-surface">Attestation quote verified successfully for enclave sgx-zone-alpha-992</span>
            </div>
            <div className="flex gap-3 py-2">
              <span className="text-outline-variant shrink-0">10:24:00</span>
              <span className="text-primary shrink-0">[INFO]</span>
              <span className="text-on-surface">Initiating key release protocol...</span>
            </div>
            <div className="flex gap-3 py-2">
              <span className="text-outline-variant shrink-0">10:23:45</span>
              <span className="text-on-surface shrink-0">[MATCH]</span>
              <span className="text-on-surface-variant">Batch #48291 sealed and executed. 142 orders matched.</span>
            </div>
            <div className="flex gap-3 py-2 bg-error/10 border border-error/20 rounded px-2 -mx-2 text-error">
              <span className="text-error/70 shrink-0">10:15:22</span>
              <span className="font-semibold shrink-0">[WARN]</span>
              <span>High latency detected in RPC node connection (150ms).</span>
            </div>
            <div className="flex gap-3 py-2">
              <span className="text-outline-variant shrink-0">10:10:05</span>
              <span className="text-primary shrink-0">[INFO]</span>
              <span className="text-on-surface">Heartbeat received from all active nodes.</span>
            </div>
            <div className="flex gap-3 py-2">
              <span className="text-outline-variant shrink-0">10:05:00</span>
              <span className="text-on-surface shrink-0">[MATCH]</span>
              <span className="text-on-surface-variant">Batch #48290 sealed and executed. 89 orders matched.</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
