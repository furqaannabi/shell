'use client';

import { useState } from 'react';
import SealedOrderForm, { type SubmittedOrder } from '@/components/terminal/SealedOrderForm';
import ActiveOrders from '@/components/terminal/ActiveOrders';
import SettlementReceipts from '@/components/terminal/SettlementReceipts';
import OrderBook from '@/components/terminal/OrderBook';

export default function TerminalPage() {
  const [orders, setOrders] = useState<SubmittedOrder[]>([]);

  function handleOrderSubmitted(order: SubmittedOrder) {
    setOrders((prev) => [order, ...prev]);
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full w-full overflow-y-auto lg:overflow-hidden pb-8 lg:pb-0 pr-2 lg:pr-0">
      {/* Left Panel: Sealed Order Entry */}
      <section className="w-full lg:w-80 flex-shrink-0 flex flex-col gap-4">
        <SealedOrderForm onOrderSubmitted={handleOrderSubmitted} sessionOrders={orders} />
      </section>

      {/* Center Panel: Active Orders */}
      <section className="flex-1 flex flex-col gap-4 min-w-0 w-full min-h-[400px] lg:min-h-0">
        <ActiveOrders orders={orders} />
      </section>

      {/* Right Panel: Order Book & Receipts */}
      <section className="w-full lg:w-80 flex-shrink-0 flex flex-col gap-4 min-h-[600px] lg:min-h-0">
        <OrderBook />
        
        {/* Settlement Receipts — live from chain */}
        <SettlementReceipts />
      </section>
    </div>
  );
}
