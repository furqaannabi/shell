'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

const WALRUS_AGGREGATOR =
  process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR ??
  'https://aggregator.walrus-testnet.walrus.space';

interface JournalRow {
  timestamp_ms: number;
  agent_id: string;
  event: string;
  decision?: {
    decision: string;
    reasoning: string;
    policy_check: boolean;
  };
  proposal?: Record<string, unknown>;
  action_digest?: string;
  notes?: string;
}

/** Reader for shell-agent's per-decision journal blobs on Walrus. Paste
 *  a blob_id (printed by the agent on each append) and the entry is
 *  rendered with the LLM reasoning surfaced. */
export default function AuditJournal() {
  const [blobInput, setBlobInput] = useState('');
  const [activeBlob, setActiveBlob] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['journal-blob', activeBlob],
    queryFn: async (): Promise<JournalRow[]> => {
      if (!activeBlob) return [];
      const res = await fetch(`${WALRUS_AGGREGATOR}/v1/blobs/${activeBlob}`);
      if (!res.ok) throw new Error(`walrus get ${res.status}`);
      const text = await res.text();
      return text
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as JournalRow);
    },
    enabled: !!activeBlob,
  });

  return (
    <div className="glass-panel rounded border border-outline-variant p-4">
      <div className="flex justify-between items-center mb-4 border-b border-outline-variant pb-2">
        <h2 className="font-body-base text-on-surface font-medium">
          Audit Journal
        </h2>
        <span className="font-mono-sm text-mono-sm text-on-surface-variant">
          Walrus-backed
        </span>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setActiveBlob(blobInput.trim() || null);
        }}
        className="flex gap-2 mb-4"
      >
        <input
          value={blobInput}
          onChange={(e) => setBlobInput(e.target.value)}
          placeholder="paste journal blob_id…"
          className="flex-1 bg-surface-container-low border border-outline-variant rounded px-3 py-2 font-mono-sm text-mono-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-primary/10 border border-primary text-primary rounded font-mono-sm text-mono-sm hover:bg-primary/20 transition-colors"
        >
          Load
        </button>
      </form>

      {!activeBlob && (
        <div className="text-on-surface-variant font-mono-sm text-mono-sm py-8 text-center">
          shell-agent prints a journal blob_id on each append. Paste one
          here to see the LLM reasoning + policy check.
        </div>
      )}

      {isLoading && (
        <div className="text-on-surface-variant font-mono-sm text-mono-sm py-6 text-center">
          Loading…
        </div>
      )}

      {error && (
        <div className="text-error font-mono-sm text-mono-sm py-4">
          {(error as Error).message}
        </div>
      )}

      {data && data.length > 0 && (
        <div className="space-y-3">
          {data.map((row, i) => (
            <article
              key={i}
              className="border border-outline-variant rounded p-3 bg-surface-container-low"
            >
              <header className="flex justify-between items-center mb-2 font-mono-sm text-mono-sm">
                <span className="text-primary">{row.event}</span>
                <span className="text-on-surface-variant text-[10px]">
                  {new Date(row.timestamp_ms).toISOString()}
                </span>
              </header>

              {row.decision && (
                <div className="space-y-1 font-mono-sm text-mono-sm">
                  <div className="flex gap-2">
                    <span className="text-on-surface-variant">decision:</span>
                    <span
                      className={
                        row.decision.decision === 'accept_match'
                          ? 'text-primary'
                          : 'text-on-surface'
                      }
                    >
                      {row.decision.decision}
                    </span>
                    <span className="text-on-surface-variant">
                      policy_check=
                    </span>
                    <span
                      className={
                        row.decision.policy_check
                          ? 'text-primary'
                          : 'text-error'
                      }
                    >
                      {String(row.decision.policy_check)}
                    </span>
                  </div>
                  <div className="text-on-surface-variant">
                    {row.decision.reasoning}
                  </div>
                </div>
              )}

              {row.action_digest && (
                <div className="font-mono-sm text-mono-sm text-secondary mt-1">
                  tx: {row.action_digest.slice(0, 12)}…
                </div>
              )}

              {row.notes && (
                <div className="font-mono-sm text-mono-sm text-on-surface-variant mt-1">
                  {row.notes}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
