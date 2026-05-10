export default function VaultsPage() {
  return (
    <div className="flex flex-col lg:flex-row gap-gutter w-full h-full overflow-y-auto lg:overflow-hidden pb-8 lg:pb-0 pr-2 lg:pr-0">
      {/* Left Column: Primary Data */}
      <div className="flex-1 flex flex-col gap-gutter">
        {/* Summary Cards Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-gutter">
          <div className="glass-panel p-6 rounded flex flex-col gap-2">
            <div className="flex items-center justify-between text-on-surface-variant">
              <span className="font-mono-sm text-mono-sm">TOTAL VALUE LOCKED</span>
              <span className="material-symbols-outlined text-[16px]">lock</span>
            </div>
            <div className="font-headline-md text-headline-md text-primary mt-2">
              $14,250,000.00
            </div>
            <div className="font-mono-sm text-mono-sm text-on-surface-variant mt-1 flex items-center gap-1">
              <span className="text-primary">+2.4%</span> vs last week
            </div>
          </div>
          <div className="glass-panel p-6 rounded flex flex-col gap-2">
            <div className="flex items-center justify-between text-on-surface-variant">
              <span className="font-mono-sm text-mono-sm">AVAILABLE COLLATERAL</span>
              <span className="material-symbols-outlined text-[16px]">account_balance</span>
            </div>
            <div className="font-headline-md text-headline-md text-secondary mt-2">
              $3,105,400.00
            </div>
            <div className="font-mono-sm text-mono-sm text-on-surface-variant mt-1 flex items-center gap-1">
              78.2% Utilization
            </div>
          </div>
        </div>

        {/* Vault Assets Table */}
        <div className="glass-panel rounded flex-1 flex flex-col overflow-hidden">
          <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center bg-surface-container-low/50">
            <h3 className="font-headline-md text-body-base">Vault Assets</h3>
            <div className="flex gap-2">
              <button className="p-1.5 border border-outline-variant rounded hover:bg-surface-container-high transition-colors text-on-surface-variant">
                <span className="material-symbols-outlined text-[18px]">search</span>
              </button>
              <button className="p-1.5 border border-outline-variant rounded hover:bg-surface-container-high transition-colors text-on-surface-variant">
                <span className="material-symbols-outlined text-[18px]">filter_list</span>
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full min-w-[800px] text-left border-collapse">
              <thead className="sticky top-0 bg-surface-container-lowest/90 backdrop-blur border-b border-outline-variant z-10">
                <tr>
                  <th className="font-mono-sm text-mono-sm text-on-surface-variant py-3 px-6 font-normal whitespace-nowrap">ASSET</th>
                  <th className="font-mono-sm text-mono-sm text-on-surface-variant py-3 px-6 font-normal text-right whitespace-nowrap">TOTAL BALANCE</th>
                  <th className="font-mono-sm text-mono-sm text-on-surface-variant py-3 px-6 font-normal text-right whitespace-nowrap">SEALED (LOCKED)</th>
                  <th className="font-mono-sm text-mono-sm text-on-surface-variant py-3 px-6 font-normal text-right whitespace-nowrap">AVAILABLE</th>
                  <th className="font-mono-sm text-mono-sm text-on-surface-variant py-3 px-6 font-normal text-right whitespace-nowrap">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="font-mono-data text-mono-data">
                <tr className="border-b border-outline-variant/30 hover:bg-surface-container-high/30 transition-colors group">
                  <td className="py-4 px-6 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#3872E0]/20 flex items-center justify-center text-[#3872E0] border border-[#3872E0]/50">
                      <span className="material-symbols-outlined text-[16px]">water_drop</span>
                    </div>
                    <div>
                      <div className="font-medium text-surface-tint">SUI</div>
                      <div className="font-mono-sm text-mono-sm text-on-surface-variant">Sui Network</div>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-right">1,250,000.00</td>
                  <td className="py-4 px-6 text-right text-on-surface-variant">800,000.00</td>
                  <td className="py-4 px-6 text-right">450,000.00</td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="px-3 py-1 bg-surface border border-outline-variant rounded text-on-surface hover:border-primary hover:text-primary transition-colors text-mono-sm">Deposit</button>
                      <button className="px-3 py-1 bg-surface border border-outline-variant rounded text-on-surface hover:border-secondary hover:text-secondary transition-colors text-mono-sm">Withdraw</button>
                    </div>
                  </td>
                </tr>
                <tr className="border-b border-outline-variant/30 hover:bg-surface-container-high/30 transition-colors group">
                  <td className="py-4 px-6 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#2775CA]/20 flex items-center justify-center text-[#2775CA] border border-[#2775CA]/50">
                      <span className="material-symbols-outlined text-[16px]">currency_exchange</span>
                    </div>
                    <div>
                      <div className="font-medium text-surface-tint">USDC</div>
                      <div className="font-mono-sm text-mono-sm text-on-surface-variant">USD Coin</div>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-right">5,500,000.00</td>
                  <td className="py-4 px-6 text-right text-on-surface-variant">4,000,000.00</td>
                  <td className="py-4 px-6 text-right">1,500,000.00</td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="px-3 py-1 bg-surface border border-outline-variant rounded text-on-surface hover:border-primary hover:text-primary transition-colors text-mono-sm">Deposit</button>
                      <button className="px-3 py-1 bg-surface border border-outline-variant rounded text-on-surface hover:border-secondary hover:text-secondary transition-colors text-mono-sm">Withdraw</button>
                    </div>
                  </td>
                </tr>
                <tr className="border-b border-outline-variant/30 hover:bg-surface-container-high/30 transition-colors group">
                  <td className="py-4 px-6 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#627EEA]/20 flex items-center justify-center text-[#627EEA] border border-[#627EEA]/50">
                      <span className="material-symbols-outlined text-[16px]">token</span>
                    </div>
                    <div>
                      <div className="font-medium text-surface-tint">ETH</div>
                      <div className="font-mono-sm text-mono-sm text-on-surface-variant">Ethereum</div>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-right">1,200.00</td>
                  <td className="py-4 px-6 text-right text-on-surface-variant">950.00</td>
                  <td className="py-4 px-6 text-right">250.00</td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="px-3 py-1 bg-surface border border-outline-variant rounded text-on-surface hover:border-primary hover:text-primary transition-colors text-mono-sm">Deposit</button>
                      <button className="px-3 py-1 bg-surface border border-outline-variant rounded text-on-surface hover:border-secondary hover:text-secondary transition-colors text-mono-sm">Withdraw</button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Right Column: Contextual Sidebar */}
      <div className="w-full lg:w-80 flex flex-col gap-gutter flex-shrink-0 min-h-[500px] lg:min-h-0">
        {/* Collateral Health */}
        <div className="glass-panel rounded p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="font-headline-md text-body-base">Collateral Health</h3>
            <span className="material-symbols-outlined text-on-surface-variant text-[18px]">monitor_heart</span>
          </div>
          <div className="relative w-full h-2 bg-surface-container-highest rounded-full overflow-hidden mt-2">
            <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-primary to-error w-[78%]"></div>
            <div className="absolute top-0 left-[85%] h-full w-[2px] bg-white z-10" title="Liquidation Threshold"></div>
          </div>
          <div className="flex justify-between font-mono-sm text-mono-sm">
            <span className="text-on-surface-variant">Current: 78.2%</span>
            <span className="text-error">Liq: 85.0%</span>
          </div>
          <div className="mt-4 p-3 bg-surface-container-low rounded border border-outline-variant/50">
            <div className="font-mono-sm text-mono-sm text-on-surface-variant mb-1">DEEPBOOK V3 MARGIN</div>
            <div className="flex justify-between items-center">
              <span className="font-body-sm text-body-sm">Active Positions</span>
              <span className="font-mono-data text-mono-data text-primary">4</span>
            </div>
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="glass-panel rounded flex-1 flex flex-col overflow-hidden">
          <div className="px-6 py-4 border-b border-outline-variant bg-surface-container-low/50">
            <h3 className="font-headline-md text-body-base">Recent Activity</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            <div className="p-3 bg-surface border border-outline-variant/30 rounded flex gap-3 hover:bg-surface-container-high/30 transition-colors cursor-default">
              <div className="mt-0.5 text-primary">
                <span className="material-symbols-outlined text-[18px]">arrow_downward</span>
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <span className="font-body-sm text-body-sm">Deposit</span>
                  <span className="font-mono-sm text-mono-sm text-primary">+50,000 USDC</span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="font-mono-sm text-mono-sm text-on-surface-variant">Tx: 0x8f...3a92</span>
                  <span className="font-mono-sm text-mono-sm text-on-surface-variant">2m ago</span>
                </div>
              </div>
            </div>
            
            <div className="p-3 bg-surface border border-outline-variant/30 rounded flex gap-3 hover:bg-surface-container-high/30 transition-colors cursor-default">
              <div className="mt-0.5 text-on-surface-variant">
                <span className="material-symbols-outlined text-[18px]">lock</span>
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <span className="font-body-sm text-body-sm">Collateral Lock</span>
                  <span className="font-mono-sm text-mono-sm text-surface-tint">-100 ETH</span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="font-mono-sm text-mono-sm text-on-surface-variant">Order: #8921</span>
                  <span className="font-mono-sm text-mono-sm text-on-surface-variant">15m ago</span>
                </div>
              </div>
            </div>
            
            <div className="p-3 bg-surface border border-outline-variant/30 rounded flex gap-3 hover:bg-surface-container-high/30 transition-colors cursor-default">
              <div className="mt-0.5 text-secondary">
                <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <span className="font-body-sm text-body-sm">Withdraw</span>
                  <span className="font-mono-sm text-mono-sm text-secondary">-25,000 SUI</span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="font-mono-sm text-mono-sm text-on-surface-variant">Tx: 0x4c...1b77</span>
                  <span className="font-mono-sm text-mono-sm text-on-surface-variant">1h ago</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
