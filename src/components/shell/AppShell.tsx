import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useRoute } from '../../lib/router';
import { useApiContext } from '../../state/api';
import { AnalyticsView } from '../views/AnalyticsView';
import { ExplorerView } from '../views/ExplorerView';
import { IntegrityView } from '../views/IntegrityView';
import { TraceView } from '../views/TraceView';
import { TracesView } from '../views/TracesView';
import { NAV_ENTRIES, SECTION_TITLES } from './nav';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function AppShell() {
  const { user, access, onSignOut, memoryUrl } = useApiContext();
  const [route] = useRoute();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const items = useMemo(() => NAV_ENTRIES.filter((e) => !e.adminOnly || access.role === 'admin'), [access.role]);

  useEffect(() => {
    document.title = `${SECTION_TITLES[route.section]} · Proba Insights`;
    // Move to the top and let screen readers know the page changed.
    mainRef.current?.scrollTo?.({ top: 0 });
  }, [route.section, route.id]);

  return (
    <div className="relative flex h-screen overflow-hidden bg-background">
      <a
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          mainRef.current?.focus();
        }}
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to main content
      </a>

      <Sidebar current={route.section} items={items} memoryUrl={memoryUrl} className="hidden w-64 shrink-0 lg:flex" />
      <Sidebar current={route.section} items={items} memoryUrl={memoryUrl} compact className="hidden w-[72px] shrink-0 md:flex lg:hidden" />

      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-slate-950/50" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <div className="relative h-full w-72">
            <Sidebar current={route.section} items={items} memoryUrl={memoryUrl} onNavigate={() => setDrawerOpen(false)} />
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="absolute right-3 top-4 rounded-md p-1.5 text-sidebar-muted hover:text-white"
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar user={user} access={access} onSignOut={onSignOut} onOpenNav={() => setDrawerOpen(true)} />
        <main id="main-content" ref={mainRef} tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto focus:outline-none">
          {route.section === 'explorer' && <ExplorerView />}
          {route.section === 'traces' && (route.id ? <TraceView key={route.id} traceId={route.id} /> : <TracesView />)}
          {route.section === 'integrity' && <IntegrityView />}
          {route.section === 'analytics' && <AnalyticsView />}
        </main>
      </div>
    </div>
  );
}
