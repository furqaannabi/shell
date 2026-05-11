'use client';

import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit';
import { useQuery } from '@tanstack/react-query';
import { SHELL_PACKAGE_ID } from '@/lib/sui';

interface SettlementReceiptFields {
  filled_size: string;
  filled_price: string;
  counterparty: string;
  side?: string;
}

interface ReceiptData {
  objectId: string;
  fields: SettlementReceiptFields;
}

/** Truncate a Sui address/hash for display */
function truncateAddr(addr: string, chars = 4): string {
  if (addr.length <= chars * 2 + 2) return addr;
  return `${addr.slice(0, chars + 2)}...${addr.slice(-chars)}`;
}

export default function SettlementReceipts() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();

  const { data: receipts, isLoading } = useQuery({
    queryKey: ['settlement-receipts', account?.address],
    queryFn: async (): Promise<ReceiptData[]> => {
      if (!account) return [];

      const res = await suiClient.getOwnedObjects({
        owner: account.address,
        filter: { StructType: `${SHELL_PACKAGE_ID}::pool::SettlementReceipt` },
        options: { showContent: true },
      });

      return res.data
        .filter((obj) => obj.data?.content?.dataType === 'moveObject')
        .map((obj) => ({
          objectId: obj.data!.objectId,
          fields: (obj.data!.content as unknown as { fields: SettlementReceiptFields }).fields,
        }));
    },
    enabled: !!account,
    refetchInterval: 15_000, // poll every 15s for new settlements
  });

  return (
    <div className="glass-panel rounded-lg p-4 flex flex-col flex-1">
      <div className="flex justify-between items-center mb-2 pb-2 border-b border-[#1E293B]">
        <h2 className="font-headline-md text-[14px] text-on-surface uppercase tracking-wider">Settlement Receipts</h2>
        {isLoading && (
          <span className="material-symbols-outlined text-[14px] text-on-surface-variant animate-spin">sync</span>
        )}
      </div>
      <div className="flex-1 overflow-auto flex flex-col gap-2 min-h-[200px]">
        {!account ? (
          <div className="flex-1 flex items-center justify-center font-mono-sm text-mono-sm text-outline-variant">
            Connect wallet to view
          </div>
        ) : receipts && receipts.length > 0 ? (
          receipts.map((receipt) => (
            <div
              key={receipt.objectId}
              className="p-2 border border-[#1E293B] rounded bg-surface-container-lowest flex flex-col gap-1 hover:border-secondary/50 transition-colors"
            >
              <div className="flex justify-between font-mono-data text-[12px]">
                <span className="text-primary">FILLED</span>
                <span className="text-on-surface">{receipt.fields.filled_price}</span>
              </div>
              <div className="flex justify-between font-mono-sm text-[10px] text-on-surface-variant">
                <span>Size: {receipt.fields.filled_size}</span>
                <span>CP: {truncateAddr(receipt.fields.counterparty)}</span>
              </div>
              <div className="font-mono-sm text-[9px] text-secondary truncate">
                Obj: {receipt.objectId}
              </div>
            </div>
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
