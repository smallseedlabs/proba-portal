import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useRoute, type Section } from '../../lib/router';
import { useApiContext } from '../../state/api';
import { AnalyticsView } from '../views/AnalyticsView';
import { ExplorerView } from '../views/ExplorerView';
import { IntegrityView } from '../views/IntegrityView';
import { JobsView } from '../views/JobsView';
import { MemoryDetailView } from '../views/MemoryDetailView';
import { MemoryExplorerView } from '../views/MemoryExplorerView';
import { ProfilesView } from '../views/ProfilesView';
import { RetrievalInspectorView } from '../views/RetrievalInspectorView';
import { TraceView } from '../views/TraceView';
import { TracesView } from '../views/TracesView';
import { SECTION_TITLES, visibleEntries } from './nav';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

const MEMORY_SECTIONS: Section[] = ['memory', 'retrievals', 'profiles', 'jobs'];

export function AppShell() {
  const { user, access, onSignOut, memory } = useApiContext();
  const [route] = useRoute();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const items = useMemo(() => visibleEntries({ admin: access.role === 'admin', memory: memory !== null }), [access.role, memory]);
  // The memory screens exist only when the feature is switched on: otherwise their addresses show the Audit Explorer.
  const section = !memory && MEMORY_SECTIONS.includes(route.section) ? 'explorer' : route.section;

  useEffect(() => {
    document.title = `${SECTION_TITLES[section]} · Proba Insights`;
    // Move to the top and let screen readers know the page changed.
    mainRef.current?.scrollTo?.({ top: 0 });
  }, [section, route.id]);

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

      <Sidebar current={section} items={items} className="hidden w-64 shrink-0 lg:flex" />
      <Sidebar current={section} items={items} compact className="hidden w-[72px] shrink-0 md:flex lg:hidden" />

      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-slate-950/50" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <div className="relative h-full w-72">
            <Sidebar current={section} items={items} onNavigate={() => setDrawerOpen(false)} />
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
          {section === 'explorer' && <ExplorerView />}
          {section === 'traces' && (route.id ? <TraceView key={route.id} traceId={route.id} /> : <TracesView />)}
          {section === 'integrity' && <IntegrityView />}
          {section === 'analytics' && <AnalyticsView />}
          {section === 'memory' && (route.id ? <MemoryDetailView key={route.id} memoryId={route.id} /> : <MemoryExplorerView />)}
          {section === 'retrievals' && <RetrievalInspectorView key={route.id ?? 'none'} retrievalId={route.id} />}
          {section === 'profiles' && <ProfilesView />}
          {section === 'jobs' && <JobsView />}
        </main>
      </div>
    </div>
  );
}
