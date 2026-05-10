'use client';

import React, { useState } from 'react';
import TopNavBar from './TopNavBar';
import SideNavBar from './SideNavBar';

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <TopNavBar onMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)} />
      
      <div className="flex flex-1 pt-16 w-full min-h-0 relative">
        <SideNavBar 
          isOpen={isMobileMenuOpen} 
          onClose={() => setIsMobileMenuOpen(false)} 
        />
        
        {/* Main Content Area */}
        <main className="flex-1 flex flex-col gap-4 p-4 overflow-hidden h-full min-h-0 w-full transition-all duration-300 md:ml-64">
          {children}
        </main>

        {/* Mobile overlay */}
        {isMobileMenuOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-30 md:hidden" 
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
