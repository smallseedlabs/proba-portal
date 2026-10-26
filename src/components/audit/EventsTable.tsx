import { ChevronRight } from 'lucide-react';
import type { AuditEventRecord } from '../../lib/api/schemas';
import { formatDuration, formatTimestamp } from '../../lib/time';
import { useTimeMode } from '../../lib/time-context';
import { OutcomeBadge, RiskBadge } from './badges';

/** A page of audit events. The action opens the event's details. */
export function EventsTable({
  events,
  onOpen,
  selectedId,
  caption,
}: {
  events: AuditEventRecord[];
  onOpen: (event: AuditEventRecord) => void;
  selectedId?: string;
  caption: string;
}) {
  const { mode } = useTimeMode();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-body">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b bg-surface-sunken/60 text-caption uppercase tracking-wide text-muted-foreground">
          <tr>
            <th scope="col" className="whitespace-nowrap px-5 py-2.5 font-medium">Time</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Action</th>
            <th scope="col" className="hidden px-3 py-2.5 font-medium md:table-cell">Actor</th>
            <th scope="col" className="hidden px-3 py-2.5 font-medium lg:table-cell">Service</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Outcome</th>
            <th scope="col" className="hidden px-3 py-2.5 font-medium xl:table-cell">Risk</th>
            <th scope="col" className="hidden whitespace-nowrap px-3 py-2.5 text-right font-medium xl:table-cell">Duration</th>
            <th scope="col" className="w-10 px-3 py-2.5"><span className="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {events.map((event) => (
            <tr key={event.eventId} className={selectedId === event.eventId ? 'bg-primary-subtle/50' : 'hover:bg-muted/40'}>
              <td className="whitespace-nowrap px-5 py-3 align-top text-muted-foreground">
                <time dateTime={event.occurredAt}>{formatTimestamp(event.occurredAt, mode)}</time>
              </td>
              <td className="min-w-0 px-3 py-3 align-top">
                <button
                  type="button"
                  onClick={() => onOpen(event)}
                  aria-haspopup="dialog"
                  className="rounded-sm text-left font-medium text-foreground hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {event.action}
                  <span className="sr-only">, {formatTimestamp(event.occurredAt, mode)}. Open details</span>
                </button>
                {event.target && (
                  <p className="mt-0.5 break-all text-caption text-muted-foreground">
                    {event.target.type} · {event.target.id}
                  </p>
                )}
                {event.errorCode && <p className="mt-0.5 text-caption text-destructive">{event.errorCode}</p>}
              </td>
              <td className="hidden break-all px-3 py-3 align-top text-muted-foreground md:table-cell">{event.actor.id}</td>
              <td className="hidden px-3 py-3 align-top text-muted-foreground lg:table-cell">{event.service}</td>
              <td className="px-3 py-3 align-top"><OutcomeBadge outcome={event.outcome} /></td>
              <td className="hidden px-3 py-3 align-top xl:table-cell"><RiskBadge risk={event.riskLevel} /></td>
              <td className="hidden whitespace-nowrap px-3 py-3 text-right align-top tabular-nums text-muted-foreground xl:table-cell">
                {formatDuration(event.durationMs)}
              </td>
              <td className="px-3 py-3 align-top text-muted-foreground" aria-hidden="true"><ChevronRight className="h-4 w-4" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
