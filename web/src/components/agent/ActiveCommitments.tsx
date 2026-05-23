'use client';

import { useState } from 'react';
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from '@mysten/dapp-kit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Transaction } from '@mysten/sui/transactions';
import { getActiveOrders } from '@/lib/shell-sdk';
import { friendlyError } from '@/lib/errors';
import {
  NETWORK,
  SHELL_PACKAGE_ID,
  SHELL_PACKAGE_ID_LATEST,
} from '@/lib/sui';

interface AliveRow {
  orderId: string;
  collateralType: string;
  collateralValue: bigint;
  collateralDecimals: number;
  collateralSymbol: string;
  expiryEpoch: number;
}

function shortObj(id: string): string {
  return `${id.slice(0, 10)}…${id.slice(-4)}`;
}

function formatScaled(raw: bigint, decimals: number): string {
  const scale = BigInt(10 ** decimals);
  const whole = raw / scale;
  const frac = raw % scale;
  if (frac === BigInt(0)) return whole.toString();
  return `${whole}.${frac
    .toString()
    .padStart(decimals, '0')
    .replace(/0+$/, '')}`;
}

// SUI = 9 decimals; testnet DUSDC and DBUSDC are both 6.
function coinMetaFor(coinType: string): { symbol: string; decimals: number } {
  if (coinType === '0x2::sui::SUI') return { symbol: 'SUI', decimals: 9 };
  const sym = coinType.split('::').pop() ?? 'COIN';
  return { symbol: sym, decimals: 6 };
}

export default function ActiveCommitments() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const queryClient = useQueryClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  const [cancelling, setCancelling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['alive-commitments-cancel-ui', account?.address],
    queryFn: async (): Promise<AliveRow[]> => {
      if (!account) return [];
      const orders = await getActiveOrders(suiClient, {
        shellPackageId: SHELL_PACKAGE_ID,
        trader: account.address,
      });
      if (orders.length === 0) return [];
      const objs = await suiClient.multiGetObjects({
        ids: orders.map((o) => o.orderId),
        options: { showContent: true },
      });
      return orders
        .map((o): AliveRow | null => {
          const obj = objs.find((x) => x.data?.objectId === o.orderId);
          if (obj?.data?.content?.dataType !== 'moveObject') return null;
          const fields = obj.data.content.fields as { collateral?: string };
          const meta = coinMetaFor(o.collateralType);
          return {
            orderId: o.orderId,
            collateralType: o.collateralType,
            collateralValue: BigInt(fields.collateral ?? '0'),
            collateralDecimals: meta.decimals,
            collateralSymbol: meta.symbol,
            expiryEpoch: o.expiryEpoch,
          };
        })
        .filter((x): x is AliveRow => x !== null);
    },
    enabled: !!account,
    refetchInterval: 10_000,
  });

  async function handleCancel(row: AliveRow): Promise<void> {
    if (!account) return;
    setError(null);
    setCancelling(row.orderId);
    try {
      const tx = new Transaction();
      const [refund] = tx.moveCall({
        target: `${SHELL_PACKAGE_ID_LATEST}::pool::cancel_anytime`,
        typeArguments: [row.collateralType],
        arguments: [tx.object(row.orderId)],
      });
      tx.transferObjects([refund], tx.pure.address(account.address));
      const res = await signAndExecute({ transaction: tx });
      await suiClient.waitForTransaction({ digest: res.digest });
      queryClient.invalidateQueries({
        queryKey: ['alive-commitments-cancel-ui'],
      });
      queryClient.invalidateQueries({
        queryKey: ['alive-orders-with-collateral'],
      });
    } catch (err) {
      setError(friendlyError(err, 'Cancel failed'));
    } finally {
      setCancelling(null);
    }
  }

  if (!account) return null;

  return (
    <div className="glass-panel rounded border border-outline-variant p-4">
      <div className="flex justify-between items-center mb-4 border-b border-outline-variant pb-2">
        <h2 className="font-body-base text-on-surface font-medium">
          Active Commitments
        </h2>
        <span className="font-mono-sm text-mono-sm text-on-surface-variant">
          {data?.length ?? 0} alive
        </span>
      </div>

      {error && (
        <div className="font-mono-sm text-mono-sm text-error mb-3">{error}</div>
      )}

      {isLoading ? (
        <div className="text-on-surface-variant font-mono-sm text-mono-sm py-6 text-center">
          Loading…
        </div>
      ) : data && data.length > 0 ? (
        <table className="w-full text-left font-mono-sm text-mono-sm">
          <thead>
            <tr className="text-on-surface-variant border-b border-outline-variant">
              <th className="pb-2 pr-3 font-normal">Order</th>
              <th className="pb-2 pr-3 font-normal text-right">Collateral</th>
              <th className="pb-2 pr-3 font-normal text-right">Expires</th>
              <th className="pb-2 font-normal text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => {
              const isCancelling = cancelling === row.orderId;
              return (
                <tr
                  key={row.orderId}
                  className="border-b border-[#1E293B] last:border-0 hover:bg-[#1A1D23] transition-colors"
                >
                  <td className="py-3 pr-3">
                    <a
                      href={`https://suiscan.xyz/${NETWORK}/object/${row.orderId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-secondary hover:text-primary transition-colors"
                      title={row.orderId}
                    >
                      {shortObj(row.orderId)}
                    </a>
                  </td>
                  <td className="py-3 pr-3 text-right text-on-surface font-mono-data">
                    {formatScaled(row.collateralValue, row.collateralDecimals)}{' '}
                    <span className="text-on-surface-variant">
                      {row.collateralSymbol}
                    </span>
                  </td>
                  <td className="py-3 pr-3 text-right text-on-surface-variant">
                    epoch {row.expiryEpoch}
                  </td>
                  <td className="py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleCancel(row)}
                      disabled={isCancelling}
                      className="bg-error/10 border border-error text-error px-3 py-1 rounded text-[10px] hover:bg-error/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {isCancelling ? 'Cancelling…' : 'Cancel'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className="text-on-surface-variant font-mono-sm text-mono-sm py-8 text-center">
          No active commitments.
        </div>
      )}
    </div>
  );
}
