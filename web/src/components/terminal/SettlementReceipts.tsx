'use client';

import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit';
import { useQuery } from '@tanstack/react-query';
import { SHELL_PACKAGE_ID, QUOTE_SYMBOL, NETWORK } from '@/lib/sui';
import { getReceipts } from '@/lib/shell-sdk';

function truncateAddr(addr: string, chars = 4): string {
  if (addr.length <= chars * 2 + 2) return addr;
  return `${addr.slice(0, chars + 2)}...${addr.slice(-chars)}`;
}

/** Format a raw u64 Move value into a human-readable decimal string. */
function formatU64(raw: string, decimals: number): string {
  const n = BigInt(raw);
  const scale = BigInt(10 ** decimals);
  const whole = n / scale;
  const frac = n % scale;
  if (frac === BigInt(0)) return whole.toString();
  return `${whole}.${frac.toString().padStart(decimals, '0').replace(/0+$/, '')}`;
}

export default function SettlementReceipts() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();

  const { data: receipts, isLoading } = useQuery({
    queryKey: ['settlement-receipts', account?.address],
    queryFn: async () => {
      const receipts = await getReceipts(suiClient, {
        shellPackageId: SHELL_PACKAGE_ID,
        owner: account!.address,
      });
      // Sort newest-first by objectId (Sui IDs embed tx digest — higher = newer)
      return receipts.sort((a, b) => b.objectId.localeCompare(a.objectId));
    },
    enabled: !!account,
    refetchInterval: 5_000,
  });

  return (
    <div className="glass-panel rounded-lg p-4 flex flex-col flex-1 overflow-hidden">
      <div className="flex justify-between items-center mb-2 pb-2 border-b border-[#1E293B]">
        <h2 className="font-headline-md text-[14px] text-on-surface uppercase tracking-wider">Settlement Receipts</h2>
        {isLoading && (
          <span className="material-symbols-outlined text-[14px] text-on-surface-variant animate-spin">sync</span>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
        {!account ? (
          <div className="flex-1 flex items-center justify-center font-mono-sm text-mono-sm text-outline-variant">
            Connect wallet to view
          </div>
        ) : receipts && receipts.length > 0 ? (
          receipts.map((receipt) => (
            <a
              key={receipt.objectId}
              href={`https://suiscan.xyz/${NETWORK}/object/${receipt.objectId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 border border-[#1E293B] rounded bg-surface-container-lowest flex flex-col gap-1 hover:border-secondary/50 transition-colors cursor-pointer"
            >
              <div className="flex justify-between font-mono-data text-[12px]">
                <span className="text-primary">FILLED</span>
                <span className="text-on-surface">
                  {formatU64(receipt.fields.filled_price, 6)} {QUOTE_SYMBOL}
                </span>
              </div>
              <div className="flex justify-between font-mono-sm text-[10px] text-on-surface-variant">
                <span>Size: {formatU64(receipt.fields.filled_size, 9)} SUI</span>
                <span>CP: {truncateAddr(receipt.fields.counterparty)}</span>
              </div>
              <div className="font-mono-sm text-[9px] text-secondary truncate">
                {receipt.objectId}
              </div>
            </a>
          ))
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center font-mono-sm text-mono-sm text-outline-variant gap-1">
            <span className="material-symbols-outlined text-[24px] opacity-20">receipt_long</span>
            <span className="text-[11px]">No settlements yet</span>
          </div>
        )}
      </div>
    </div>
  );
}
