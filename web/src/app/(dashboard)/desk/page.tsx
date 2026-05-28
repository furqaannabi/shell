'use client';

import { useState } from 'react';
import ActiveCommitments from '@/components/agent/ActiveCommitments';
import IOIForm from '@/components/agent/IOIForm';
import IOIList from '@/components/agent/IOIList';
import ProposalFeed from '@/components/agent/ProposalFeed';

type Tab = 'proposals' | 'iois' | 'orders';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'proposals', label: 'Match Proposals', icon: 'sync_alt' },
  { id: 'iois', label: 'Active IOIs', icon: 'lock' },
  { id: 'orders', label: 'Open Orders', icon: 'pending_actions' },
];

export default function AgentPage() {
  const [tab, setTab] = useState<Tab>('proposals');

  return (
    <div className="w-full h-full flex flex-col overflow-hidden gap-4">
      {/* Header */}
      <header className="glass-panel px-6 py-4 rounded border border-outline-variant flex flex-col md:flex-row justify-between items-start md:items-center gap-3 shrink-0">
        <div>
          <h1 className="font-headline-md text-headline-md text-on-surface mb-1">IOI Desk</h1>
          <p className="font-mono-sm text-mono-sm text-on-surface-variant max-w-[580px]">
            Signal interest to trade privately. Price and size stay sealed until a match is found — then both sides confirm on the same terms.
          </p>
        </div>
        <div className="shrink-0">
          <div className="font-mono-data text-primary border border-primary px-3 py-1 rounded inline-block bg-primary/10 shadow-[0_0_8px_rgba(87,241,219,0.3)] animate-pulse text-[11px]">
            ENCLAVE MATCHER LIVE
          </div>
        </div>
      </header>

      {/* Main grid */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: IOI submission form */}
        <div className="overflow-y-auto">
          <IOIForm />
        </div>

        {/* Right: tabbed tables panel */}
        <div className="lg:col-span-2 flex flex-col min-h-0 glass-panel rounded border border-outline-variant overflow-hidden">
          {/* Tab bar */}
          <div className="flex shrink-0 border-b border-outline-variant bg-surface-container-high">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 font-mono-sm text-[11px] transition-colors border-b-2 -mb-px cursor-pointer ${
                  tab === t.id
                    ? 'border-primary text-primary bg-primary/5'
                    : 'border-transparent text-on-surface-variant hover:text-on-surface hover:bg-[#1A1D23]'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          {/* Scrollable tab content — no re-mount on tab switch, just hide */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            <div className={tab === 'proposals' ? 'block' : 'hidden'}>
              <ProposalFeed embedded />
            </div>
            <div className={tab === 'iois' ? 'block' : 'hidden'}>
              <IOIList embedded />
            </div>
            <div className={tab === 'orders' ? 'block' : 'hidden'}>
              <ActiveCommitments embedded />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
