const channels = [
  {
    icon: 'bug_report',
    label: 'GitHub Issues',
    description: 'Bug reports, feature requests, and technical questions',
    href: 'https://github.com/furqaannabi/shell/issues',
    cta: 'Open an issue',
  },
  {
    icon: 'forum',
    label: 'Discord',
    description: 'Community chat, announcements, and live support',
    href: 'https://discord.gg/TODO', // TODO: replace with real invite link
    cta: 'Join Discord',
  },
  {
    icon: 'mail',
    label: 'Email',
    description: 'Direct support for institutional and partnership enquiries',
    href: 'mailto:support@TODO', // TODO: replace with real email
    cta: 'Send email',
  },
];

export default function SupportPage() {
  return (
    <div className="max-w-2xl mx-auto w-full pt-4 flex flex-col gap-gutter">
      <div>
        <h1 className="font-headline-md text-headline-md text-on-surface">Support</h1>
        <p className="font-mono-sm text-mono-sm text-on-surface-variant mt-1">
          Reach us through any of the channels below.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {channels.map(({ icon, label, description, href, cta }) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="glass-panel rounded border border-outline-variant p-5 flex items-start gap-4 hover:border-secondary/60 transition-colors group"
          >
            <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors mt-0.5 shrink-0">
              {icon}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-body-sm text-body-sm text-on-surface font-medium">{label}</div>
              <div className="font-mono-sm text-mono-sm text-on-surface-variant mt-0.5">{description}</div>
            </div>
            <span className="font-mono-sm text-[10px] text-secondary group-hover:text-primary transition-colors shrink-0 mt-1">
              {cta} →
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
