'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function SideNavBar() {
  const pathname = usePathname();

  const navLinks = [
    { href: '/terminal', icon: 'analytics', label: 'Execution' },
    { href: '/analytics', icon: 'insights', label: 'Analytics' },
    { href: '/operator', icon: 'dns', label: 'Enclaves' },
    { href: '/vaults', icon: 'account_balance_wallet', label: 'Vaults' },
    { href: '/settings', icon: 'settings', label: 'Settings' },
  ];

  const bottomLinks = [
    { href: '/support', icon: 'help', label: 'Support' },
    { href: '/logs', icon: 'terminal', label: 'Logs' },
  ];

  return (
    <aside className="fixed left-0 top-16 bottom-0 w-64 flex flex-col z-40 bg-surface-container-low/90 backdrop-blur-xl border-r border-outline-variant flat no shadows">
      <div className="p-4 border-b border-outline-variant">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded bg-surface-container flex items-center justify-center border border-outline-variant">
             <span className="material-symbols-outlined text-primary">terminal</span>
          </div>
          <div>
            <div className="font-body-sm text-body-sm text-on-surface font-medium">Prime Terminal</div>
            <div className="font-mono-sm text-mono-sm text-primary flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-primary pulse-teal block"></span>
              Enclave: ACTIVE
            </div>
          </div>
        </div>
        <Link href="/terminal" className="w-full bg-surface-container-high border border-outline-variant text-on-surface hover:bg-surface-container-highest transition-all py-2 rounded font-mono-sm text-mono-sm flex justify-center items-center gap-2 cursor-pointer">
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>add</span> New Sealed Order
        </Link>
      </div>
      
      <nav className="flex-1 py-4 flex flex-col gap-1 overflow-y-auto">
        {navLinks.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link 
              key={link.href}
              href={link.href} 
              className={`flex items-center gap-3 px-4 py-2 mx-2 rounded transition-all cursor-pointer ${
                isActive 
                  ? 'bg-primary/5 text-primary border-r-2 border-primary translate-x-1' 
                  : 'text-on-surface-variant hover:bg-surface-container-highest/50 hover:bg-surface-container-high'
              }`}
            >
              <span className="material-symbols-outlined">{link.icon}</span>
              <span className="font-body-sm text-body-sm">{link.label}</span>
            </Link>
          );
        })}
      </nav>
      
      <div className="p-4 border-t border-outline-variant flex flex-col gap-1">
        {bottomLinks.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link 
              key={link.href}
              href={link.href} 
              className={`flex items-center gap-3 px-2 py-2 rounded transition-all cursor-pointer ${
                isActive 
                  ? 'bg-primary/5 text-primary border-r-2 border-primary translate-x-1' 
                  : 'text-on-surface-variant hover:bg-surface-container-highest/50'
              }`}
            >
              <span className="material-symbols-outlined">{link.icon}</span>
              <span className="font-body-sm text-body-sm">{link.label}</span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
