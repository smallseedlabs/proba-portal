import { ExternalLink, GitBranch } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AuditEventRecord } from '../../lib/api/schemas';
import { ACTOR_TYPE_LABELS, CATEGORY_LABELS, labelFor } from '../../lib/labels';
import { routeHref } from '../../lib/router';
import { formatDuration, formatTimestamp } from '../../lib/time';
import { useTimeMode } from '../../lib/time-context';
import { useApi } from '../../state/api';
import { useApiQuery } from '../../state/useApiQuery';
import { buttonClassName } from '../ui/button';
import { Skeleton } from '../ui/feedback';
import { Drawer } from '../ui/drawer';
import { OutcomeBadge, RiskBadge } from './badges';
import { CopyButton, ErrorPanel, Mono } from './common';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-caption font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-body text-foreground">{children}</dd>
    </div>
  );
}

function RelatedLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="inline-flex items-center gap-1 break-all rounded-sm font-mono text-caption text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {children}
    </a>
  );
}

function EventBody({ event }: { event: AuditEventRecord }) {
  const { mode } = useTimeMode();
  const json = JSON.stringify(event, null, 2);
  return (
    <div className="space-y-6 px-6 py-5">
      <div className="flex flex-wrap items-center gap-2">
        <OutcomeBadge outcome={event.outcome} />
        {event.riskLevel && <RiskBadge risk={event.riskLevel} />}
        <a href={routeHref({ section: 'traces', id: event.traceId })} className={buttonClassName('outline', 'sm')}>
          <GitBranch className="h-4 w-4" aria-hidden="true" />
          <span className="ml-1.5">View trace</span>
        </a>
      </div>

      {(event.errorCode || event.errorMessage) && (
        <div role="note" className="rounded-lg border border-destructive/30 bg-destructive-subtle px-4 py-3">
          <p className="text-body font-semibold text-foreground">{event.errorCode ?? 'Error'}</p>
          {event.errorMessage && <p className="mt-0.5 text-body text-foreground/85">{event.errorMessage}</p>}
        </div>
      )}

      <dl className="divide-y">
        <Row label="Occurred"><time dateTime={event.occurredAt}>{formatTimestamp(event.occurredAt, mode)}</time></Row>
        <Row label="Recorded"><time dateTime={event.ingestedAt}>{formatTimestamp(event.ingestedAt, mode)}</time></Row>
        <Row label="Duration">{formatDuration(event.durationMs)}</Row>
        <Row label="Service">{event.service}</Row>
        <Row label="Category">{labelFor(CATEGORY_LABELS, event.category)}</Row>
        <Row label="Actor">
          {event.actor.id} <span className="text-muted-foreground">({labelFor(ACTOR_TYPE_LABELS, event.actor.type)})</span>
        </Row>
        {event.target && <Row label="Target">{event.target.type} · <Mono>{event.target.id}</Mono></Row>}
        <Row label="Trace">
          <span className="flex flex-wrap items-center gap-2">
            <RelatedLink href={routeHref({ section: 'traces', id: event.traceId })}>{event.traceId}</RelatedLink>
            <CopyButton value={event.traceId} label="trace ID" />
          </span>
        </Row>
        <Row label="Span"><Mono>{event.spanId}</Mono>{event.parentSpanId && <span className="text-muted-foreground"> · parent <Mono>{event.parentSpanId}</Mono></span>}</Row>
        {event.goalId && (
          <Row label="Goal"><RelatedLink href={routeHref({ section: 'explorer', query: { goalId: event.goalId, range: 'any' } })}>{event.goalId}</RelatedLink></Row>
        )}
        {event.threadId && (
          <Row label="Thread"><RelatedLink href={routeHref({ section: 'explorer', query: { threadId: event.threadId, range: 'any' } })}>{event.threadId}</RelatedLink></Row>
        )}
        {event.campaignId && (
          <Row label="Campaign">
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <RelatedLink href={routeHref({ section: 'explorer', query: { campaignId: event.campaignId, range: '7d' } })}>{event.campaignId}</RelatedLink>
              <a
                href={routeHref({ section: 'analytics', query: { campaignId: event.campaignId } })}
                className="inline-flex items-center gap-1 rounded-sm text-caption font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Performance <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </span>
          </Row>
        )}
        {event.cost && (
          <Row label="Cost">
            {[
              event.cost.tokensIn !== undefined ? `${event.cost.tokensIn.toLocaleString('en-GB')} tokens in` : null,
              event.cost.tokensOut !== undefined ? `${event.cost.tokensOut.toLocaleString('en-GB')} tokens out` : null,
              event.cost.amount !== undefined ? `${event.cost.amount} ${event.cost.currency ?? ''}`.trim() : null,
            ].filter(Boolean).join(' · ')}
          </Row>
        )}
        {event.tags && event.tags.length > 0 && <Row label="Tags">{event.tags.join(', ')}</Row>}
        <Row label="Event ID"><Mono>{event.eventId}</Mono></Row>
        <Row label="Hash"><Mono>{event.hash ?? '—'}</Mono></Row>
        <Row label="Previous hash"><Mono>{event.prevHash ?? 'None (start of chain)'}</Mono></Row>
      </dl>

      <section aria-labelledby="raw-json-heading">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 id="raw-json-heading" className="text-body font-semibold text-foreground">Raw event</h3>
          <CopyButton value={json} label="event JSON">Copy JSON</CopyButton>
        </div>
        {/* A scrollable region must be reachable by keyboard. */}
        <pre
          tabIndex={0}
          aria-label="Raw event JSON"
          className="max-h-96 overflow-auto rounded-lg border bg-surface-sunken p-4 font-mono text-caption leading-5 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {json}
        </pre>
      </section>
    </div>
  );
}

/** The full record of one audit event, with its raw JSON and links to everything it belongs to. */
export function EventDrawer({ eventId, preloaded, onClose }: { eventId: string | null; preloaded?: AuditEventRecord; onClose: () => void }) {
  const api = useApi();
  const known = preloaded && preloaded.eventId === eventId ? preloaded : undefined;
  const query = useApiQuery(eventId && !known ? `event:${eventId}` : null, (signal) => api.getEvent(eventId!, { signal }));
  const event = known ?? query.state.data;

  return (
    <Drawer open={eventId !== null} onClose={onClose} title={event ? event.action : 'Event details'} description={event ? `${event.service} · ${event.category}` : undefined}>
      {event ? (
        <EventBody event={event} />
      ) : query.state.status === 'error' ? (
        <ErrorPanel error={query.state.error} onRetry={query.reload} title={query.state.error.kind === 'not_found' ? 'This event is no longer available' : undefined} />
      ) : (
        <div className="space-y-3 px-6 py-5" role="status" aria-label="Loading event">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      )}
    </Drawer>
  );
}
