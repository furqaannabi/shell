'use client';

import { useSuiClient } from '@mysten/dapp-kit';
import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import {
  SHELL_PACKAGE_ID,
  SHELL_PACKAGE_ID_IOI_TYPES,
  ENCLAVE_ID,
  NETWORK,
} from '@/lib/sui';

type LogEntry = {
  id: string;
  timestampMs: string;
  type: 'ORDER' | 'IOI' | 'MATCH';
  summary: string;
  txDigest: string;
};

function truncateAddr(addr: string, chars = 4): string {
  if (!addr || addr.length <= chars * 2 + 2) return addr;
  return `${addr.slice(0, chars + 2)}...${addr.slice(-chars)}`;
}

function formatTime(ms: string | null | undefined): string {
  if (!ms) return '—';
  return new Date(Number(ms)).toISOString().replace('T', ' ').slice(0, 23);
}

const EXPLORER_TX = (digest: string) => `https://suiscan.xyz/${NETWORK}/tx/${digest}`;
const EXPLORER_OBJ = (id: string) => `https://suiscan.xyz/${NETWORK}/object/${id}`;

export default function LogsPage() {
  const suiClient = useSuiClient();
  const [search, setSearch] = useState('');

  const { data: orderEvents } = useQuery({
    queryKey: ['logs-orders'],
    queryFn: () =>
      suiClient.queryEvents({
        query: { MoveEventType: `${SHELL_PACKAGE_ID}::pool::OrderSubmitted` },
        limit: 50,
        order: 'descending',
      }),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const { data: ioiEvents } = useQuery({
    queryKey: ['logs-iois'],
    queryFn: () =>
      suiClient.queryEvents({
        query: { MoveEventType: `${SHELL_PACKAGE_ID_IOI_TYPES}::ioi::IoisPosted` },
        limit: 50,
        order: 'descending',
      }),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const { data: matchEvents } = useQuery({
    queryKey: ['logs-matches'],
    queryFn: () =>
      suiClient.queryEvents({
        query: { MoveEventType: `${SHELL_PACKAGE_ID_IOI_TYPES}::ioi::MatchProposed` },
        limit: 50,
        order: 'descending',
      }),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const entries = useMemo<LogEntry[]>(() => {
    const out: LogEntry[] = [];

    for (const ev of orderEvents?.data ?? []) {
      const j = ev.parsedJson as { trader?: string; order_id?: string } | null;
      out.push({
        id: ev.id.txDigest + ev.id.eventSeq,
        timestampMs: ev.timestampMs ?? '',
        type: 'ORDER',
        summary: j?.trader ? `Trader ${truncateAddr(j.trader)}` : 'Order submitted',
        txDigest: ev.id.txDigest,
      });
    }

    for (const ev of ioiEvents?.data ?? []) {
      const j = ev.parsedJson as { agent_id?: string } | null;
      out.push({
        id: ev.id.txDigest + ev.id.eventSeq,
        timestampMs: ev.timestampMs ?? '',
        type: 'IOI',
        summary: j?.agent_id ? `Agent ${truncateAddr(j.agent_id)}` : 'IOI posted',
        txDigest: ev.id.txDigest,
      });
    }

    for (const ev of matchEvents?.data ?? []) {
      const j = ev.parsedJson as { buy_agent?: string; sell_agent?: string } | null;
      out.push({
        id: ev.id.txDigest + ev.id.eventSeq,
        timestampMs: ev.timestampMs ?? '',
        type: 'MATCH',
        summary:
          j?.buy_agent && j?.sell_agent
            ? `${truncateAddr(j.buy_agent)} ↔ ${truncateAddr(j.sell_agent)}`
            : 'Match proposed',
        txDigest: ev.id.txDigest,
      });
    }

    return out.sort((a, b) => Number(b.timestampMs) - Number(a.timestampMs));
  }, [orderEvents, ioiEvents, matchEvents]);

  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter(
      (e) =>
        e.type.toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q) ||
        e.txDigest.toLowerCase().includes(q),
    );
  }, [entries, search]);

  const badgeClass = (type: LogEntry['type']) => {
    if (type === 'ORDER') return 'text-primary border-primary/40 bg-primary/10';
    if (type === 'IOI') return 'text-secondary border-secondary/40 bg-secondary/10';
    return 'text-teal-400 border-teal-400/40 bg-teal-400/10';
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden gap-gutter">
      {/* Header */}
      <header className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="font-headline-md text-headline-md tracking-tight text-on-surface">System Logs</h1>
          <div className="flex items-center gap-2 bg-surface-container px-2 py-1 border border-outline-variant rounded">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
            <span className="font-mono-sm text-[10px] text-primary tracking-widest uppercase">Live</span>
          </div>
        </div>
        <span className="font-mono-sm text-[10px] text-on-surface-variant">{filtered.length} events</span>
      </header>

      <div className="flex flex-col md:flex-row gap-gutter flex-1 min-h-0">
        {/* Main feed */}
        <div className="flex-1 glass-panel rounded border border-outline-variant flex flex-col overflow-hidden min-h-0">
          {/* Search bar */}
          <div className="px-4 py-2 border-b border-outline-variant bg-surface-container-low/50 shrink-0">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-on-surface-variant">search</span>
              <input
                className="w-full bg-surface-container-lowest border border-outline-variant rounded pl-9 pr-4 py-1.5 font-mono-sm text-mono-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-secondary transition-colors"
                placeholder="Filter by type, address, or tx hash..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Table header */}
          <div className="grid grid-cols-[1fr_3rem_3fr_4.5rem] gap-2 px-4 py-2 border-b border-outline-variant bg-surface-container-lowest/80 shrink-0">
            <div className="font-mono-sm text-[10px] text-on-surface-variant uppercase tracking-wider">Time (UTC)</div>
            <div className="font-mono-sm text-[10px] text-on-surface-variant uppercase tracking-wider">Type</div>
            <div className="font-mono-sm text-[10px] text-on-surface-variant uppercase tracking-wider">Summary</div>
            <div className="font-mono-sm text-[10px] text-on-surface-variant uppercase tracking-wider text-right">Tx</div>
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-on-surface-variant">
                <span className="material-symbols-outlined text-[28px] opacity-20">terminal</span>
                <span className="font-mono-sm text-[11px]">
                  {search ? 'No matching events' : 'No events yet'}
                </span>
              </div>
            ) : (
              filtered.map((e) => (
                <div
                  key={e.id}
                  className="grid grid-cols-[1fr_3rem_3fr_4.5rem] gap-2 px-4 py-2 border-b border-outline-variant/30 hover:bg-surface-container-high/30 transition-colors"
                >
                  <div className="font-mono-data text-[10px] text-on-surface-variant truncate">
                    {formatTime(e.timestampMs)}
                  </div>
                  <div>
                    <span className={`font-mono-sm text-[9px] border px-1 py-0.5 rounded ${badgeClass(e.type)}`}>
                      {e.type}
                    </span>
                  </div>
                  <div className="font-mono-data text-[11px] text-on-surface truncate">{e.summary}</div>
                  <div className="text-right">
                    <a
                      href={EXPLORER_TX(e.txDigest)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono-sm text-[10px] text-secondary hover:text-primary transition-colors"
                    >
                      {truncateAddr(e.txDigest, 3)}
                    </a>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="w-full md:w-56 flex flex-col gap-gutter flex-shrink-0">
          {/* Enclave */}
          <div className="glass-panel rounded border border-outline-variant p-4">
            <div className="font-mono-sm text-[10px] text-on-surface-variant uppercase tracking-wider mb-3">Active Enclave</div>
            <div className="flex items-start gap-2">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse mt-1 shrink-0"></span>
              <div className="min-w-0">
                <a
                  href={EXPLORER_OBJ(ENCLAVE_ID)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono-data text-[11px] text-on-surface hover:text-primary transition-colors break-all"
                >
                  {truncateAddr(ENCLAVE_ID, 5)}
                </a>
                <div className="font-mono-sm text-[10px] text-on-surface-variant mt-1 capitalize">{NETWORK} · AWS Nitro</div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="font-mono-sm text-[9px] text-on-surface-variant">Status</span>
              <span className="font-mono-sm text-[9px] text-primary border border-primary/30 px-1.5 py-0.5 rounded bg-primary/10">ACTIVE</span>
            </div>
          </div>

          {/* Event counts */}
          <div className="glass-panel rounded border border-outline-variant p-4">
            <div className="font-mono-sm text-[10px] text-on-surface-variant uppercase tracking-wider mb-3">Feed (last 50 each)</div>
            <div className="space-y-2">
              {[
                { label: 'Orders', count: orderEvents?.data.length, type: 'ORDER' as const },
                { label: 'IOIs', count: ioiEvents?.data.length, type: 'IOI' as const },
                { label: 'Matches', count: matchEvents?.data.length, type: 'MATCH' as const },
              ].map(({ label, count, type }) => (
                <div key={label} className="flex justify-between items-center font-mono-sm text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${type === 'ORDER' ? 'bg-primary' : type === 'IOI' ? 'bg-secondary' : 'bg-teal-400'}`}></span>
                    <span className="text-on-surface-variant">{label}</span>
                  </div>
                  <span className="text-on-surface">{count ?? '—'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
