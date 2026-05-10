export default function TerminalPage() {
  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full w-full overflow-y-auto lg:overflow-hidden pb-8 lg:pb-0 pr-2 lg:pr-0">
      {/* Left Panel: Sealed Order Entry */}
      <section className="w-full lg:w-80 flex-shrink-0 flex flex-col gap-4">
        <div className="glass-panel glass-panel-active rounded-lg p-4 flex flex-col h-full min-h-[500px] lg:min-h-0">
          <div className="flex justify-between items-center mb-4 pb-2 border-b border-[#1E293B]">
            <h2 className="font-headline-md text-[18px] text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>lock</span>
              Sealed Order
            </h2>
          </div>
          <form className="flex flex-col gap-4 flex-1">
            {/* Ticker */}
            <div className="relative group">
              <label className="block font-mono-sm text-mono-sm text-on-surface-variant mb-1">Asset</label>
              <div className="relative">
                <input className="input-sealed w-full rounded p-2 text-on-surface font-mono-data text-mono-data pr-10" type="text" defaultValue="ETH/USDC" />
                <span className="absolute right-2 top-2 text-primary font-mono-sm text-[10px] opacity-0 group-focus-within:opacity-100 transition-opacity">ENCRYPTED</span>
              </div>
            </div>
            
            {/* Side */}
            <div className="grid grid-cols-2 gap-2">
              <button className="bg-surface-container-high border border-outline-variant text-on-surface py-2 rounded font-mono-sm text-mono-sm hover:border-primary transition-colors cursor-pointer" type="button">Buy</button>
              <button className="bg-error-container/20 border border-error-container/50 text-error py-2 rounded font-mono-sm text-mono-sm hover:bg-error-container/40 transition-colors cursor-pointer" type="button">Sell</button>
            </div>
            
            {/* Size */}
            <div className="relative group">
              <label className="block font-mono-sm text-mono-sm text-on-surface-variant mb-1">Size</label>
              <div className="relative">
                <input className="input-sealed w-full rounded p-2 text-on-surface font-mono-data text-mono-data text-right pr-12" placeholder="0.00" type="text" />
                <span className="absolute right-2 top-2 text-on-surface-variant font-mono-sm">ETH</span>
              </div>
            </div>
            
            {/* Limit Price (Private) */}
            <div className="relative group">
              <label className="block font-mono-sm text-mono-sm text-on-surface-variant mb-1 flex justify-between">
                Limit Price
                <span className="text-secondary text-[10px] border border-secondary/30 px-1 rounded">Private</span>
              </label>
              <div className="relative">
                <input className="input-sealed w-full rounded p-2 text-on-surface font-mono-data text-mono-data text-right pr-12" placeholder="0.00" type="text" />
                <span className="absolute right-2 top-2 text-on-surface-variant font-mono-sm">USDC</span>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              {/* Expiry */}
              <div className="relative group">
                <label className="block font-mono-sm text-mono-sm text-on-surface-variant mb-1">Expiry</label>
                <select className="input-sealed w-full rounded p-2 text-on-surface font-mono-sm text-mono-sm appearance-none cursor-pointer">
                  <option>1 Hour</option>
                  <option>24 Hours</option>
                  <option>GTC</option>
                </select>
              </div>
              {/* Max Slippage */}
              <div className="relative group">
                <label className="block font-mono-sm text-mono-sm text-on-surface-variant mb-1">Max Slippage</label>
                <div className="relative">
                  <input className="input-sealed w-full rounded p-2 text-on-surface font-mono-data text-mono-data text-right pr-6" type="text" defaultValue="0.1" />
                  <span className="absolute right-2 top-2 text-on-surface-variant font-mono-sm">%</span>
                </div>
              </div>
            </div>
            
            <div className="mt-auto pt-4">
              <button className="w-full bg-primary text-on-primary py-3 rounded font-mono-sm text-mono-sm font-bold uppercase tracking-wider hover:opacity-90 transition-opacity shadow-[0_0_8px_rgba(87,241,219,0.3)] flex justify-center items-center gap-2 cursor-pointer" type="button">
                <span className="material-symbols-outlined text-[18px]">verified_user</span> Submit Sealed Order
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* Center Panel: Active Orders */}
      <section className="flex-1 flex flex-col gap-4 min-w-0 w-full min-h-[400px] lg:min-h-0">
        <div className="glass-panel rounded-lg p-4 flex flex-col h-full">
          <div className="flex justify-between items-center mb-4 pb-2 border-b border-[#1E293B]">
            <h2 className="font-headline-md text-[18px] text-on-surface">Active Orders</h2>
            <button className="text-on-surface-variant hover:text-primary transition-colors cursor-pointer">
              <span className="material-symbols-outlined text-[20px]">filter_list</span>
            </button>
          </div>
          <div className="overflow-auto flex-1 w-full">
            <table className="w-full text-left border-collapse min-w-[500px]">
              <thead>
                <tr className="font-mono-sm text-[11px] text-on-surface-variant uppercase tracking-wider border-b border-[#1E293B]">
                  <th className="pb-2 font-normal">Asset</th>
                  <th className="pb-2 font-normal">Side</th>
                  <th className="pb-2 font-normal text-right">Size</th>
                  <th className="pb-2 font-normal text-right">Status</th>
                  <th className="pb-2 font-normal text-right">Expiry</th>
                </tr>
              </thead>
              <tbody className="font-mono-data text-mono-data text-on-surface">
                <tr className="border-b border-transparent hover:bg-surface-container-low transition-colors group">
                  <td className="py-3">ETH/USDC</td>
                  <td className="py-3 text-primary">BUY</td>
                  <td className="py-3 text-right">50.00</td>
                  <td className="py-3 text-right flex items-center justify-end gap-1">
                    <span className="material-symbols-outlined text-[14px] text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>shield</span>
                    <span className="text-secondary text-[12px]">Sealed</span>
                  </td>
                  <td className="py-3 text-right text-on-surface-variant text-[12px]">59m 12s</td>
                </tr>
                <tr className="border-b border-transparent hover:bg-surface-container-low transition-colors group">
                  <td className="py-3">WBTC/USDC</td>
                  <td className="py-3 text-error">SELL</td>
                  <td className="py-3 text-right">2.50</td>
                  <td className="py-3 text-right flex items-center justify-end gap-1">
                    <span className="material-symbols-outlined text-[14px] text-tertiary animate-spin">sync</span>
                    <span className="text-tertiary text-[12px]">Decrypting</span>
                  </td>
                  <td className="py-3 text-right text-on-surface-variant text-[12px]">1h 14m</td>
                </tr>
                <tr className="border-b border-transparent hover:bg-surface-container-low transition-colors group">
                  <td className="py-3">SOL/USDC</td>
                  <td className="py-3 text-primary">BUY</td>
                  <td className="py-3 text-right">1000.00</td>
                  <td className="py-3 text-right flex items-center justify-end gap-1">
                    <span className="material-symbols-outlined text-[14px] text-primary pulse-teal" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
                    <span className="text-primary text-[12px]">Matching</span>
                  </td>
                  <td className="py-3 text-right text-on-surface-variant text-[12px]">GTC</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Right Panel: Order Book & Receipts */}
      <section className="w-full lg:w-80 flex-shrink-0 flex flex-col gap-4 min-h-[600px] lg:min-h-0">
        {/* Depth Reference */}
        <div className="glass-panel rounded-lg p-4 flex flex-col flex-1">
          <div className="flex justify-between items-center mb-2 pb-2 border-b border-[#1E293B]">
            <h2 className="font-headline-md text-[14px] text-on-surface uppercase tracking-wider">DeepBook Reference</h2>
          </div>
          <div className="flex-1 overflow-auto flex flex-col text-[11px] font-mono-data text-on-surface-variant min-h-[200px]">
            <div className="flex justify-between py-1 px-1 hover:bg-surface-container-low relative">
              <div className="absolute right-0 top-0 bottom-0 bg-error-container/10 w-[80%] z-0"></div>
              <span className="text-error relative z-10">3,452.10</span>
              <span className="relative z-10">12.5</span>
            </div>
            <div className="flex justify-between py-1 px-1 hover:bg-surface-container-low relative">
              <div className="absolute right-0 top-0 bottom-0 bg-error-container/10 w-[60%] z-0"></div>
              <span className="text-error relative z-10">3,451.80</span>
              <span className="relative z-10">4.2</span>
            </div>
            <div className="flex justify-between py-1 px-1 hover:bg-surface-container-low relative">
              <div className="absolute right-0 top-0 bottom-0 bg-error-container/10 w-[20%] z-0"></div>
              <span className="text-error relative z-10">3,451.20</span>
              <span className="relative z-10">1.8</span>
            </div>
            
            <div className="my-2 py-1 text-center font-bold text-on-surface border-y border-[#1E293B]">3,450.50 USDC</div>
            
            <div className="flex justify-between py-1 px-1 hover:bg-surface-container-low relative">
              <div className="absolute right-0 top-0 bottom-0 bg-primary-container/10 w-[30%] z-0"></div>
              <span className="text-primary relative z-10">3,449.90</span>
              <span className="relative z-10">5.0</span>
            </div>
            <div className="flex justify-between py-1 px-1 hover:bg-surface-container-low relative">
              <div className="absolute right-0 top-0 bottom-0 bg-primary-container/10 w-[50%] z-0"></div>
              <span className="text-primary relative z-10">3,449.10</span>
              <span className="relative z-10">8.5</span>
            </div>
            <div className="flex justify-between py-1 px-1 hover:bg-surface-container-low relative">
              <div className="absolute right-0 top-0 bottom-0 bg-primary-container/10 w-[90%] z-0"></div>
              <span className="text-primary relative z-10">3,448.00</span>
              <span className="relative z-10">22.0</span>
            </div>
          </div>
        </div>
        
        {/* Settlement Receipts */}
        <div className="glass-panel rounded-lg p-4 flex flex-col flex-1">
          <div className="flex justify-between items-center mb-2 pb-2 border-b border-[#1E293B]">
            <h2 className="font-headline-md text-[14px] text-on-surface uppercase tracking-wider">Settlement Receipts</h2>
          </div>
          <div className="flex-1 overflow-auto flex flex-col gap-2 min-h-[200px]">
            <div className="p-2 border border-[#1E293B] rounded bg-surface-container-lowest flex flex-col gap-1 hover:border-secondary/50 transition-colors">
              <div className="flex justify-between font-mono-data text-[12px]">
                <span className="text-primary">BUY ETH</span>
                <span className="text-on-surface">3,445.00</span>
              </div>
              <div className="flex justify-between font-mono-sm text-[10px] text-on-surface-variant">
                <span>Size: 10.0</span>
                <span>CP: 0x8a...4f2</span>
              </div>
              <div className="font-mono-sm text-[9px] text-secondary truncate">Tx: 0x123abc...def456</div>
            </div>
            <div className="p-2 border border-[#1E293B] rounded bg-surface-container-lowest flex flex-col gap-1 hover:border-secondary/50 transition-colors">
              <div className="flex justify-between font-mono-data text-[12px]">
                <span className="text-error">SELL SOL</span>
                <span className="text-on-surface">142.50</span>
              </div>
              <div className="flex justify-between font-mono-sm text-[10px] text-on-surface-variant">
                <span>Size: 500.0</span>
                <span>CP: 0x9b...1e8</span>
              </div>
              <div className="font-mono-sm text-[9px] text-secondary truncate">Tx: 0x789def...abc123</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
