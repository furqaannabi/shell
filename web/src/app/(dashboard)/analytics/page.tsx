export default function AnalyticsPage() {
  return (
    <div className="flex flex-col gap-gutter w-full h-full overflow-y-auto pb-8 pr-2">
      {/* Header */}
      <header className="flex justify-between items-end mb-2">
        <div>
          <h1 className="font-display-lg text-display-lg text-on-surface tracking-tight">Public Analytics</h1>
          <p className="font-mono-sm text-mono-sm text-on-surface-variant mt-2 uppercase tracking-widest opacity-80">Network Transparency Report // Shell-Net-v2</p>
        </div>
        <div className="hidden md:flex gap-2">
          <button className="glass-panel px-3 py-1.5 rounded font-mono-sm text-mono-sm text-on-surface hover:border-primary transition-colors flex items-center gap-2">
            <span className="material-symbols-outlined text-[14px]">calendar_today</span>
            Last 24H
          </button>
        </div>
      </header>

      {/* Hero Stats Bento */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
        {/* Stat 1 */}
        <div className="glass-panel p-4 rounded-lg flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          <div className="flex justify-between items-start mb-6 z-10">
            <span className="font-body-sm text-body-sm text-on-surface-variant">Total Volume (Sealed)</span>
            <span className="material-symbols-outlined text-outline text-[18px]">lock</span>
          </div>
          <div className="z-10">
            <div className="font-mono-data text-headline-md text-primary">$4.28B</div>
            <div className="font-mono-sm text-mono-sm text-primary-fixed-dim mt-1 flex items-center gap-1">
              <span className="material-symbols-outlined text-[12px]">trending_up</span>
              +12.4% vs prev epoch
            </div>
          </div>
        </div>

        {/* Stat 2 */}
        <div className="glass-panel p-4 rounded-lg flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-secondary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          <div className="flex justify-between items-start mb-6 z-10">
            <span className="font-body-sm text-body-sm text-on-surface-variant">Number of Matches</span>
            <span className="material-symbols-outlined text-outline text-[18px]">handshake</span>
          </div>
          <div className="z-10">
            <div className="font-mono-data text-headline-md text-secondary">842,109</div>
            <div className="font-mono-sm text-mono-sm text-on-surface-variant mt-1">
              Avg size: $5,082
            </div>
          </div>
        </div>

        {/* Stat 3 */}
        <div className="glass-panel p-4 rounded-lg flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          <div className="flex justify-between items-start mb-6 z-10">
            <span className="font-body-sm text-body-sm text-on-surface-variant">Average Savings</span>
            <span className="material-symbols-outlined text-outline text-[18px]">savings</span>
          </div>
          <div className="z-10">
            <div className="font-mono-data text-headline-md text-primary-fixed">14.2 bps</div>
            <div className="font-mono-sm text-mono-sm text-on-surface-variant mt-1">
              Slippage Reduction
            </div>
          </div>
        </div>
      </section>

      {/* Charts Bento */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-gutter">
        {/* Volume Histogram */}
        <div className="glass-panel rounded-lg p-4 flex flex-col min-h-[300px]">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-body-base text-body-base text-on-surface">Volume Histogram</h3>
            <div className="flex gap-2 font-mono-sm text-mono-sm">
              <button className="text-primary border-b border-primary px-1">D</button>
              <button className="text-on-surface-variant hover:text-on-surface px-1 transition-colors">W</button>
            </div>
          </div>
          
          {/* Abstract Bar Chart UI */}
          <div className="flex-1 flex items-end gap-1 px-2 border-b border-outline-variant pb-2 relative">
            {/* Grid lines */}
            <div className="absolute w-full border-t border-outline-variant/20 bottom-[25%]"></div>
            <div className="absolute w-full border-t border-outline-variant/20 bottom-[50%]"></div>
            <div className="absolute w-full border-t border-outline-variant/20 bottom-[75%]"></div>
            
            {/* Bars */}
            <div className="w-full flex justify-between items-end h-full relative z-10">
              <div className="w-[6%] h-[30%] bg-primary/40 hover:bg-primary/70 border-t border-primary/50 transition-all cursor-crosshair"></div>
              <div className="w-[6%] h-[45%] bg-primary/40 hover:bg-primary/70 border-t border-primary/50 transition-all cursor-crosshair"></div>
              <div className="w-[6%] h-[25%] bg-primary/40 hover:bg-primary/70 border-t border-primary/50 transition-all cursor-crosshair"></div>
              <div className="w-[6%] h-[60%] bg-primary/40 hover:bg-primary/70 border-t border-primary/50 transition-all cursor-crosshair"></div>
              <div className="w-[6%] h-[80%] bg-primary/60 hover:bg-primary/90 border-t border-primary transition-all cursor-crosshair"></div>
              <div className="w-[6%] h-[55%] bg-primary/40 hover:bg-primary/70 border-t border-primary/50 transition-all cursor-crosshair"></div>
              <div className="w-[6%] h-[70%] bg-primary/40 hover:bg-primary/70 border-t border-primary/50 transition-all cursor-crosshair"></div>
              <div className="w-[6%] h-[40%] bg-primary/40 hover:bg-primary/70 border-t border-primary/50 transition-all cursor-crosshair"></div>
              <div className="w-[6%] h-[90%] bg-primary/80 hover:bg-primary border-t border-primary shadow-[0_0_12px_rgba(45,212,191,0.3)] transition-all cursor-crosshair"></div>
              <div className="w-[6%] h-[65%] bg-primary/40 hover:bg-primary/70 border-t border-primary/50 transition-all cursor-crosshair"></div>
              <div className="w-[6%] h-[50%] bg-primary/40 hover:bg-primary/70 border-t border-primary/50 transition-all cursor-crosshair"></div>
              <div className="w-[6%] h-[35%] bg-primary/40 hover:bg-primary/70 border-t border-primary/50 transition-all cursor-crosshair"></div>
            </div>
          </div>
          <div className="flex justify-between mt-2 font-mono-sm text-mono-sm text-on-surface-variant">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
          </div>
        </div>

        <div className="flex flex-col gap-gutter">
          {/* Fill Quality */}
          <div className="glass-panel rounded-lg p-4 flex-1">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-body-base text-body-base text-on-surface">Fill Quality vs DeepBook</h3>
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">compare_arrows</span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono-sm text-mono-sm text-on-surface-variant">Shell Execution</span>
              <div className="flex-1 mx-4 border-t border-dashed border-primary"></div>
              <span className="font-mono-data text-body-sm text-primary">+8.2 bps</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono-sm text-mono-sm text-on-surface-variant opacity-50">Public Routing</span>
              <div className="flex-1 mx-4 border-t border-solid border-outline-variant"></div>
              <span className="font-mono-data text-body-sm text-on-surface-variant opacity-50">Baseline</span>
            </div>
          </div>

          {/* Matching Window */}
          <div className="glass-panel rounded-lg p-4 flex-1">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-body-base text-body-base text-on-surface">Matching Window (Time Sealed)</h3>
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">hourglass_empty</span>
            </div>
            <div className="w-full h-8 flex rounded-sm overflow-hidden border border-outline-variant">
              <div className="h-full bg-secondary-container w-[15%] border-r border-background hover:opacity-80 transition-opacity" title="< 10ms"></div>
              <div className="h-full bg-secondary/60 w-[45%] border-r border-background hover:opacity-80 transition-opacity" title="10-50ms"></div>
              <div className="h-full bg-surface-tint/60 w-[25%] border-r border-background hover:opacity-80 transition-opacity" title="50-100ms"></div>
              <div className="h-full bg-surface-variant w-[15%] hover:opacity-80 transition-opacity" title="> 100ms"></div>
            </div>
            <div className="flex justify-between mt-2 font-mono-sm text-mono-sm text-on-surface-variant">
              <span className="flex items-center gap-1"><div className="w-2 h-2 bg-secondary-container rounded-full"></div> &lt;10ms</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 bg-secondary/60 rounded-full"></div> 10-50ms</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 bg-surface-tint/60 rounded-full"></div> 50-100ms</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 bg-surface-variant rounded-full"></div> &gt;100ms</span>
            </div>
          </div>
        </div>
      </section>

      {/* Recent Settlements Table */}
      <section className="glass-panel rounded-lg flex flex-col overflow-hidden mb-8">
        <div className="p-4 border-b border-outline-variant flex justify-between items-center bg-surface-container/50">
          <h3 className="font-body-base text-body-base text-on-surface font-medium">Recent Settlements</h3>
          <div className="relative">
            <input 
              className="bg-surface-dim border border-outline-variant rounded py-1 px-3 pl-8 font-mono-sm text-mono-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary w-64 placeholder-on-surface-variant/50" 
              placeholder="Filter by address..." 
              type="text" 
            />
            <span className="material-symbols-outlined text-[14px] absolute left-2.5 top-1.5 text-on-surface-variant">search</span>
            <span className="absolute right-2 top-1 font-mono-sm text-[10px] text-secondary opacity-50">ENCRYPTED</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low">
                <th className="py-2 px-4 font-body-sm text-body-sm text-on-surface-variant font-medium tracking-wide">Time (UTC)</th>
                <th className="py-2 px-4 font-body-sm text-body-sm text-on-surface-variant font-medium tracking-wide">Pair</th>
                <th className="py-2 px-4 font-body-sm text-body-sm text-on-surface-variant font-medium tracking-wide text-right">Size</th>
                <th className="py-2 px-4 font-body-sm text-body-sm text-on-surface-variant font-medium tracking-wide text-right">Execution Price</th>
                <th className="py-2 px-4 font-body-sm text-body-sm text-on-surface-variant font-medium tracking-wide">Sui Digest</th>
              </tr>
            </thead>
            <tbody className="font-mono-data text-mono-data text-on-surface">
              <tr className="border-b border-outline-variant hover:bg-surface-container-highest/50 transition-colors group">
                <td className="py-2.5 px-4 text-on-surface-variant group-hover:text-on-surface">14:22:05.112</td>
                <td className="py-2.5 px-4">SUI/USDC</td>
                <td className="py-2.5 px-4 text-right">150,000.00</td>
                <td className="py-2.5 px-4 text-right text-primary">1.4251</td>
                <td className="py-2.5 px-4 text-secondary/80 flex items-center gap-2">
                  <span>8fA...9c2</span>
                  <span className="material-symbols-outlined text-[12px] opacity-0 group-hover:opacity-100 cursor-pointer">open_in_new</span>
                </td>
              </tr>
              <tr className="border-b border-outline-variant hover:bg-surface-container-highest/50 transition-colors group">
                <td className="py-2.5 px-4 text-on-surface-variant group-hover:text-on-surface">14:21:44.891</td>
                <td className="py-2.5 px-4">ETH/USDC</td>
                <td className="py-2.5 px-4 text-right">45.50</td>
                <td className="py-2.5 px-4 text-right text-primary">3,102.45</td>
                <td className="py-2.5 px-4 text-secondary/80 flex items-center gap-2">
                  <span>2xB...1a4</span>
                  <span className="material-symbols-outlined text-[12px] opacity-0 group-hover:opacity-100 cursor-pointer">open_in_new</span>
                </td>
              </tr>
              <tr className="border-b border-outline-variant hover:bg-surface-container-highest/50 transition-colors group">
                <td className="py-2.5 px-4 text-on-surface-variant group-hover:text-on-surface">14:20:12.004</td>
                <td className="py-2.5 px-4">BTC/USDC</td>
                <td className="py-2.5 px-4 text-right">12.00</td>
                <td className="py-2.5 px-4 text-right text-primary">64,210.00</td>
                <td className="py-2.5 px-4 text-secondary/80 flex items-center gap-2">
                  <span>9yD...7e1</span>
                  <span className="material-symbols-outlined text-[12px] opacity-0 group-hover:opacity-100 cursor-pointer">open_in_new</span>
                </td>
              </tr>
              <tr className="border-b border-outline-variant hover:bg-surface-container-highest/50 transition-colors group">
                <td className="py-2.5 px-4 text-on-surface-variant group-hover:text-on-surface">14:18:55.333</td>
                <td className="py-2.5 px-4">SUI/USDC</td>
                <td className="py-2.5 px-4 text-right">85,400.00</td>
                <td className="py-2.5 px-4 text-right text-primary">1.4248</td>
                <td className="py-2.5 px-4 text-secondary/80 flex items-center gap-2">
                  <span>4cE...2f8</span>
                  <span className="material-symbols-outlined text-[12px] opacity-0 group-hover:opacity-100 cursor-pointer">open_in_new</span>
                </td>
              </tr>
              <tr className="hover:bg-surface-container-highest/50 transition-colors group">
                <td className="py-2.5 px-4 text-on-surface-variant group-hover:text-on-surface">14:15:22.901</td>
                <td className="py-2.5 px-4">SOL/USDC</td>
                <td className="py-2.5 px-4 text-right">1,200.00</td>
                <td className="py-2.5 px-4 text-right text-primary">145.22</td>
                <td className="py-2.5 px-4 text-secondary/80 flex items-center gap-2">
                  <span>1aF...5b9</span>
                  <span className="material-symbols-outlined text-[12px] opacity-0 group-hover:opacity-100 cursor-pointer">open_in_new</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="p-3 border-t border-outline-variant flex justify-center bg-surface-container/30">
          <button className="font-mono-sm text-mono-sm text-primary hover:text-primary-fixed-dim transition-colors flex items-center gap-1">
            Load More <span className="material-symbols-outlined text-[14px]">expand_more</span>
          </button>
        </div>
      </section>
    </div>
  );
}
