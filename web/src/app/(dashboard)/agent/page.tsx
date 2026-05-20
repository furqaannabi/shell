'use client';

import AuditJournal from '@/components/agent/AuditJournal';
import IOIForm from '@/components/agent/IOIForm';
import IOIList from '@/components/agent/IOIList';
import ProposalFeed from '@/components/agent/ProposalFeed';

export default function AgentPage() {
  return (
    <div className="max-w-container-max mx-auto space-y-margin w-full h-full overflow-y-auto pb-8">
      <header className="glass-panel p-6 rounded border border-outline-variant flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="font-headline-md text-headline-md text-on-surface mb-1">
            Agent — Sealed IOI Exchange
          </h1>
          <p className="font-mono-sm text-mono-sm text-on-surface-variant max-w-[640px]">
            Signal interest to trade privately. Your price and size stay
            confidential until a match is found — then both sides confirm
            on the same terms.
          </p>
        </div>
        <div className="text-left md:text-right w-full md:w-auto mt-4 md:mt-0 pt-4 md:pt-0 border-t border-outline-variant md:border-none">
          <div className="text-xs text-on-surface-variant uppercase tracking-widest mb-1">
            Status
          </div>
          <div className="font-mono-data text-primary border border-primary px-3 py-1 rounded inline-block bg-primary/10 shadow-[0_0_8px_rgba(87,241,219,0.3)]">
            ENCLAVE MATCHER LIVE
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-margin">
        <IOIForm />
        <div className="lg:col-span-2">
          <ProposalFeed />
        </div>
      </div>

      <IOIList />

      <AuditJournal />
    </div>
  );
}
