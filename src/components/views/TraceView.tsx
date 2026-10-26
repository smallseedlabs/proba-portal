import { useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronRight, Layers, Link2, Minus, Plus } from 'lucide-react';
import type { SpanNode, TraceTree } from '../../lib/api/schemas';
import { OUTCOME_LABELS } from '../../lib/labels';
import { routeHref, useRoute } from '../../lib/router';
import { formatDuration, formatTimestamp } from '../../lib/time';
import { useTimeMode } from '../../lib/time-context';
import { cn } from '../../lib/utils/cn';
import { useApi } from '../../state/api';
import { useApiQuery } from '../../state/useApiQuery';
import { OutcomeBadge, RiskBadge } from '../audit/badges';
import { CopyButton, ErrorPanel, PageHeader } from '../audit/common';
import { TraceContentSection } from '../audit/ContentPanel';
import { EventDrawer } from '../audit/EventDrawer';
import { Button } from '../ui/button';
import { Callout, Skeleton } from '../ui/feedback';
import { Card, CardBody } from '../ui/card';

interface FlatRow {
  node: SpanNode;
  depth: number;
  hasChildren: boolean;
  posInSet: number;
  setSize: number;
}

function flatten(roots: SpanNode[], collapsed: Set<string>): FlatRow[] {
  const rows: FlatRow[] = [];
  const walk = (nodes: SpanNode[], depth: number) => {
    nodes.forEach((node, i) => {
      rows.push({ node, depth, hasChildren: node.children.length > 0, posInSet: i + 1, setSize: nodes.length });
      if (node.children.length > 0 && !collapsed.has(node.eventId)) walk(node.children, depth + 1);
    });
  };
  walk(roots, 0);
  return rows;
}

function allParents(roots: SpanNode[]): string[] {
  const ids: string[] = [];
  const walk = (nodes: SpanNode[]) =>
    nodes.forEach((n) => {
      if (n.children.length > 0) ids.push(n.eventId);
      walk(n.children);
    });
  walk(roots);
  return ids;
}

const BAR_TONE = {
  success: 'bg-success',
  failure: 'bg-destructive',
  denied: 'bg-warning',
  partial: 'bg-info',
} as const;

