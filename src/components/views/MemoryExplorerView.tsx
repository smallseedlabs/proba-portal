import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { Brain, RefreshCw, Search } from 'lucide-react';
import type { MemoryFilter } from '../../lib/memory/port';
import { CATEGORY_LABELS, SOURCE_LABELS, STATUS_LABELS, memoryHeadline } from '../../lib/memory/labels';
import { MEMORY_CATEGORIES, MEMORY_STATUSES, SOURCE_KINDS, type MemoryCategory, type MemoryStatus, type SourceKind } from '../../lib/memory/schemas';
import { useRoute } from '../../lib/router';
import { formatTimestamp } from '../../lib/time';
import { useTimeMode } from '../../lib/time-context';
import { useApiContext, useMemoryApi } from '../../state/api';
import { useApiQuery } from '../../state/useApiQuery';
import { usePagedList } from '../../state/usePagedList';
import { ErrorPanel, NoResults, PageHeader } from '../audit/common';
import { Pager } from '../audit/Pager';
import { CategoryBadge, MemoryStatusBadge, Meter } from '../memory/shared';
import { formatScore, linkClass, memoryHref } from '../memory/helpers';
import { Button } from '../ui/button';
import { Card, CardBody } from '../ui/card';
import { Skeleton } from '../ui/feedback';
import { FieldError, FieldHint, Input, Label, NativeSelect } from '../ui/field';

const SIZES = [25, 50, 100] as const;
const SEARCH_LIMIT = 25;
const ALL_STATUSES = 'all';

interface Filters {
  q: string;
  category: MemoryCategory | '';
  /** An administrator's choice; viewers always see active memories. */
  status: MemoryStatus | typeof ALL_STATUSES | '';
  source: SourceKind | '';
}

function filtersFromParams(params: URLSearchParams, admin: boolean): Filters {
  const category = params.get('category');
  const status = params.get('status');
  const source = params.get('source');
  return {
    q: (params.get('q') ?? '').slice(0, 2000),
    category: (MEMORY_CATEGORIES as readonly string[]).includes(category ?? '') ? (category as MemoryCategory) : '',
    status: admin && (status === ALL_STATUSES || (MEMORY_STATUSES as readonly string[]).includes(status ?? '')) ? (status as Filters['status']) : '',
    source: (SOURCE_KINDS as readonly string[]).includes(source ?? '') ? (source as SourceKind) : '',
  };
}

function filterOf(f: Filters): MemoryFilter {
  return {
    ...(f.category ? { categories: [f.category] } : {}),
    ...(f.status ? { statuses: f.status === ALL_STATUSES ? [...MEMORY_STATUSES] : [f.status] } : {}),
    ...(f.source ? { sourceKind: f.source } : {}),
  };
}

interface Row {
  id: string;
  category: MemoryCategory;
  status?: MemoryStatus;
  headline: string;
  confidence: number;
  importance: number;
  at: string;
  score?: number;
}

