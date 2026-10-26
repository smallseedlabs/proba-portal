import { ShieldCheck } from 'lucide-react';
import { routeHref, type Section } from '../../lib/router';
import { cn } from '../../lib/utils/cn';
import { Logo, LogoMark } from '../brand/Logo';
import type { NavEntry } from './nav';

const linkClass = (active: boolean, compact: boolean) =>
  cn(
    'group relative flex items-center gap-3 rounded-md text-body font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A5B4FC] focus-visible:ring-offset-0',
    compact ? 'h-10 justify-center' : 'h-10 px-3',
    active ? 'bg-sidebar-active text-white' : 'text-sidebar-muted hover:bg-sidebar-active/60 hover:text-white'
  );

function NavList({ entries, current, compact, onNavigate }: { entries: NavEntry[]; current: Section; compact: boolean; onNavigate?: () => void }) {
  return (
    <ul className="space-y-1">
      {entries.map(({ section, label, icon: Icon }) => {
        const active = current === section;
        return (
          <li key={section}>
            <a
              href={routeHref({ section })}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              title={compact ? label : undefined}
              className={linkClass(active, compact)}
            >
              <Icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-[#A5B4FC]' : '')} aria-hidden="true" />
              <span className={compact ? 'sr-only' : 'flex-1'}>{label}</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export function Sidebar({
  current,
  items,
  compact = false,
  onNavigate,
  className,
}: {
  current: Section;
  items: NavEntry[];
  compact?: boolean;
  onNavigate?: () => void;
  className?: string;
}) {
  const memoryEntries = items.filter((e) => e.group === 'memory');
  return (
    <div className={cn('flex h-full flex-col bg-sidebar text-sidebar-foreground', className)}>
      <div className={cn('flex h-16 items-center border-b border-sidebar-border', compact ? 'justify-center px-2' : 'px-5')}>
        {compact ? (
          <span>
            <LogoMark />
            <span className="sr-only">Proba Insights</span>
          </span>
        ) : (
          <Logo inverted />
        )}
      </div>
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4">
        <NavList entries={items.filter((e) => e.group !== 'memory')} current={current} compact={compact} onNavigate={onNavigate} />
        {memoryEntries.length > 0 && (
          <div className="mt-5" role="group" aria-labelledby={compact ? undefined : 'nav-memory-heading'} aria-label={compact ? 'Memory' : undefined}>
            {compact ? (
              <hr className="mx-2 mb-3 border-sidebar-border" aria-hidden="true" />
            ) : (
              <p id="nav-memory-heading" className="mb-1.5 px-3 text-caption font-semibold uppercase tracking-wide text-sidebar-muted">
                Memory
              </p>
            )}
            <NavList entries={memoryEntries} current={current} compact={compact} onNavigate={onNavigate} />
          </div>
        )}
      </nav>
      {!compact && (
        <div className="m-3 rounded-lg border border-sidebar-border bg-white/[0.03] p-3">
          <p className="flex items-center gap-2 text-caption font-semibold text-white">
            <ShieldCheck className="h-4 w-4 text-[#5EEAD4]" aria-hidden="true" />
            Read-only access
          </p>
          <p className="mt-1 text-caption text-sidebar-muted">Nothing here changes your campaigns. Every view you open is recorded in the audit trail.</p>
        </div>
      )}
    </div>
  );
}
