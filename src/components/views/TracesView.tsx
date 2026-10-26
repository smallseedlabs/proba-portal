import { useId, useState, type FormEvent } from 'react';
import { GitBranch, RefreshCw, Search } from 'lucide-react';
import { routeHref, useRoute } from '../../lib/router';
import { formatDuration, formatTimestamp } from '../../lib/time';
import { useTimeMode } from '../../lib/time-context';
import { useApi } from '../../state/api';
import { useApiQuery } from '../../state/useApiQuery';
import { usePagedList } from '../../state/usePagedList';
import { OutcomeBadge, RiskBadge } from '../audit/badges';
import { ErrorPanel, NoResults, PageHeader } from '../audit/common';
import { Pager } from '../audit/Pager';
import { Button } from '../ui/button';
import { Card, CardBody } from '../ui/card';
import { FieldError, Input, Label, NativeSelect } from '../ui/field';
import { Skeleton } from '../ui/feedback';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RANGES = [
  { value: '1h', label: 'Last hour', ms: 3_600_000 },
  { value: '24h', label: 'Last 24 hours', ms: 86_400_000 },
  { value: '7d', label: 'Last 7 days', ms: 7 * 86_400_000 - 60_000 },
] as const;
const SIZES = [25, 50, 100] as const;

export function TracesView() {
  const api = useApi();
  const { mode } = useTimeMode();
  const [route, navigate] = useRoute();
  const range = RANGES.find((r) => r.value === route.query.get('range')) ?? RANGES[1];
  const [pageSize, setPageSize] = useState<number>(25);
  const [ranAt, setRanAt] = useState(() => Date.now());
  const [lookup, setLookup] = useState('');
  const [lookupError, setLookupError] = useState<string | undefined>();
  const lookupId = useId();
  const lookupErrorId = useId();
  const rangeId = useId();

  const paging = usePagedList(`${range.value}|${pageSize}|${ranAt}`);
  const traces = useApiQuery(`traces:${range.value}:${pageSize}:${paging.cursor ?? ''}:${ranAt}`, (signal) =>
    api.listTraces({ from: new Date(ranAt - range.ms).toISOString(), limit: pageSize, cursor: paging.cursor }, { signal })
  );

  const submitLookup = (e: FormEvent) => {
    e.preventDefault();
    const value = lookup.trim();
    if (!UUID.test(value)) {
      setLookupError('Enter a full trace ID, like 3f2b8c1e-5a7d-4e90-b1c2-6d8f0a9e4b73.');
      return;
    }
    setLookupError(undefined);
    navigate({ section: 'traces', id: value.toLowerCase() });
  };

  const page = traces.state.data;
  const loading = traces.state.status === 'loading';

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 lg:px-8">
      <PageHeader title="Traces" description="Follow a request from the moment it arrived to everything it caused. Open a trace to see each step and how long it took." />

      <Card>
        <CardBody>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_14rem] md:items-start">
            <form onSubmit={submitLookup} noValidate aria-label="Open a trace by ID" className="space-y-1.5">
              <Label htmlFor={lookupId}>Open a trace by ID</Label>
              <div className="flex gap-2">
                <Input
                  id={lookupId}
                  className="font-mono text-caption"
                  placeholder="00000000-0000-0000-0000-000000000000"
                  spellCheck={false}
                  value={lookup}
                  aria-invalid={lookupError ? true : undefined}
                  aria-describedby={lookupError ? lookupErrorId : undefined}
                  onChange={(e) => {
                    setLookup(e.target.value);
                    setLookupError(undefined);
                  }}
                />
                <Button type="submit">
                  <Search className="h-4 w-4" aria-hidden="true" />
                  Open
                </Button>
              </div>
              <FieldError id={lookupErrorId}>{lookupError}</FieldError>
            </form>
            <div className="space-y-1.5">
              <Label htmlFor={rangeId}>Recent activity</Label>
              <NativeSelect
                id={rangeId}
                value={range.value}
                onChange={(e) => {
                  setRanAt(Date.now());
                  navigate({ section: 'traces', query: { range: e.target.value === '24h' ? undefined : e.target.value } }, { replace: true });
                }}
              >
                {RANGES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card aria-busy={loading}>
        <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
          <h2 className="text-title text-foreground">Recent traces</h2>
          <Button variant="outline" size="sm" onClick={() => setRanAt(Date.now())} loading={loading}>
            {!loading && <RefreshCw className="h-4 w-4" aria-hidden="true" />}
            Refresh
          </Button>
        </div>
        {traces.state.status === 'error' ? (
          <ErrorPanel error={traces.state.error} onRetry={traces.reload} title="We couldn’t load traces" />
        ) : !page ? (
          <div className="divide-y" role="status" aria-label="Loading traces">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="ml-auto h-5 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : page.traces.length === 0 ? (
          <NoResults title="No traces in this time range" description="Try a longer time range. New activity appears here as soon as it is recorded." />
        ) : (
          <>
            <div className={loading ? 'overflow-x-auto opacity-60 transition-opacity' : 'overflow-x-auto'}>
              <table className="w-full min-w-[720px] text-left text-body">
                <caption className="sr-only">Recent traces</caption>
                <thead className="border-b bg-surface-sunken/60 text-caption uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="whitespace-nowrap px-5 py-2.5 font-medium">Started</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Request</th>
                    <th scope="col" className="hidden px-3 py-2.5 font-medium md:table-cell">Service</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">Steps</th>
                    <th scope="col" className="hidden px-3 py-2.5 text-right font-medium lg:table-cell">Duration</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Outcome</th>
                    <th scope="col" className="hidden px-3 py-2.5 font-medium xl:table-cell">Risk</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {page.traces.map((t) => (
                    <tr key={t.traceId} className="hover:bg-muted/40">
                      <td className="whitespace-nowrap px-5 py-3 align-top text-muted-foreground">
                        <time dateTime={t.startedAt}>{formatTimestamp(t.startedAt, mode)}</time>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <a
                          href={routeHref({ section: 'traces', id: t.traceId })}
                          className="inline-flex items-center gap-1.5 rounded-sm font-medium text-foreground hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <GitBranch className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                          {t.rootAction}
                          <span className="sr-only">, trace {t.traceId}</span>
                        </a>
                        <p className="mt-0.5 font-mono text-caption text-muted-foreground">{t.traceId.slice(0, 8)}…</p>
                      </td>
                      <td className="hidden px-3 py-3 align-top text-muted-foreground md:table-cell">{t.rootService}</td>
                      <td className="px-3 py-3 text-right align-top tabular-nums">{t.eventCount}</td>
                      <td className="hidden whitespace-nowrap px-3 py-3 text-right align-top tabular-nums text-muted-foreground lg:table-cell">{formatDuration(t.durationMs)}</td>
                      <td className="px-3 py-3 align-top"><OutcomeBadge outcome={t.outcome} /></td>
                      <td className="hidden px-3 py-3 align-top xl:table-cell"><RiskBadge risk={t.riskLevel} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              noun="traces"
              pageNumber={paging.pageNumber}
              count={page.traces.length}
              pageSize={pageSize}
              pageSizes={SIZES}
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
    </div>
  );
}
