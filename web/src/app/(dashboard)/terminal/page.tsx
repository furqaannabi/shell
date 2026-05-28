'use client';

import { useState, useEffect } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit';
import SealedOrderForm, { type SubmittedOrder } from '@/components/terminal/SealedOrderForm';
import ActiveOrders from '@/components/terminal/ActiveOrders';
import SettlementReceipts from '@/components/terminal/SettlementReceipts';
import ShellActivity from '@/components/terminal/ShellActivity';

function ordersKey(address: string) { return `shell_orders_${address}`; }

function loadOrders(address: string): SubmittedOrder[] {
  try {
    const raw = localStorage.getItem(ordersKey(address));
    return raw ? (JSON.parse(raw) as SubmittedOrder[]) : [];
  } catch { return []; }
}

export default function TerminalPage() {
  const account = useCurrentAccount();
  const [orders, setOrders] = useState<SubmittedOrder[]>([]);

  useEffect(() => {
    setOrders(account ? loadOrders(account.address) : []);
  }, [account?.address]);

  function handleOrderSubmitted(order: SubmittedOrder) {
    if (!account) return;
    setOrders((prev) => {
      const next = [order, ...prev].slice(0, 50);
      localStorage.setItem(ordersKey(account.address), JSON.stringify(next));
      return next;
    });
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full w-full overflow-y-auto lg:overflow-hidden pb-8 lg:pb-0 pr-2 lg:pr-0">
      {/* Left Panel: Sealed Order Entry */}
      <section className="w-full lg:w-80 flex-shrink-0 flex flex-col gap-4">
        <SealedOrderForm onOrderSubmitted={handleOrderSubmitted} />
      </section>

      {/* Center Panel: Active Orders */}
      <section className="flex-1 flex flex-col gap-4 min-w-0 w-full min-h-[400px] lg:min-h-0">
        <ActiveOrders orders={orders} />
      </section>

      {/* Right Panel: Order Book & Receipts */}
      <section className="w-full lg:w-80 flex-shrink-0 flex flex-col gap-4 min-h-[600px] lg:min-h-0">
        <ShellActivity />
        
        {/* Settlement Receipts — live from chain */}
        <SettlementReceipts />
      </section>
    </div>
  );
}
