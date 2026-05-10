'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function TopNavBar() {
  const pathname = usePathname();

  const links = [
    { href: '/terminal', label: 'Terminal' },
    { href: '/operator', label: 'Operator' },
    { href: '/analytics', label: 'Analytics' },
  ];

  return (
    <nav className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-gutter h-16 bg-surface-dim/80 backdrop-blur-md border-b border-outline-variant flat no shadows">
      <div className="flex items-center gap-6">
        <div className="text-headline-md font-headline-md font-bold tracking-tighter text-primary">SHELL FINANCE</div>
        <div className="hidden md:flex gap-4 h-full items-center">
          {links.map(link => {
            const isActive = pathname === link.href;
            return (
              <Link 
                key={link.href}
                href={link.href} 
                className={`font-medium transition-colors duration-200 flex items-center h-full px-2 cursor-pointer ${
                  isActive 
                    ? 'text-primary font-bold border-b-2 border-primary' 
                    : 'text-on-surface-variant hover:text-primary'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex gap-2">
          <button className="p-2 rounded-full text-on-surface-variant hover:text-primary transition-colors duration-200 cursor-pointer" title="Security">
            <span className="material-symbols-outlined">security</span>
          </button>
          <button className="p-2 rounded-full text-on-surface-variant hover:text-primary transition-colors duration-200 cursor-pointer" title="Notifications">
            <span className="material-symbols-outlined">notifications</span>
          </button>
        </div>
        <button className="bg-primary text-on-primary px-4 py-2 rounded font-mono-sm text-mono-sm font-medium hover:opacity-90 transition-opacity flex items-center gap-2 cursor-pointer">
          Connect Wallet
        </button>
        <div className="w-8 h-8 rounded-full border border-outline-variant bg-surface-container flex items-center justify-center overflow-hidden cursor-pointer">
          <span className="material-symbols-outlined text-sm text-on-surface">person</span>
        </div>
      </div>
    </nav>
  );
}
