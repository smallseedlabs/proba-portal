import { CircleAlert, CircleCheck, Eye } from 'lucide-react';
import type { ReactNode } from 'react';
import { useId } from 'react';
import type { EventContent } from '../../lib/api/schemas';
import { contentKindLabel } from '../../lib/labels';
import { formatTimestamp } from '../../lib/time';
import { useTimeMode } from '../../lib/time-context';
import { useApi } from '../../state/api';
import { useCanReadContent } from '../../state/useCanReadContent';
import { useApiQuery } from '../../state/useApiQuery';
import { Badge } from '../ui/badge';
import { Card, CardHeader } from '../ui/card';
import { Skeleton } from '../ui/feedback';
import { CopyButton, ErrorPanel } from './common';

const CONTENT_NOTICE = 'Visible to administrators only. Each time raw text is opened it is recorded in the audit trail.';

const count = (n: number) => n.toLocaleString('en-GB');

/** One piece of raw text with what is known about it. The text is rendered as plain text, never as markup. */
export function ContentBlock({
  item,
  headingLevel = 3,
  actions,
  showStep = false,
}: {
  item: EventContent;
  headingLevel?: 3 | 4;
  actions?: ReactNode;
  /** Name the step (action and time) in the heading: used where several texts are listed together. */
  showStep?: boolean;
}) {
  const { mode } = useTimeMode();
  const id = useId();
  const kind = contentKindLabel(item.content.kind);
  const Heading = `h${headingLevel}` as 'h3' | 'h4';
  const { content } = item;
  return (
    <article aria-labelledby={`${id}-title`} className="space-y-3" data-testid="content-block" data-kind={content.kind}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Heading id={`${id}-title`} className="text-body font-semibold text-foreground">
            {kind}
            {showStep && (
              <span className="ml-2 font-mono text-caption font-normal text-muted-foreground">{item.action}</span>
            )}
          </Heading>
          {showStep && (
            <p className="text-caption text-muted-foreground">
              <time dateTime={item.occurredAt}>{formatTimestamp(item.occurredAt, mode)}</time>
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <CopyButton value={content.text} label={`${kind.toLowerCase()} text`}>
            Copy text
          </CopyButton>
        </div>
      </div>

      <pre
        tabIndex={0}
        aria-labelledby={`${id}-title`}
        data-testid="content-text"
        className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-surface-sunken p-4 font-sans text-body leading-6 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {content.text}
      </pre>

      <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 text-caption text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <dt>Length</dt>
          <dd className="text-foreground">
            {content.truncated
              ? `${count(content.text.length)} of ${count(content.originalLength)} characters`
              : `${count(content.originalLength)} ${content.originalLength === 1 ? 'character' : 'characters'}`}
          </dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt>Secrets masked</dt>
          <dd className="text-foreground" data-testid="content-redactions">{count(content.redactions)}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">Integrity</dt>
          <dd>
            {item.verified ? (
              <Badge tone="success">
                <CircleCheck className="h-3 w-3" aria-hidden="true" />
                Matches the audit trail record
              </Badge>
            ) : (
              <Badge tone="danger">
                <CircleAlert className="h-3 w-3" aria-hidden="true" />
                Does not match the audit trail record
              </Badge>
            )}
          </dd>
        </div>
      </dl>

      {content.truncated && (
        <p role="note" className="rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-caption text-foreground">
          Shortened when it was recorded: the first {count(content.text.length)} of {count(content.originalLength)} characters are kept.
        </p>
      )}
      {!item.verified && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive-subtle px-3 py-2 text-caption text-foreground">
          This text was changed after it was recorded, so it can’t be relied on. Run an integrity check and contact your security team.
        </p>
      )}
    </article>
  );
}

function PanelShell({ title, children, id }: { title: string; children: ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} data-testid="content-panel">
      <Card>
        <CardHeader
          id={id}
          titleAs="h2"
          title={
            <span className="inline-flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              {title}
            </span>
          }
          description={CONTENT_NOTICE}
        />
        <div className="space-y-6 px-5 py-4">{children}</div>
      </Card>
    </section>
  );
}

/** A request that failed in a way worth showing. A missing or switched-off text, or a refusal, shows nothing at all. */
function hiddenFor(error: { kind: string }): boolean {
  return error.kind === 'not_found' || error.kind === 'forbidden';
}

/** The raw text of one event, inside the event drawer. Renders nothing for viewers and when there is no text. */
export function EventContentSection({ eventId, hasContent }: { eventId: string; hasContent: boolean }) {
  const api = useApi();
  const allowed = useCanReadContent();
  const enabled = allowed && hasContent;
  const query = useApiQuery(enabled ? `content:event:${eventId}` : null, (signal) => api.getEventContent(eventId, { signal }));
  const headingId = useId();
  if (!enabled) return null;
  const { state } = query;
  if (state.status === 'error') {
    if (hiddenFor(state.error)) return null;
    return (
      <section aria-labelledby={headingId} data-testid="content-panel">
        <h3 id={headingId} className="mb-2 text-body font-semibold text-foreground">Raw text</h3>
        <div className="rounded-lg border">
          <ErrorPanel error={state.error} onRetry={query.reload} title="We couldn’t load the raw text" className="py-8" />
        </div>
      </section>
    );
  }
  if (!state.data) {
    return (
      <section aria-labelledby={headingId} data-testid="content-panel">
        <h3 id={headingId} className="mb-2 text-body font-semibold text-foreground">Raw text</h3>
        <div className="space-y-2" role="status" aria-label="Loading raw text">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-24 w-full" />
        </div>
      </section>
    );
  }
  return (
    <section aria-labelledby={headingId} data-testid="content-panel">
      <div className="mb-3">
        <h3 id={headingId} className="text-body font-semibold text-foreground">Raw text</h3>
        <p className="text-caption text-muted-foreground">{CONTENT_NOTICE}</p>
      </div>
      <ContentBlock item={state.data} headingLevel={4} />
    </section>
  );
}

/** The raw text of every step of a trace that has some, on the trace page. Renders nothing for viewers and when there is none. */
export function TraceContentSection({ traceId, onOpenEvent }: { traceId: string; onOpenEvent: (eventId: string) => void }) {
  const api = useApi();
  const allowed = useCanReadContent();
  const query = useApiQuery(allowed ? `content:trace:${traceId}` : null, (signal) => api.getTraceContent(traceId, { signal }));
  const headingId = useId();
  if (!allowed) return null;
  const { state } = query;
  if (state.status === 'error') {
    if (hiddenFor(state.error)) return null;
    return (
      <PanelShell id={headingId} title="Raw text">
        <ErrorPanel error={state.error} onRetry={query.reload} title="We couldn’t load the raw text" className="py-6" />
      </PanelShell>
    );
  }
  if (!state.data || state.data.items.length === 0) return null;
  const { items, truncated } = state.data;
  return (
    <PanelShell id={headingId} title="Raw text">
      {truncated && (
        <p role="note" className="rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-caption text-foreground">
          This trace is longer than what can be shown, so the text of later steps is not included.
        </p>
      )}
      <ol className="space-y-6 divide-y [&>li]:pt-6 [&>li:first-child]:pt-0">
        {items.map((item) => (
          <li key={item.eventId}>
            <ContentBlock
              item={item}
              showStep
              actions={
                <button
                  type="button"
                  onClick={() => onOpenEvent(item.eventId)}
                  aria-haspopup="dialog"
                  aria-label={`Open step ${item.action}`}
                  className="rounded-sm text-caption font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Open step
                </button>
              }
            />
          </li>
        ))}
      </ol>
    </PanelShell>
  );
}
