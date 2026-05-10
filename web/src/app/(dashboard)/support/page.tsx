export default function SupportPage() {
  return (
    <div className="space-y-8 w-full h-full overflow-y-auto pb-8 pr-2">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-outline-variant pb-6">
        <div>
          <h1 className="font-headline-md text-headline-md text-on-surface mb-2">Support Portal</h1>
          <p className="text-on-surface-variant font-body-sm text-body-sm max-w-2xl">Secure communication channels for institutional inquiries, trade reconciliation, and protocol technical assistance.</p>
        </div>
        <div className="glass-panel p-4 rounded flex items-center gap-4 w-full md:w-auto">
          <div className="relative">
            <div className="w-10 h-10 rounded border border-outline-variant bg-surface-container-highest flex items-center justify-center grayscale overflow-hidden">
              <span className="material-symbols-outlined text-on-surface-variant">person</span>
            </div>
            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-primary border-2 border-surface-container rounded-full"></div>
          </div>
          <div>
            <p className="font-mono-sm text-mono-sm text-on-surface-variant uppercase mb-1">Dedicated AM</p>
            <p className="font-body-base text-body-base text-on-surface font-medium">Sarah Jenkins</p>
          </div>
        </div>
      </div>

      {/* Search Area */}
      <div className="relative max-w-3xl mx-auto">
        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
        <input 
          className="w-full bg-surface-container-low border border-outline-variant rounded py-4 pl-12 pr-24 text-on-surface font-mono-data focus:outline-none focus:ring-1 focus:ring-secondary focus:border-secondary transition-all placeholder:text-on-surface-variant/50" 
          placeholder="Search Documentation or Tickets..." 
          type="text"
        />
        <div className="absolute right-4 top-1/2 -translate-y-1/2 font-mono-sm text-mono-sm text-outline-variant tracking-widest uppercase">
          ENCRYPTED
        </div>
      </div>

      {/* Support Categories (Bento) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter">
        <div className="glass-panel p-6 rounded group hover:bg-surface-container-highest/50 transition-colors cursor-pointer">
          <div className="w-12 h-12 border border-outline-variant rounded flex items-center justify-center bg-surface-container mb-4 group-hover:border-primary/50 transition-colors">
            <span className="material-symbols-outlined text-primary">menu_book</span>
          </div>
          <h3 className="font-mono-data text-mono-data text-on-surface mb-2">Technical Docs</h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant">API references, protocol architecture, and node integration guides.</p>
        </div>

        <div className="glass-panel p-6 rounded group hover:bg-surface-container-highest/50 transition-colors cursor-pointer">
          <div className="w-12 h-12 border border-outline-variant rounded flex items-center justify-center bg-surface-container mb-4 group-hover:border-primary/50 transition-colors">
            <span className="material-symbols-outlined text-primary">receipt_long</span>
          </div>
          <h3 className="font-mono-data text-mono-data text-on-surface mb-2">Trade Discrepancies</h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant">Reconcile order execution, slippage reports, and settlement status.</p>
        </div>

        <div className="glass-panel p-6 rounded group hover:bg-surface-container-highest/50 transition-colors cursor-pointer">
          <div className="w-12 h-12 border border-outline-variant rounded flex items-center justify-center bg-surface-container mb-4 group-hover:border-primary/50 transition-colors">
            <span className="material-symbols-outlined text-primary">webhook</span>
          </div>
          <h3 className="font-mono-data text-mono-data text-on-surface mb-2">API Integration</h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant">Assistance with WebSocket connections, rate limits, and authentication.</p>
        </div>

        <div className="glass-panel p-6 rounded group hover:bg-surface-container-highest/50 transition-colors cursor-pointer">
          <div className="w-12 h-12 border border-outline-variant rounded flex items-center justify-center bg-surface-container mb-4 group-hover:border-primary/50 transition-colors">
            <span className="material-symbols-outlined text-primary">account_balance</span>
          </div>
          <h3 className="font-mono-data text-mono-data text-on-surface mb-2">Billing/Fees</h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant">Tiered volume assessments, invoice generation, and fee structures.</p>
        </div>
      </div>

      {/* Active Tickets & CTA */}
      <div className="mt-8 space-y-4">
        <div className="flex justify-between items-end mb-4">
          <h2 className="font-headline-md text-headline-md text-on-surface border-l-2 border-primary pl-3">Active Tickets</h2>
          <button className="bg-primary text-on-primary font-mono-data text-mono-data uppercase py-2 px-6 rounded hover:brightness-110 active:scale-95 transition-all shadow-[0_0_10px_rgba(87,241,219,0.2)]">
            Open New Support Request
          </button>
        </div>
        
        <div className="glass-panel rounded overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-lowest border-b border-outline-variant">
                <th className="py-3 px-4 font-mono-sm text-mono-sm text-on-surface-variant uppercase font-normal">Ticket ID</th>
                <th className="py-3 px-4 font-mono-sm text-mono-sm text-on-surface-variant uppercase font-normal">Subject</th>
                <th className="py-3 px-4 font-mono-sm text-mono-sm text-on-surface-variant uppercase font-normal">Status</th>
                <th className="py-3 px-4 font-mono-sm text-mono-sm text-on-surface-variant uppercase font-normal text-right">Last Updated</th>
              </tr>
            </thead>
            <tbody className="font-body-sm text-body-sm text-on-surface divide-y divide-outline-variant/30">
              <tr className="hover:bg-surface-container-high/30 transition-colors">
                <td className="py-4 px-4 font-mono-data text-outline">REQ-992A-4B</td>
                <td className="py-4 px-4 font-medium">WebSocket Latency Spike during Asia Session</td>
                <td className="py-4 px-4">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-primary/30 text-primary bg-primary/5 rounded font-mono-sm text-[11px] uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span> Open
                  </span>
                </td>
                <td className="py-4 px-4 text-right font-mono-data text-on-surface-variant">10 mins ago</td>
              </tr>
              <tr className="hover:bg-surface-container-high/30 transition-colors">
                <td className="py-4 px-4 font-mono-data text-outline">REQ-881C-2F</td>
                <td className="py-4 px-4 font-medium">Request: Custom Reporting Endpoint Access</td>
                <td className="py-4 px-4">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-secondary/50 text-secondary bg-secondary/5 rounded font-mono-sm text-[11px] uppercase tracking-wider">
                    Pending
                  </span>
                </td>
                <td className="py-4 px-4 text-right font-mono-data text-on-surface-variant">2 hrs ago</td>
              </tr>
              <tr className="hover:bg-surface-container-high/30 transition-colors">
                <td className="py-4 px-4 font-mono-data text-outline">REQ-770X-9E</td>
                <td className="py-4 px-4 font-medium">Fee Tier Re-evaluation Q3</td>
                <td className="py-4 px-4">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-outline-variant text-on-surface-variant rounded font-mono-sm text-[11px] uppercase tracking-wider">
                    Resolved
                  </span>
                </td>
                <td className="py-4 px-4 text-right font-mono-data text-on-surface-variant">Oct 12, 2023</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
