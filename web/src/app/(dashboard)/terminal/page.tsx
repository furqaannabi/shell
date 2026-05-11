'use client';

import { useState } from 'react';
import SealedOrderForm, { type SubmittedOrder } from '@/components/terminal/SealedOrderForm';
import ActiveOrders from '@/components/terminal/ActiveOrders';
import SettlementReceipts from '@/components/terminal/SettlementReceipts';

export default function TerminalPage() {
  const [orders, setOrders] = useState<SubmittedOrder[]>([]);

  function handleOrderSubmitted(order: SubmittedOrder) {
    setOrders((prev) => [order, ...prev]);
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
        {/* DeepBook Reference — static for now */}
        <div className="glass-panel rounded-lg p-4 flex flex-col flex-1">
          <div className="flex justify-between items-center mb-2 pb-2 border-b border-[#1E293B]">
            <h2 className="font-headline-md text-[14px] text-on-surface uppercase tracking-wider">DeepBook Reference</h2>
          </div>
          <div className="flex-1 overflow-auto flex flex-col text-[11px] font-mono-data text-on-surface-variant min-h-[200px]">
            <div className="flex justify-between py-1 px-1 hover:bg-surface-container-low relative">
              <div className="absolute right-0 top-0 bottom-0 bg-error-container/10 w-[80%] z-0"></div>
              <span className="text-error relative z-10">3,452.10</span>
              <span className="relative z-10">12.5</span>
            </div>
            <div className="flex justify-between py-1 px-1 hover:bg-surface-container-low relative">
              <div className="absolute right-0 top-0 bottom-0 bg-error-container/10 w-[60%] z-0"></div>
              <span className="text-error relative z-10">3,451.80</span>
              <span className="relative z-10">4.2</span>
            </div>
            <div className="flex justify-between py-1 px-1 hover:bg-surface-container-low relative">
              <div className="absolute right-0 top-0 bottom-0 bg-error-container/10 w-[20%] z-0"></div>
              <span className="text-error relative z-10">3,451.20</span>
              <span className="relative z-10">1.8</span>
            </div>
            
            <div className="my-2 py-1 text-center font-bold text-on-surface border-y border-[#1E293B]">3,450.50 USDC</div>
            
            <div className="flex justify-between py-1 px-1 hover:bg-surface-container-low relative">
              <div className="absolute right-0 top-0 bottom-0 bg-primary-container/10 w-[30%] z-0"></div>
              <span className="text-primary relative z-10">3,449.90</span>
              <span className="relative z-10">5.0</span>
            </div>
            <div className="flex justify-between py-1 px-1 hover:bg-surface-container-low relative">
              <div className="absolute right-0 top-0 bottom-0 bg-primary-container/10 w-[50%] z-0"></div>
              <span className="text-primary relative z-10">3,449.10</span>
              <span className="relative z-10">8.5</span>
            </div>
            <div className="flex justify-between py-1 px-1 hover:bg-surface-container-low relative">
              <div className="absolute right-0 top-0 bottom-0 bg-primary-container/10 w-[90%] z-0"></div>
              <span className="text-primary relative z-10">3,448.00</span>
              <span className="relative z-10">22.0</span>
            </div>
          </div>
        </div>
        
        {/* Settlement Receipts — live from chain */}
        <SettlementReceipts />
      </section>
    </div>
  );
}
