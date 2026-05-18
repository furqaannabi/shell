'use client';

import { useSuiClient } from '@mysten/dapp-kit';
import { useQuery } from '@tanstack/react-query';
import { ENCLAVE_ID, ENCLAVE_CONFIG_ID, ENCLAVE_URL, NETWORK, SHELL_PACKAGE_ID } from '@/lib/sui';

function truncate(addr: string, chars = 6): string {
  if (!addr || addr === '0x0') return '—';
  if (addr.length <= chars * 2 + 2) return addr;
  return `${addr.slice(0, chars + 2)}...${addr.slice(-chars)}`;
}

const EXPLORER = (id: string) => `https://suiscan.xyz/${NETWORK}/object/${id}`;

export default function EnclavesPage() {
  const suiClient = useSuiClient();

  const { data: configObj, isLoading: configLoading } = useQuery({
    queryKey: ['enclave-config', ENCLAVE_CONFIG_ID],
    queryFn: async () => {
      const obj = await suiClient.getObject({
        id: ENCLAVE_CONFIG_ID,
        options: { showContent: true },
      });
      if (obj.data?.content?.dataType !== 'moveObject') return null;
      return (obj.data.content as unknown as { fields: Record<string, unknown> }).fields;
    },
    enabled: !!ENCLAVE_CONFIG_ID && ENCLAVE_CONFIG_ID !== '0x0',
    staleTime: 60_000,
  });

  const { data: orderCount } = useQuery({
    queryKey: ['total-order-count', SHELL_PACKAGE_ID],
    queryFn: async () => {
      const events = await suiClient.queryEvents({
        query: { MoveEventType: `${SHELL_PACKAGE_ID}::pool::OrderSubmitted` },
        limit: 1,
        order: 'descending',
      });
      return events.data.length > 0 ? '1+' : '0';
    },
    staleTime: 30_000,
  });

  const pcrFields = configObj
    ? (configObj.pcrs as { fields: Record<string, number[]> } | undefined)?.fields ?? null
    : null;

  const pcrRows = pcrFields
    ? (['pos0', 'pos1', 'pos2'] as const).map((key, i) => {
        const raw = pcrFields[key];
        const hex = Array.isArray(raw)
          ? (raw as number[]).map((b) => b.toString(16).padStart(2, '0')).join('')
          : null;
        const allZero = hex ? /^0+$/.test(hex) : true;
        return { label: `PCR${i}`, hex, allZero };
      })
    : null;

  return (
    <div className="max-w-container-max mx-auto space-y-margin w-full">
      {/* Enclave Header */}
      <header className="glass-panel p-6 rounded border border-outline-variant flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="font-headline-md text-headline-md text-on-surface mb-1">Nautilus Enclave Management</h1>
          <div className="flex flex-wrap items-center gap-2 md:gap-4 font-mono-sm text-mono-sm text-on-surface-variant">
            <span className="flex items-center gap-1 shrink-0">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
              <a
                href={EXPLORER(ENCLAVE_ID)}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
                title={ENCLAVE_ID}
              >
                ID: {truncate(ENCLAVE_ID, 4)}
              </a>
            </span>
            <span className="text-outline hidden md:inline">|</span>
            <span className="shrink-0 capitalize">{NETWORK}</span>
            {ENCLAVE_URL && (
              <>
                <span className="text-outline hidden md:inline">|</span>
                <span className="shrink-0 font-mono-sm text-[10px]">{ENCLAVE_URL}</span>
              </>
            )}
          </div>
        </div>
        <div className="text-left md:text-right w-full md:w-auto mt-4 md:mt-0 pt-4 md:pt-0 border-t border-outline-variant md:border-none">
          <div className="text-xs text-on-surface-variant uppercase tracking-widest mb-1">PCR Integrity</div>
          <div className="font-mono-data text-primary border border-primary px-3 py-1 rounded inline-block bg-primary/10 shadow-[0_0_8px_rgba(87,241,219,0.3)]">
            {configLoading
            ? 'CHECKING...'
            : pcrRows?.every((r) => r.allZero)
            ? 'PENDING DEPLOYMENT'
            : pcrRows
            ? 'ATTESTED SECURE'
            : 'ON-CHAIN'}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-margin">
        {/* PCR Table */}
        <div className="lg:col-span-8 glass-panel rounded border border-outline-variant p-4">
          <div className="flex justify-between items-center mb-4 border-b border-outline-variant pb-2 gap-4">
            <h2 className="font-body-base text-on-surface font-medium">Platform Configuration Registers (PCRs)</h2>
            <a
              href={EXPLORER(ENCLAVE_CONFIG_ID)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs border border-outline-variant px-3 py-1.5 rounded hover:border-primary text-on-surface-variant hover:text-primary transition-colors shrink-0 whitespace-nowrap"
            >
              View Config Object
            </a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left font-mono-sm text-mono-sm">
              <thead>
                <tr className="text-on-surface-variant border-b border-outline-variant">
                  <th className="pb-2 font-normal">Register</th>
                  <th className="pb-2 font-normal">Hash (SHA-384)</th>
                  <th className="pb-2 font-normal">Component</th>
                  <th className="pb-2 font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {configLoading ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-on-surface-variant">
                      <span className="material-symbols-outlined text-[14px] animate-spin mr-2">sync</span>
                      Loading on-chain config...
                    </td>
                  </tr>
                ) : pcrRows ? (
                  pcrRows.map(({ label, hex, allZero }, i) => (
                    <tr key={label} className="border-b border-[#1E293B] hover:bg-[#1A1D23] transition-colors last:border-0">
                      <td className="py-3 text-on-surface">{label}</td>
                      <td className="py-3 text-on-surface-variant font-mono-sm text-[10px] truncate max-w-[200px]" title={hex ?? ''}>
                        {allZero ? <span className="text-outline-variant italic">all-zeros (pending deployment)</span> : hex ? `${hex.slice(0, 16)}...${hex.slice(-8)}` : '—'}
                      </td>
                      <td className="py-3 text-on-surface">
                        {['Enclave Image', 'Linux Kernel', 'Application'][i]}
                      </td>
                      <td className="py-3">
                        {allZero
                          ? <span className="text-on-surface-variant border border-outline-variant px-2 py-0.5 rounded text-[10px]">PENDING</span>
                          : <span className="text-primary border border-primary px-2 py-0.5 rounded text-[10px]">REGISTERED</span>
                        }
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-outline-variant font-mono-sm text-[10px]">
                      Could not load config object
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Config IDs */}
          <div className="mt-4 pt-4 border-t border-outline-variant space-y-2">
            <div className="flex justify-between font-mono-sm text-[10px]">
              <span className="text-on-surface-variant">Enclave Object</span>
              <a href={EXPLORER(ENCLAVE_ID)} target="_blank" rel="noopener noreferrer" className="text-secondary hover:text-primary transition-colors" title={ENCLAVE_ID}>
                {truncate(ENCLAVE_ID)}
              </a>
            </div>
            <div className="flex justify-between font-mono-sm text-[10px]">
              <span className="text-on-surface-variant">Config Object</span>
              <a href={EXPLORER(ENCLAVE_CONFIG_ID)} target="_blank" rel="noopener noreferrer" className="text-secondary hover:text-primary transition-colors" title={ENCLAVE_CONFIG_ID}>
                {truncate(ENCLAVE_CONFIG_ID)}
              </a>
            </div>
          </div>
        </div>

        {/* Side Panel */}
        <div className="lg:col-span-4 flex flex-col gap-margin">
          {/* Stats */}
          <div className="glass-panel rounded border border-outline-variant p-4">
            <h2 className="font-body-base text-on-surface font-medium border-b border-outline-variant pb-2 mb-4">Network Stats</h2>
            <div className="space-y-4">
              <div className="flex justify-between font-mono-sm text-mono-sm">
                <span className="text-on-surface-variant">Total Orders Submitted</span>
                <span className="text-primary">{orderCount ?? '—'}</span>
              </div>
              <div className="flex justify-between font-mono-sm text-mono-sm">
                <span className="text-on-surface-variant">Enclave Environment</span>
                <span className="text-on-surface">AWS Nitro</span>
              </div>
              <div className="flex justify-between font-mono-sm text-mono-sm">
                <span className="text-on-surface-variant">Network</span>
                <span className="text-on-surface capitalize">{NETWORK}</span>
              </div>
              <div className="flex justify-between font-mono-sm text-mono-sm">
                <span className="text-on-surface-variant">Enclave URL</span>
                <span className="text-on-surface text-[10px] truncate max-w-[160px]" title={ENCLAVE_URL}>{ENCLAVE_URL || '—'}</span>
              </div>
            </div>
          </div>

          {/* Security Events */}
          <div className="glass-panel rounded border border-outline-variant p-4 flex-1 flex flex-col">
            <h2 className="font-body-base text-on-surface font-medium border-b border-outline-variant pb-2 mb-4 flex justify-between">
              Security Events
              <span className="material-symbols-outlined text-on-surface-variant text-sm">filter_list</span>
            </h2>
            <div className="flex-1 flex items-center justify-center text-on-surface-variant font-mono-sm text-mono-sm text-center px-4">
              <div>
                <span className="material-symbols-outlined text-[24px] opacity-20 block mb-2">event_note</span>
                <span className="text-[11px]">Live event feed requires enclave log stream</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