function TableSkeleton() {
  return (
    <div className="divide-y" role="status" aria-label="Loading memories">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4">
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="ml-auto h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

export function MemoryExplorerView() {
  const memory = useMemoryApi();
  const { access } = useApiContext();
  const admin = access.role === 'admin';
  const { mode } = useTimeMode();
  const [route, navigate] = useRoute();
  const filters = useMemo(() => filtersFromParams(route.query, admin), [route.query, admin]);
  const [draft, setDraft] = useState(filters.q);
  const [pageSize, setPageSize] = useState<number>(25);
  const [ranAt, setRanAt] = useState(() => Date.now());
  const searchId = useId();
  const categoryId = useId();
  const statusId = useId();
  const sourceId = useId();
  const hintId = useId();
  const tooLong = draft.length > 2000;

  useEffect(() => setDraft(filters.q), [filters.q]);

  const apply = (next: Filters) => {
    const query: Record<string, string | undefined> = {
      q: next.q.trim() || undefined,
      category: next.category || undefined,
      status: next.status || undefined,
      source: next.source || undefined,
    };
    setRanAt(Date.now());
    navigate({ section: 'memory', query }, { replace: true });
  };

  const filterKey = JSON.stringify(filters);
  const searching = filters.q.trim() !== '';
  const paging = usePagedList(`${filterKey}|${pageSize}|${ranAt}`);

  const result = useApiQuery(`memories:${filterKey}:${pageSize}:${paging.cursor ?? ''}:${ranAt}`, async (signal): Promise<{ rows: Row[]; nextCursor: string | null }> => {
    const filter = filterOf(filters);
    if (searching) {
      const found = await memory.searchMemories({ query: filters.q.trim(), filter, limit: SEARCH_LIMIT }, { signal });
      return {
        nextCursor: null,
        rows: found.results.map((r) => ({
          id: r.id, category: r.category, headline: memoryHeadline(r), confidence: r.confidence, importance: r.importance, at: r.createdAt, score: r.score,
        })),
      };
    }
    const page = await memory.listMemories({ ...filter, limit: pageSize, cursor: paging.cursor }, { signal });
    return {
      nextCursor: page.nextCursor,
      rows: page.memories.map((m) => ({
        id: m.id, category: m.category, status: m.status, headline: memoryHeadline(m), confidence: m.confidence, importance: m.importance, at: m.createdAt,
      })),
    };
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (tooLong) return;
    apply({ ...filters, q: draft });
  };

  const hasFilters = filters.q !== '' || filters.category !== '' || filters.status !== '' || filters.source !== '';
  const data = result.state.data;
  const loading = result.state.status === 'loading';

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 lg:px-8">
      <PageHeader
        title="Memory Explorer"
        description="What Proba has learned about your workspace. Browse the newest memories, or search for the ones that matter to a question, and open any of them to see where it came from."
      />

      <Card>
        <form onSubmit={submit} noValidate aria-label="Search and filter memories">
          <CardBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={searchId}>Search memories</Label>
              <div className="flex gap-2">
                <Input
                  id={searchId}
                  type="search"
                  value={draft}
                  maxLength={2100}
                  placeholder="For example: when does a campaign budget need approval"
                  aria-invalid={tooLong ? true : undefined}
                  aria-describedby={tooLong ? `${hintId}-error` : hintId}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <Button type="submit">
                  <Search className="h-4 w-4" aria-hidden="true" />
                  Search
                </Button>
              </div>
              <FieldHint id={hintId}>
                Results are ranked by how useful each memory is for the question. Every search is recorded in the audit trail. Leave it empty to browse the newest memories.
              </FieldHint>
              <FieldError id={`${hintId}-error`}>{tooLong ? 'A search can be at most 2,000 characters.' : undefined}</FieldError>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor={categoryId}>Category</Label>
                <NativeSelect id={categoryId} value={filters.category} onChange={(e) => apply({ ...filters, q: draft, category: e.target.value as Filters['category'] })}>
                  <option value="">All categories</option>
                  {MEMORY_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              {admin && (
                <div className="space-y-1.5">
                  <Label htmlFor={statusId}>Status</Label>
                  <NativeSelect id={statusId} value={filters.status} onChange={(e) => apply({ ...filters, q: draft, status: e.target.value as Filters['status'] })}>
                    <option value="">Active</option>
                    {MEMORY_STATUSES.filter((s) => s !== 'active').map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                    <option value={ALL_STATUSES}>Any status</option>
                  </NativeSelect>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor={sourceId}>Source</Label>
                <NativeSelect id={sourceId} value={filters.source} onChange={(e) => apply({ ...filters, q: draft, source: e.target.value as Filters['source'] })}>
                  <option value="">All sources</option>
                  {SOURCE_KINDS.map((s) => (
                    <option key={s} value={s}>
                      {SOURCE_LABELS[s]}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>
          </CardBody>
        </form>
      </Card>

      <Card aria-busy={loading}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
          <div>
            <h2 className="text-title text-foreground">{searching ? 'Best matches' : 'Memories'}</h2>
            <p className="text-caption text-muted-foreground">
              {searching ? `Ranked for “${filters.q.trim().length > 60 ? `${filters.q.trim().slice(0, 60)}…` : filters.q.trim()}”` : 'Newest first'}
              {!admin && ' · Active memories'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasFilters && (
              <Button variant="outline" size="sm" onClick={() => apply({ q: '', category: '', status: '', source: '' })}>
                Clear filters
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setRanAt(Date.now())} loading={loading}>
              {!loading && <RefreshCw className="h-4 w-4" aria-hidden="true" />}
              Refresh
            </Button>
          </div>
        </div>

        {result.state.status === 'error' ? (
          <ErrorPanel error={result.state.error} onRetry={result.reload} title="We couldn’t load memories" />
        ) : !data ? (
          <TableSkeleton />
        ) : data.rows.length === 0 ? (
          <NoResults
            title={searching ? 'No memories match this search' : hasFilters ? 'No memories match these filters' : 'No memories yet'}
            description={
              searching || hasFilters
                ? 'Try different words, or remove a filter.'
                : 'Memories appear here once Proba has learned something from your workspace’s activity.'
            }
          />
        ) : (
          <>
            <div className={loading ? 'overflow-x-auto opacity-60 transition-opacity' : 'overflow-x-auto'}>
              <table className="w-full min-w-[760px] text-left text-body">
                <caption className="sr-only">{searching ? 'Memories ranked for the search' : 'Memories, newest first'}</caption>
                <thead className="border-b bg-surface-sunken/60 text-caption uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-5 py-2.5 font-medium">Memory</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Category</th>
                    {!searching && <th scope="col" className="px-3 py-2.5 font-medium">Status</th>}
                    <th scope="col" className="px-3 py-2.5 font-medium">Confidence</th>
                    <th scope="col" className="hidden px-3 py-2.5 font-medium lg:table-cell">Importance</th>
                    {searching && <th scope="col" className="px-3 py-2.5 text-right font-medium">Score</th>}
                    <th scope="col" className="whitespace-nowrap px-3 py-2.5 font-medium">Recorded</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.rows.map((row) => (
                    <tr key={row.id} className="hover:bg-muted/40">
                      <td className="max-w-xl px-5 py-3 align-top">
                        <a href={memoryHref(row.id)} className={`${linkClass} line-clamp-2 font-medium text-foreground hover:text-primary`}>
                          <Brain className="mr-1.5 inline h-4 w-4 align-text-bottom text-muted-foreground" aria-hidden="true" />
                          {row.headline}
                        </a>
                      </td>
                      <td className="px-3 py-3 align-top"><CategoryBadge category={row.category} /></td>
                      {!searching && <td className="px-3 py-3 align-top">{row.status ? <MemoryStatusBadge status={row.status} /> : null}</td>}
                      <td className="px-3 py-3 align-top"><Meter value={row.confidence} /></td>
                      <td className="hidden px-3 py-3 align-top lg:table-cell"><Meter value={row.importance} /></td>
                      {searching && <td className="px-3 py-3 text-right align-top tabular-nums">{formatScore(row.score)}</td>}
                      <td className="whitespace-nowrap px-3 py-3 align-top text-muted-foreground">
                        <time dateTime={row.at}>{formatTimestamp(row.at, mode, false)}</time>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {searching ? (
              <p className="border-t px-5 py-3 text-caption text-muted-foreground" aria-live="polite">
                Showing the {data.rows.length} best {data.rows.length === 1 ? 'match' : 'matches'}. Narrow the search with a filter to see others.
              </p>
            ) : (
              <Pager
                noun="memories"
                pageNumber={paging.pageNumber}
                count={data.rows.length}
                pageSize={pageSize}
                pageSizes={SIZES}
                onPageSize={setPageSize}
                hasPrevious={paging.hasPrevious}
                hasNext={data.nextCursor !== null}
                busy={loading}
                onPrevious={paging.previous}
                onNext={() => data.nextCursor && paging.next(data.nextCursor)}
              />
            )}
          </>
        )}
      </Card>
    </div>
  );
}
