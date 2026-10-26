import { useMemo, useState } from 'react';
import { ArrowDownUp, RefreshCw, ScrollText } from 'lucide-react';
import {
  DEFAULT_FILTERS,
  DEFAULT_PAGE_SIZE,
  PAGE_SIZES,
  buildEventQuery,
  filtersFromParams,
  filtersToParams,
  rangeLabel,
  validateFilters,
  type EventFilters,
} from '../../lib/filters';
import { useRoute } from '../../lib/router';
import { formatTimestamp } from '../../lib/time';
import { useTimeMode } from '../../lib/time-context';
import { useApi } from '../../state/api';
import { useApiQuery } from '../../state/useApiQuery';
import { usePagedList } from '../../state/usePagedList';
import { EventDrawer } from '../audit/EventDrawer';
import { EventsTable } from '../audit/EventsTable';
import { FilterBar } from '../audit/FilterBar';
import { NoResults, ErrorPanel, PageHeader } from '../audit/common';
import { Pager } from '../audit/Pager';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { EmptyState, Skeleton } from '../ui/feedback';

function TableSkeleton() {
  return (
    <div className="divide-y" role="status" aria-label="Loading events">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-56" />
          <Skeleton className="hidden h-4 w-32 md:block" />
          <Skeleton className="ml-auto h-5 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function ExplorerView() {
  const api = useApi();
  const { mode } = useTimeMode();
  const [route, navigate] = useRoute();
  const filters = useMemo(() => filtersFromParams(route.query), [route.query]);
  const eventId = route.query.get('event');
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  // The moment the search was run: relative ranges ("last 24 hours") are measured from it.
  const [ranAt, setRanAt] = useState(() => Date.now());

  const filterKey = JSON.stringify(filters);
  const paging = usePagedList(`${filterKey}|${pageSize}|${ranAt}`);
  const invalid = Object.keys(validateFilters(filters)).length > 0;

  const events = useApiQuery(invalid ? null : `events:${filterKey}:${pageSize}:${paging.cursor ?? ''}:${ranAt}`, (signal) =>
    api.searchEvents(buildEventQuery(filters, ranAt, pageSize, paging.cursor), { signal })
  );
  const facets = useApiQuery('facets', (signal) => api.getFacets({}, { signal }));

  const apply = (next: EventFilters) => {
    const params = filtersToParams(next);
    if (eventId) params.set('event', eventId);
    setRanAt(Date.now());
    navigate({ section: 'explorer', query: params }, { replace: true });
  };

  const openEvent = (id: string | null) => {
    const params = new URLSearchParams(route.query);
    if (id) params.set('event', id);
    else params.delete('event');
    navigate({ section: 'explorer', query: params }, { replace: true });
  };

  const toggleOrder = () => apply({ ...filters, order: filters.order === 'desc' ? 'asc' : 'desc' });

  const page = events.state.data;
  const loading = events.state.status === 'loading';
  const hasFilters = JSON.stringify({ ...filters, order: 'desc' }) !== JSON.stringify(DEFAULT_FILTERS);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 lg:px-8">
      <PageHeader
        title="Audit Explorer"
        description="Search every action taken in your workspace. Filter by who did it, what happened and when, then open any event for the full record."
      />

      <FilterBar key={filterKey} value={filters} facets={facets.state.data} onApply={apply} />

      <Card aria-busy={loading}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
          <div>
            <h2 className="text-title text-foreground">Events</h2>
            <p className="text-caption text-muted-foreground">
              {rangeLabel(filters)}
              {page?.from && filters.range !== 'any' && ` · from ${formatTimestamp(page.from, mode, false)}`}
              {' · '}
              {filters.order === 'desc' ? 'Newest first' : 'Oldest first'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={toggleOrder}>
              <ArrowDownUp className="h-4 w-4" aria-hidden="true" />
              {filters.order === 'desc' ? 'Show oldest first' : 'Show newest first'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setRanAt(Date.now())} loading={loading}>
              {!loading && <RefreshCw className="h-4 w-4" aria-hidden="true" />}
              Refresh
            </Button>
          </div>
        </div>

        {invalid ? (
          <EmptyState icon={<ScrollText className="h-6 w-6" />} title="These filters can’t be applied" description="Adjust the filters above and search again." />
        ) : events.state.status === 'error' ? (
          <ErrorPanel error={events.state.error} onRetry={events.reload} title="We couldn’t load events" />
        ) : !page ? (
          <TableSkeleton />
        ) : page.events.length === 0 ? (
          <NoResults
            title={hasFilters ? 'No events match these filters' : 'No events in this time range'}
            description={hasFilters ? 'Try widening the time range or removing a filter.' : 'Try a longer time range. New activity appears here as soon as it is recorded.'}
            action={
              hasFilters ? (
                <Button variant="outline" onClick={() => apply(DEFAULT_FILTERS)}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className={loading ? 'opacity-60 transition-opacity' : undefined}>
              <EventsTable events={page.events} onOpen={(e) => openEvent(e.eventId)} selectedId={eventId ?? undefined} caption="Audit events" />
            </div>
            <Pager
              noun="events"
              pageNumber={paging.pageNumber}
              count={page.events.length}
              pageSize={pageSize}
              pageSizes={PAGE_SIZES}
              onPageSize={setPageSize}
              hasPrevious={paging.hasPrevious}
              hasNext={page.nextCursor !== null}
              busy={loading}
              onPrevious={paging.previous}
              onNext={() => page.nextCursor && paging.next(page.nextCursor)}
            />
          </>
        )}
      </Card>

      <EventDrawer eventId={eventId} preloaded={page?.events.find((e) => e.eventId === eventId)} onClose={() => openEvent(null)} />
    </div>
  );
}