function Timeline({ trace, onOpen }: { trace: TraceTree; onOpen: (eventId: string) => void }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const rows = useMemo(() => flatten(trace.roots, collapsed), [trace.roots, collapsed]);
  const parents = useMemo(() => allParents(trace.roots), [trace.roots]);
  const total = Math.max(trace.durationMs, 1);
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <div>
          <h2 className="text-title text-foreground">Steps</h2>
          <p className="text-caption text-muted-foreground">
            {trace.eventCount.toLocaleString('en-GB')} {trace.eventCount === 1 ? 'step' : 'steps'} over {formatDuration(trace.durationMs)}. Open a step for its full record.
          </p>
        </div>
        {parents.length > 0 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setCollapsed(new Set())}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Expand all
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCollapsed(new Set(parents))}>
              <Minus className="h-4 w-4" aria-hidden="true" /> Collapse all
            </Button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[minmax(240px,2fr)_3fr] gap-4 border-b bg-surface-sunken/60 px-5 py-2 text-caption uppercase tracking-wide text-muted-foreground">
            <span>Step</span>
            <div className="relative h-4" aria-hidden="true">
              {ticks.map((t) => (
                <span
                  key={t}
                  className={cn('absolute top-0 whitespace-nowrap normal-case', t === 1 ? '-translate-x-full' : t > 0 ? '-translate-x-1/2' : '')}
                  style={{ left: `${t * 100}%` }}
                >
                  {t === 0 ? '0' : formatDuration(total * t)}
                </span>
              ))}
            </div>
          </div>
          <ul role="tree" aria-label="Steps of this trace" className="divide-y">
            {rows.map(({ node, depth, hasChildren, posInSet, setSize }) => {
              const left = Math.min(100, Math.max(0, (node.offsetMs / total) * 100));
              const width = Math.max(0.8, Math.min(100 - left, ((node.durationMs ?? 0) / total) * 100));
              const isCollapsed = collapsed.has(node.eventId);
              return (
                <li
                  key={node.eventId}
                  role="treeitem"
                  aria-level={depth + 1}
                  aria-posinset={posInSet}
                  aria-setsize={setSize}
                  aria-expanded={hasChildren ? !isCollapsed : undefined}
                  aria-selected={false}
                  className="grid grid-cols-[minmax(240px,2fr)_3fr] items-center gap-4 px-5 py-2.5 hover:bg-muted/40"
                >
                  <div className="flex min-w-0 items-start gap-1" style={{ paddingLeft: `${depth * 20}px` }}>
                    {hasChildren ? (
                      <button
                        type="button"
                        onClick={() => toggle(node.eventId)}
                        aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${node.action}`}
                        className="-ml-1 mt-0.5 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {isCollapsed ? <ChevronRight className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
                      </button>
                    ) : (
                      <span className="w-4" aria-hidden="true" />
                    )}
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onOpen(node.eventId)}
                        aria-haspopup="dialog"
                        className="max-w-full break-all rounded-sm text-left text-body font-medium text-foreground hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {node.action}
                      </button>
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted-foreground">
                        <span>{node.service}</span>
                        <OutcomeBadge outcome={node.outcome} />
                        {node.subtreeOutcome !== node.outcome && (
                          <span className="text-destructive">
                            Contains {OUTCOME_LABELS[node.subtreeOutcome].toLowerCase()} steps
                          </span>
                        )}
                        {node.orphan && <span title="The step that started this one is not part of this trace">Parent step unavailable</span>}
                        {node.riskLevel && <RiskBadge risk={node.riskLevel} />}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="relative h-5 flex-1 rounded bg-muted/70" role="img" aria-label={`Starts at ${formatDuration(node.offsetMs)}, lasts ${formatDuration(node.durationMs)}`}>
                      <div className={cn('absolute top-1 h-3 rounded-sm', BAR_TONE[node.outcome])} style={{ left: `${left}%`, width: `${width}%` }} />
                    </div>
                    <span className="w-20 shrink-0 text-right text-caption tabular-nums text-muted-foreground">{formatDuration(node.durationMs)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Card>
  );
}

function TraceSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading trace">
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

function RelatedList({ label, ids, href }: { label: string; ids: string[]; href: (id: string) => string }) {
  if (ids.length === 0) return null;
  return (
    <div>
      <dt className="text-caption font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 flex flex-col gap-1">
        {ids.map((id) => (
          <a key={id} href={href(id)} className="inline-flex items-center gap-1 break-all rounded-sm text-caption text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Link2 className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="font-mono">{id}</span>
          </a>
        ))}
      </dd>
    </div>
  );
}

function TraceSummary({ trace: data }: TraceSectionProps) {
  const { mode } = useTimeMode();
  return (
          <Card>
    <CardBody className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">Trace ID</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="break-all font-mono text-body font-medium text-foreground" data-testid="trace-id">{data.traceId}</span>
            <CopyButton value={data.traceId} label="trace ID" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <OutcomeBadge outcome={data.outcome} />
          <RiskBadge risk={data.riskLevel} />
        </div>
      </div>
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-caption font-medium uppercase tracking-wide text-muted-foreground">Started</dt>
          <dd className="mt-1 text-body text-foreground"><time dateTime={data.startedAt}>{formatTimestamp(data.startedAt, mode)}</time></dd>
        </div>
        <div>
          <dt className="text-caption font-medium uppercase tracking-wide text-muted-foreground">Duration</dt>
          <dd className="mt-1 text-body text-foreground">{formatDuration(data.durationMs)}</dd>
        </div>
        <div>
          <dt className="text-caption font-medium uppercase tracking-wide text-muted-foreground">Steps</dt>
          <dd className="mt-1 text-body text-foreground">{data.eventCount.toLocaleString('en-GB')}</dd>
        </div>
        <div>
          <dt className="text-caption font-medium uppercase tracking-wide text-muted-foreground">Audit trail</dt>
          <dd className="mt-1 text-body">
            <a
              href={routeHref({ section: 'explorer', query: { traceId: data.traceId, range: 'any' } })}
              className="inline-flex items-center gap-1 rounded-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Layers className="h-4 w-4" aria-hidden="true" />
              Open in Audit Explorer
            </a>
          </dd>
        </div>
      </dl>
      {(data.related.goalIds.length > 0 || data.related.threadIds.length > 0 || data.related.campaignIds.length > 0) && (
        <dl className="grid gap-x-8 gap-y-4 border-t pt-4 sm:grid-cols-3">
          <RelatedList label="Goals" ids={data.related.goalIds} href={(id) => routeHref({ section: 'explorer', query: { goalId: id, range: 'any' } })} />
          <RelatedList label="Threads" ids={data.related.threadIds} href={(id) => routeHref({ section: 'explorer', query: { threadId: id, range: 'any' } })} />
          <RelatedList label="Campaigns" ids={data.related.campaignIds} href={(id) => routeHref({ section: 'analytics', query: { campaignId: id } })} />
        </dl>
      )}
    </CardBody>
  </Card>
  );
}

function TraceNotices({ trace: data }: TraceSectionProps) {
  return (
    <>
          {data.truncated && (
        <Callout tone="warning" title="This trace is longer than what can be shown" role="status">
          The first {data.eventCount.toLocaleString('en-GB')} steps are listed. Use Audit Explorer with this trace ID to page through every event.
        </Callout>
      )}
    </>
  );
}

function TraceSteps({ trace, onOpenEvent }: TraceSectionProps) {
  return <Timeline trace={trace} onOpen={onOpenEvent} />;
}

function TraceContent({ trace, onOpenEvent }: TraceSectionProps) {
  return <TraceContentSection traceId={trace.traceId} onOpenEvent={onOpenEvent} />;
}

interface TraceSectionProps {
  trace: TraceTree;
  onOpenEvent: (eventId: string) => void;
}

/**
 * The sections of the trace page, top to bottom. A new section is one more entry here plus its
 * component; nothing else on this page changes. `content` (raw text of the steps) is administrators
 * only: it asks the audit API for nothing unless the session role is admin, and renders nothing when
 * the API has no text.
 */
const TRACE_SECTIONS: Array<{ id: string; Section: (props: TraceSectionProps) => JSX.Element }> = [
  { id: 'summary', Section: TraceSummary },
  { id: 'notices', Section: TraceNotices },
  { id: 'steps', Section: TraceSteps },
  { id: 'content', Section: TraceContent },
];

export function TraceView({ traceId }: { traceId: string }) {
  const api = useApi();
  const [route, navigate] = useRoute();
  const trace = useApiQuery(`trace:${traceId}`, (signal) => api.getTrace(traceId, { signal }));
  const eventId = route.query.get('event');

  const openEvent = (id: string | null) => {
    const params = new URLSearchParams(route.query);
    if (id) params.set('event', id);
    else params.delete('event');
    navigate({ section: 'traces', id: traceId, query: params }, { replace: true });
  };

  const data = trace.state.data;

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 lg:px-8">
      <a href={routeHref({ section: 'traces' })} className="inline-flex items-center gap-1.5 rounded-sm text-body font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All traces
      </a>
      <PageHeader title="Trace" description="Every step taken to complete one request, in order, with how long each took." />

      {trace.state.status === 'error' ? (
        <Card>
          <ErrorPanel
            error={trace.state.error}
            onRetry={trace.reload}
            title={trace.state.error.kind === 'not_found' ? 'We couldn’t find this trace' : 'We couldn’t load this trace'}
          />
        </Card>
      ) : !data ? (
        <TraceSkeleton />
      ) : (
        <>
          {TRACE_SECTIONS.map(({ id, Section }) => (
            <Section key={id} trace={data} onOpenEvent={openEvent} />
          ))}
        </>
      )}

      <EventDrawer eventId={eventId} onClose={() => openEvent(null)} />
    </div>
  );
}
