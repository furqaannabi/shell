'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ConnectWalletButton from '@/components/wallet/ConnectWalletButton';

export default function TopNavBar({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const pathname = usePathname();

  const links = [
    { href: '/terminal', label: 'Terminal' },
    { href: '/desk', label: 'IOI Desk' },
    { href: '/analytics', label: 'Analytics' },
  ];

  return (
    <nav className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-4 md:px-gutter h-16 bg-surface-dim/80 backdrop-blur-md border-b border-outline-variant flat no shadows">
      <div className="flex items-center gap-4 md:gap-6">
        <button 
          className="md:hidden p-2 -ml-2 mt-1 rounded text-on-surface hover:text-primary transition-colors cursor-pointer"
          onClick={onMenuToggle}
        >
          <span className="material-symbols-outlined">menu</span>
        </button>
        <Link href="/" className="text-headline-md font-headline-md font-bold tracking-tighter text-primary hover:opacity-80 transition-opacity">SHELL FINANCE</Link>
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
      <div className="flex items-center gap-2 md:gap-4">
        <ConnectWalletButton />
      </div>
    </nav>
  );
}
