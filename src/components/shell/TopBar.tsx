import { Building2, LogOut, Menu as MenuIcon } from 'lucide-react';
import type { ApiSession } from '../../lib/api/schemas';
import type { SessionUser } from '../../lib/auth';
import { zoneLabel } from '../../lib/time';
import { useTimeMode, type TimeMode } from '../../lib/time-context';
import { cn } from '../../lib/utils/cn';
import { initials } from '../../lib/utils/format';
import { Button } from '../ui/button';
import { Menu } from '../ui/menu';

function TimeToggle() {
  const { mode, setMode } = useTimeMode();
  const options: Array<{ value: TimeMode; label: string }> = [
    { value: 'local', label: 'Local' },
    { value: 'utc', label: 'UTC' },
  ];
  return (
    <div role="group" aria-label="Show times in" className="hidden items-center rounded-md border bg-surface p-0.5 sm:inline-flex">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={mode === o.value}
          onClick={() => setMode(o.value)}
          title={o.value === 'local' ? `Show times in your time zone (${zoneLabel('local')})` : 'Show times in UTC'}
          className={cn(
            'h-7 rounded px-2.5 text-caption font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            mode === o.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TopBar({
  user,
  access,
  onSignOut,
  onOpenNav,
}: {
  user: SessionUser;
  access: ApiSession;
  onSignOut: () => void;
  onOpenNav: () => void;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b bg-surface px-4 lg:px-6">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onOpenNav} aria-label="Open navigation">
        <MenuIcon className="h-5 w-5" aria-hidden="true" />
      </Button>

      <div className="flex items-center gap-2.5 rounded-md border bg-surface px-2.5 py-1.5" aria-label={`Workspace ${access.workspaceId}`} role="group">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-subtle text-primary" aria-hidden="true">
          <Building2 className="h-4 w-4" />
        </span>
        <span className="sr-only text-left sm:not-sr-only">
          <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Workspace</span>
          <span className="block max-w-[200px] truncate text-body font-semibold leading-tight text-foreground">{access.workspaceId}</span>
        </span>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <TimeToggle />
        <Menu
          menuLabel="Account"
          triggerClassName="gap-2 rounded-full p-0.5 hover:bg-muted md:rounded-md md:py-1 md:pl-1 md:pr-2"
          trigger={
            <>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar text-caption font-semibold text-white" aria-hidden="true">
                {initials(user.name)}
              </span>
              <span className="sr-only text-left xl:not-sr-only">
                <span className="block max-w-[160px] truncate text-body font-medium leading-tight text-foreground">{user.name}</span>{' '}
                <span className="block text-caption leading-tight text-muted-foreground">{access.role === 'admin' ? 'Administrator' : 'Viewer'}</span>
              </span>
              <span className="sr-only">, account menu</span>
            </>
          }
          header={
            <div className="min-w-0">
              <p className="truncate text-body font-semibold text-foreground">{user.name}</p>
              <p className="truncate text-caption text-muted-foreground">{user.email}</p>
            </div>
          }
          sections={[{ items: [{ id: 'signout', label: 'Sign out', icon: <LogOut className="h-4 w-4" />, onSelect: onSignOut }] }]}
        />
      </div>
    </header>
  );
}
