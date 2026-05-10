'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function SideNavBar({ isOpen, onClose }: { isOpen?: boolean, onClose?: () => void }) {
  const pathname = usePathname();

  const navLinks = [
    { href: '/terminal', icon: 'analytics', label: 'Execution' },
    { href: '/operator', icon: 'admin_panel_settings', label: 'Operator', mobileOnly: true },
    { href: '/analytics', icon: 'insights', label: 'Analytics', mobileOnly: true },
    { href: '/enclaves', icon: 'dns', label: 'Enclaves' },
    { href: '/vaults', icon: 'account_balance_wallet', label: 'Vaults' },
    { href: '/settings', icon: 'settings', label: 'Settings' },
  ];

  const bottomLinks = [
    { href: '/support', icon: 'help', label: 'Support' },
    { href: '/logs', icon: 'terminal', label: 'Logs' },
  ];

  return (
    <aside className={`fixed left-0 top-16 bottom-0 w-64 md:w-20 xl:w-64 flex flex-col z-40 bg-surface-container-low/95 md:bg-surface-container-low/90 backdrop-blur-xl border-r border-outline-variant flat no shadows transition-all duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
      <div className="p-4 md:px-2 xl:px-4 border-b border-outline-variant">
        <div className="flex items-center justify-center xl:justify-start gap-3 mb-4">
          <div className="w-10 h-10 shrink-0 rounded bg-surface-container flex items-center justify-center border border-outline-variant">
             <span className="material-symbols-outlined text-primary">terminal</span>
          </div>
          <div className="md:hidden xl:block overflow-hidden">
            <div className="font-body-sm text-body-sm text-on-surface font-medium whitespace-nowrap">Prime Terminal</div>
            <div className="font-mono-sm text-mono-sm text-primary flex items-center gap-1 whitespace-nowrap">
              <span className="w-2 h-2 rounded-full bg-primary pulse-teal block"></span>
              Enclave: ACTIVE
            </div>
          </div>
        </div>
        <Link href="/terminal" onClick={onClose} className="w-full bg-surface-container-high border border-outline-variant text-on-surface hover:bg-surface-container-highest transition-all py-2 rounded font-mono-sm text-mono-sm flex justify-center items-center gap-2 cursor-pointer overflow-hidden">
          <span className="material-symbols-outlined shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>add</span> 
          <span className="md:hidden xl:block whitespace-nowrap">New Sealed Order</span>
        </Link>
      </div>
      
      <nav className="flex-1 py-4 flex flex-col gap-1 overflow-y-auto">
        {navLinks.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link 
              key={link.href}
              href={link.href} 
              onClick={onClose}
              className={`flex items-center gap-3 py-2 rounded transition-all cursor-pointer px-4 mx-2 md:mx-auto md:px-0 md:justify-center md:w-12 xl:w-auto xl:mx-2 xl:px-4 xl:justify-start ${
                isActive 
                  ? 'bg-primary/5 text-primary md:border-r-0 xl:border-r-2 border-r-2 border-primary md:translate-x-0 xl:translate-x-1 translate-x-1' 
                  : 'text-on-surface-variant hover:bg-surface-container-highest/50 hover:bg-surface-container-high'
              } ${(link as any).mobileOnly ? 'md:hidden' : ''}`}
            >
              <span className="material-symbols-outlined shrink-0">{link.icon}</span>
              <span className="font-body-sm text-body-sm md:hidden xl:block whitespace-nowrap">{link.label}</span>
            </Link>
          );
        })}
      </nav>
      
      <div className="p-4 md:px-2 xl:px-4 border-t border-outline-variant flex flex-col gap-1">
        {bottomLinks.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link 
              key={link.href}
              href={link.href} 
              onClick={onClose}
              className={`flex items-center gap-3 py-2 rounded transition-all cursor-pointer px-2 mx-0 md:mx-auto md:px-0 md:justify-center md:w-12 xl:w-auto xl:mx-0 xl:px-2 xl:justify-start ${
                isActive 
                  ? 'bg-primary/5 text-primary md:border-r-0 xl:border-r-2 border-r-2 border-primary md:translate-x-0 xl:translate-x-1 translate-x-1' 
                  : 'text-on-surface-variant hover:bg-surface-container-highest/50'
              }`}
            >
              <span className="material-symbols-outlined shrink-0">{link.icon}</span>
              <span className="font-body-sm text-body-sm md:hidden xl:block whitespace-nowrap">{link.label}</span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
