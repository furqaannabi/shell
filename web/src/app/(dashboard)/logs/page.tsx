export default function LogsPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] w-full">
      {/* Page Header */}
      <header className="flex items-end justify-between mb-6 shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="font-headline-md text-headline-md tracking-tight text-on-surface">System Logs</h1>
          <div className="flex items-center gap-2 bg-surface-container px-2 py-1 border border-outline-variant rounded-sm">
            <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(45,212,191,0.4)] animate-pulse"></span>
            <span className="font-mono-sm text-mono-sm text-primary tracking-widest uppercase text-[10px]">Live Stream</span>
          </div>
        </div>
        <div className="flex gap-3">
          <button className="h-8 px-4 flex items-center gap-2 border border-outline-variant bg-surface-container-lowest hover:bg-surface-container hover:border-primary transition-all text-on-surface font-mono-data text-mono-data text-xs rounded-sm group">
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant group-hover:text-primary transition-colors">download</span>
            EXPORT CSV
          </button>
        </div>
      </header>

      {/* Workspace Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-gutter flex-1 min-h-0">
        {/* Center Column: Log Stream (9 cols) */}
        <section className="md:col-span-9 flex flex-col h-full gap-4 min-h-0">
          {/* Filter Bar */}
          <div className="bg-surface-container-lowest/80 backdrop-blur-md border border-outline-variant p-2 flex items-center gap-3 shrink-0">
            {/* Search Input */}
            <div className="relative flex-1 group">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-on-surface-variant group-focus-within:text-primary transition-colors">search</span>
              <input 
                className="w-full bg-[#0A0C10] border border-outline-variant rounded-none pl-9 pr-24 py-1.5 text-on-surface font-mono-sm text-mono-sm focus:ring-0 focus:border-secondary transition-colors placeholder:text-on-surface-variant/50" 
                placeholder="Search by Tx Hash, Enclave ID, or Event Type..." 
                type="text"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <span className="font-mono-data text-[8px] tracking-widest text-secondary opacity-0 group-focus-within:opacity-100 transition-opacity">ENCRYPTED</span>
                <div className="px-1.5 py-0.5 bg-surface-container border border-outline-variant text-[10px] text-on-surface-variant font-mono-sm rounded-sm">⌘K</div>
              </div>
            </div>
            
            {/* Dividers */}
            <div className="w-px h-5 bg-outline-variant"></div>
            
            {/* Time Range Picker */}
            <div className="flex gap-1 bg-[#0A0C10] border border-outline-variant p-0.5">
              <button className="px-3 py-1 font-mono-sm text-mono-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors">1H</button>
              <button className="px-3 py-1 font-mono-sm text-mono-sm bg-surface-container text-primary border border-primary/30 shadow-[0_0_8px_rgba(45,212,191,0.1)]">24H</button>
              <button className="px-3 py-1 font-mono-sm text-mono-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors">7D</button>
            </div>
            
            <button className="w-8 h-8 flex items-center justify-center border border-outline-variant bg-[#0A0C10] text-on-surface-variant hover:text-primary hover:border-primary transition-colors">
              <span className="material-symbols-outlined text-[16px]">filter_list</span>
            </button>
          </div>

          {/* Log Table Container */}
          <div className="flex-1 bg-surface-container-lowest/90 backdrop-blur-xl border border-outline-variant flex flex-col overflow-hidden">
            {/* Table Header */}
            <div className="flex border-b border-outline-variant bg-[#0A0C10]/50 py-2 px-4 shrink-0">
              <div className="w-[18%] font-mono-sm text-mono-sm text-on-surface-variant uppercase tracking-wider text-[10px]">Timestamp (UTC)</div>
              <div className="w-[12%] font-mono-sm text-mono-sm text-on-surface-variant uppercase tracking-wider text-[10px]">Level</div>
              <div className="w-[20%] font-mono-sm text-mono-sm text-on-surface-variant uppercase tracking-wider text-[10px]">Module</div>
              <div className="w-[45%] font-mono-sm text-mono-sm text-on-surface-variant uppercase tracking-wider text-[10px]">Message / Hash</div>
              <div className="w-[5%] flex justify-end"></div>
            </div>
            
            {/* Table Body */}
            <div className="flex-1 overflow-y-auto">
              {/* Log Row: INFO */}
              <div className="flex items-start py-2 px-4 border-b border-outline-variant/30 hover:bg-surface-container-highest/40 transition-colors group cursor-pointer">
                <div className="w-[18%] font-mono-data text-mono-data text-on-surface-variant text-[11px] pt-0.5">2023-10-27 14:32:01.451</div>
                <div className="w-[12%] font-mono-data text-mono-data text-on-surface-variant text-[11px] pt-0.5">INFO</div>
                <div className="w-[20%] font-mono-data text-mono-data text-on-surface-variant text-[11px] truncate pr-2 pt-0.5">seal::key_server</div>
                <div className="w-[45%] font-mono-data text-mono-data text-on-surface text-[11px] truncate pr-2 pt-0.5">Ephemeral key generation cycle completed successfully.</div>
                <div className="w-[5%] flex justify-end text-outline-variant group-hover:text-primary transition-colors">
                  <span className="material-symbols-outlined text-[16px]">expand_more</span>
                </div>
              </div>

              {/* Log Row: MATCH (Expanded) */}
              <div className="flex flex-col border-b border-outline-variant/50 bg-primary/5 shadow-[inset_2px_0_0_#2dd4bf]">
                <div className="flex items-start py-2 px-4 cursor-pointer">
                  <div className="w-[18%] font-mono-data text-mono-data text-on-surface-variant text-[11px] pt-0.5">2023-10-27 14:32:04.112</div>
                  <div className="w-[12%] font-mono-data text-mono-data text-primary text-[11px] pt-0.5 font-bold">MATCH</div>
                  <div className="w-[20%] font-mono-data text-mono-data text-on-surface-variant text-[11px] truncate pr-2 pt-0.5">shell::pool::engine</div>
                  <div className="w-[45%] font-mono-data text-mono-data text-on-surface text-[11px] truncate pr-2 pt-0.5">Cross-pool execution confirmed. Settled quantity: 45,000 USDC.</div>
                  <div className="w-[5%] flex justify-end text-primary transition-colors">
                    <span className="material-symbols-outlined text-[16px]">expand_less</span>
                  </div>
                </div>
                
                {/* Expanded Content */}
                <div className="px-4 py-3 bg-[#0A0C10] border-t border-outline-variant/50 shadow-[inset_0_4px_12px_rgba(0,0,0,0.5)]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono-sm text-[10px] text-on-surface-variant uppercase tracking-widest">RAW PAYLOAD</span>
                    <button className="text-on-surface-variant hover:text-primary transition-colors">
                      <span className="material-symbols-outlined text-[14px]">content_copy</span>
                    </button>
                  </div>
                  <pre className="font-mono-data text-[10px] text-primary/80 leading-relaxed overflow-x-auto">
{`{
  "event_id": "evt_9x8f7a6b5c4d3e2f1",
  "type": "ORDER_MATCH_SETTLED",
  "enclave_sig": "0x4a9b...7f1c",
  "details": {
    "maker_order": "ord_881249aa",
    "taker_order": "ord_991249bb",
    "asset_pair": "ETH/USDC",
    "price_execution": "1845.20",
    "volume_matched": "24.3871",
    "latency_ms": 1.4
  },
  "zk_proof_status": "VERIFIED_ON_CHAIN"
}`}
                  </pre>
                </div>
              </div>

              {/* Log Row: WARN */}
              <div className="flex items-start py-2 px-4 border-b border-outline-variant/30 hover:bg-surface-container-highest/40 transition-colors group cursor-pointer">
                <div className="w-[18%] font-mono-data text-mono-data text-on-surface-variant text-[11px] pt-0.5">2023-10-27 14:32:09.881</div>
                <div className="w-[12%] font-mono-data text-mono-data text-tertiary text-[11px] pt-0.5 font-bold">WARN</div>
                <div className="w-[20%] font-mono-data text-mono-data text-on-surface-variant text-[11px] truncate pr-2 pt-0.5">nautilus::router</div>
                <div className="w-[45%] font-mono-data text-mono-data text-on-surface text-[11px] truncate pr-2 pt-0.5">Liquidity fragmentation detected across shards. Optimization required.</div>
                <div className="w-[5%] flex justify-end text-outline-variant group-hover:text-primary transition-colors">
                  <span className="material-symbols-outlined text-[16px]">expand_more</span>
                </div>
              </div>

              {/* Log Row: ERROR */}
              <div className="flex items-start py-2 px-4 border-b border-outline-variant/30 hover:bg-surface-container-highest/40 transition-colors group cursor-pointer bg-error-container/10">
                <div className="w-[18%] font-mono-data text-mono-data text-on-surface-variant text-[11px] pt-0.5">2023-10-27 14:32:15.004</div>
                <div className="w-[12%] font-mono-data text-mono-data text-error text-[11px] pt-0.5 font-bold">ERROR</div>
                <div className="w-[20%] font-mono-data text-mono-data text-on-surface-variant text-[11px] truncate pr-2 pt-0.5">shell::rpc_node</div>
                <div className="w-[45%] font-mono-data text-mono-data text-error text-[11px] truncate pr-2 pt-0.5">Connection timeout to external pricing oracle. Retrying...</div>
                <div className="w-[5%] flex justify-end text-outline-variant group-hover:text-primary transition-colors">
                  <span className="material-symbols-outlined text-[16px]">expand_more</span>
                </div>
              </div>
              
              {/* Log Row: INFO */}
              <div className="flex items-start py-2 px-4 border-b border-outline-variant/30 hover:bg-surface-container-highest/40 transition-colors group cursor-pointer">
                <div className="w-[18%] font-mono-data text-mono-data text-on-surface-variant text-[11px] pt-0.5">2023-10-27 14:32:16.220</div>
                <div className="w-[12%] font-mono-data text-mono-data text-on-surface-variant text-[11px] pt-0.5">INFO</div>
                <div className="w-[20%] font-mono-data text-mono-data text-on-surface-variant text-[11px] truncate pr-2 pt-0.5">seal::attestation</div>
                <div className="w-[45%] font-mono-data text-mono-data text-on-surface text-[11px] truncate pr-2 pt-0.5">Quote verification completed for Node 44-B.</div>
                <div className="w-[5%] flex justify-end text-outline-variant group-hover:text-primary transition-colors">
                  <span className="material-symbols-outlined text-[16px]">expand_more</span>
                </div>
              </div>
            </div>

            {/* Log Footer Status */}
            <div className="border-t border-outline-variant bg-[#0A0C10] p-1.5 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-4 px-2">
                <span className="font-mono-sm text-[9px] text-on-surface-variant tracking-widest uppercase">Stream Active</span>
                <span className="font-mono-sm text-[9px] text-on-surface-variant tracking-widest uppercase">Buffer: 4.2 MB</span>
              </div>
              <div className="flex gap-1">
                <button className="p-1 hover:bg-surface-container rounded text-on-surface-variant hover:text-primary transition-colors">
                  <span className="material-symbols-outlined text-[14px]">keyboard_arrow_left</span>
                </button>
                <button className="p-1 hover:bg-surface-container rounded text-on-surface-variant hover:text-primary transition-colors">
                  <span className="material-symbols-outlined text-[14px]">keyboard_arrow_right</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Right Sidebar (3 cols) */}
        <aside className="hidden md:flex flex-col gap-4 col-span-3 min-h-0">
          {/* Active Enclaves Card */}
          <div className="bg-surface-container-lowest/80 backdrop-blur-md border border-outline-variant flex flex-col">
            <div className="p-3 border-b border-outline-variant bg-surface-container/30 flex items-center justify-between">
              <h3 className="font-mono-data text-xs text-on-surface tracking-wide uppercase">Active Enclaves</h3>
              <span className="material-symbols-outlined text-[14px] text-on-surface-variant">dns</span>
            </div>
            <div className="p-3 flex flex-col gap-3">
              <div className="flex items-center justify-between group cursor-pointer">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_6px_rgba(45,212,191,0.6)]"></span>
                  <div>
                    <div className="font-mono-data text-[11px] text-on-surface group-hover:text-primary transition-colors">ENC_ALPHA_01</div>
                    <div className="font-mono-sm text-[9px] text-on-surface-variant">EU-WEST-3 • 14ms</div>
                  </div>
                </div>
                <span className="font-mono-sm text-[9px] text-primary bg-primary/10 px-1 border border-primary/20 rounded">SEALED</span>
              </div>

              <div className="flex items-center justify-between group cursor-pointer">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_6px_rgba(45,212,191,0.6)]"></span>
                  <div>
                    <div className="font-mono-data text-[11px] text-on-surface group-hover:text-primary transition-colors">ENC_BETA_02</div>
                    <div className="font-mono-sm text-[9px] text-on-surface-variant">US-EAST-1 • 42ms</div>
                  </div>
                </div>
                <span className="font-mono-sm text-[9px] text-primary bg-primary/10 px-1 border border-primary/20 rounded">SEALED</span>
              </div>

              <div className="flex items-center justify-between group cursor-pointer opacity-70">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse"></span>
                  <div>
                    <div className="font-mono-data text-[11px] text-on-surface group-hover:text-on-surface transition-colors">ENC_GAMMA_03</div>
                    <div className="font-mono-sm text-[9px] text-on-surface-variant">AP-NORTHEAST-1 • SYNC</div>
                  </div>
                </div>
                <span className="font-mono-sm text-[9px] text-tertiary border border-tertiary/20 px-1 rounded">ATTESTING</span>
              </div>
            </div>
          </div>

          {/* Log Retention Card */}
          <div className="bg-surface-container-lowest/80 backdrop-blur-md border border-outline-variant flex flex-col">
            <div className="p-3 border-b border-outline-variant bg-surface-container/30 flex items-center justify-between">
              <h3 className="font-mono-data text-xs text-on-surface tracking-wide uppercase">Log Retention</h3>
              <span className="material-symbols-outlined text-[14px] text-on-surface-variant">storage</span>
            </div>
            <div className="p-4 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-end">
                  <span className="font-mono-sm text-[10px] text-on-surface-variant uppercase">Storage Used</span>
                  <span className="font-mono-data text-xs text-on-surface">84.2 GB <span className="text-on-surface-variant text-[10px]">/ 100 GB</span></span>
                </div>
                {/* Tech Progress Bar */}
                <div className="h-1.5 w-full bg-[#0A0C10] border border-outline-variant overflow-hidden relative">
                  <div className="absolute top-0 left-0 h-full bg-primary w-[84%] shadow-[0_0_8px_rgba(45,212,191,0.5)]"></div>
                  <div className="absolute top-0 left-0 w-full h-full bg-[linear-gradient(90deg,transparent_0%,transparent_90%,rgba(10,12,16,0.3)_90%,rgba(10,12,16,0.3)_100%)] bg-[length:4px_100%]"></div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="flex flex-col p-2 bg-[#0A0C10] border border-outline-variant">
                  <span className="font-mono-sm text-[9px] text-on-surface-variant uppercase mb-1">Oldest Record</span>
                  <span className="font-mono-data text-[10px] text-on-surface">30 Days (Max)</span>
                </div>
                <div className="flex flex-col p-2 bg-[#0A0C10] border border-outline-variant">
                  <span className="font-mono-sm text-[9px] text-on-surface-variant uppercase mb-1">Archive Policy</span>
                  <span className="font-mono-data text-[10px] text-primary">S3 Cold Storage</span>
                </div>
              </div>
            </div>
          </div>

          {/* Decorative Tech Element */}
          <div className="mt-auto border border-outline-variant border-dashed p-3 relative overflow-hidden group">
            <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="font-mono-sm text-[9px] text-on-surface-variant leading-relaxed opacity-50">
                &gt; SYS_CHECK_OK <br/>
                &gt; HASH_RATE: 4.2 EH/s <br/>
                &gt; ZERO_KNOWLEDGE_PROOFS: ACTIVE <br/>
                &gt; MEMPOOL_CLEAR: TRUE
            </div>
            <div className="absolute bottom-1 right-2 w-1.5 h-3 bg-primary animate-pulse"></div>
          </div>
        </aside>
      </div>
    </div>
  );
}
