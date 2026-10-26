import { useId, useState } from 'react';
import { OUTCOME_VERDICT_LABELS, FEATURE_LABELS, degradedLabel, droppedReasonLabel, sourceKindLabel } from '../../lib/memory/labels';
import { FEATURE_NAMES, type Candidate, type RetrievalStats } from '../../lib/memory/schemas';
import { routeHref } from '../../lib/router';
import { formatDuration, formatTimestamp } from '../../lib/time';
import { useTimeMode } from '../../lib/time-context';
import { CopyButton, Mono } from '../audit/common';
import { Badge } from '../ui/badge';
import { Card, CardBody, CardHeader } from '../ui/card';
import { Callout } from '../ui/feedback';
import { CategoryBadge, Definition, DefinitionGrid } from './shared';
import { formatScore, linkClass, memoryHref } from './helpers';

/** What the inspector shows, whether the retrieval was opened from the log or has just been run. */
export interface InspectedRetrieval {
  id: string;
  traceId: string;
  /** Null for a retrieval that was just run. */
  createdAt: string | null;
  /** The query text: the redacted text from the log, or the text just typed. */
  queryText: string | null;
  queryLength: number;
  filter: Record<string, unknown>;
  profile: { name: string; version: number; served: 'active' | 'canary'; shadowVersion: number | null };
  stats: RetrievalStats;
  candidates: Candidate[];
  outcome: { verdict: 'approved' | 'rejected' | 'none'; resolvedAt: string } | null;
  /** Text of the returned memories, when known (only for a retrieval that was just run). */
  headlines: Record<string, string>;
}

const FILTER_LABELS: Record<string, string> = {
  categories: 'Categories',
  statuses: 'Statuses',
  sourceKind: 'Source',
  minConfidence: 'Minimum confidence',
  minImportance: 'Minimum importance',
  goalId: 'Goal',
  threadId: 'Conversation',
  createdFrom: 'Recorded from',
  createdTo: 'Recorded before',
};

function filterSummary(filter: Record<string, unknown>): string[] {
  return Object.entries(filter)
    .filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => `${FILTER_LABELS[k] ?? k}: ${Array.isArray(v) ? v.join(', ') : k === 'sourceKind' ? sourceKindLabel(String(v)) : String(v)}`);
}

type Show = 'all' | 'returned' | 'left-out';

function Feature({ value }: { value: number }) {
  return <span className="tabular-nums">{formatScore(value, 2)}</span>;
}

export function RetrievalPanel({ retrieval }: { retrieval: InspectedRetrieval }) {
  const { mode } = useTimeMode();
  const [show, setShow] = useState<Show>('all');
  const groupId = useId();
  const { stats, candidates } = retrieval;
  const shown = candidates.filter((c) => (show === 'all' ? true : show === 'returned' ? c.selected : !c.selected));
  const filters = filterSummary(retrieval.filter);

  return (
    <div className="space-y-6" data-testid="retrieval-panel">
      <Card aria-labelledby="retrieval-summary">
        <CardHeader
          id="retrieval-summary"
          titleAs="h2"
          title="Retrieval"
          description={
            <span className="inline-flex flex-wrap items-center gap-2">
              <Mono>{retrieval.id}</Mono>
              <CopyButton value={retrieval.id} label="retrieval ID" />
            </span>
          }
        />
        <CardBody className="space-y-4">
          <DefinitionGrid>
            <Definition term="Scoring profile">
              {retrieval.profile.name} v{retrieval.profile.version}{' '}
              <Badge tone={retrieval.profile.served === 'canary' ? 'warning' : 'success'}>{retrieval.profile.served === 'canary' ? 'Canary' : 'Active'}</Badge>
            </Definition>
            <Definition term="Shadow profile">{retrieval.profile.shadowVersion !== null ? `${retrieval.profile.name} v${retrieval.profile.shadowVersion}` : 'None'}</Definition>
            <Definition term="When">{retrieval.createdAt ? <time dateTime={retrieval.createdAt}>{formatTimestamp(retrieval.createdAt, mode)}</time> : 'Just now'}</Definition>
            <Definition term="Trace">
              <a href={routeHref({ section: 'traces', id: retrieval.traceId })} className={linkClass}>
                <Mono>{retrieval.traceId}</Mono>
              </a>
            </Definition>
            <Definition term="Question">
              {retrieval.queryText ? <span className="whitespace-pre-wrap break-words" data-testid="retrieval-query">{retrieval.queryText}</span> : `${retrieval.queryLength.toLocaleString('en-GB')} characters`}
            </Definition>
            <Definition term="Filters">{filters.length ? <span className="block">{filters.join(' · ')}</span> : 'None'}</Definition>
            <Definition term="Outcome">
              {retrieval.outcome ? `${OUTCOME_VERDICT_LABELS[retrieval.outcome.verdict]} · ${formatTimestamp(retrieval.outcome.resolvedAt, mode, false)}` : 'Not resolved yet'}
            </Definition>
            <Definition term="Time taken">{formatDuration(stats.durationMs)}</Definition>
          </DefinitionGrid>
          <DefinitionGrid className="border-t pt-4">
            <Definition term="Found by meaning">{stats.vectorCandidates.toLocaleString('en-GB')}</Definition>
            <Definition term="Found by keywords">{stats.textCandidates.toLocaleString('en-GB')}</Definition>
            <Definition term="After merging">{stats.fused.toLocaleString('en-GB')}</Definition>
            <Definition term="Scored">{stats.scored.toLocaleString('en-GB')}</Definition>
            <Definition term="Returned">{stats.returned.toLocaleString('en-GB')}</Definition>
            <Definition term="Tokens used">{stats.tokensUsed.toLocaleString('en-GB')} of {stats.tokenBudget.toLocaleString('en-GB')}</Definition>
          </DefinitionGrid>
          {stats.degraded.length > 0 && (
            <Callout tone="warning" title="Some steps were skipped" role="status">
              {stats.degraded.map(degradedLabel).join('. ')}.
            </Callout>
          )}
        </CardBody>
      </Card>

      <Card aria-labelledby="retrieval-candidates">
        <CardHeader
          id="retrieval-candidates"
          titleAs="h2"
          title="Candidates and scores"
          description="Every memory that was considered, with the feature scores (0 to 1) that decided its rank."
          actions={
            <div role="group" aria-labelledby={groupId} className="inline-flex items-center rounded-md border bg-surface p-0.5">
              <span id={groupId} className="sr-only">Show</span>
              {([['all', 'All'], ['returned', 'Returned'], ['left-out', 'Left out']] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={show === value}
                  onClick={() => setShow(value)}
                  className={`h-7 rounded px-2.5 text-caption font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${show === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          }
        />
        {candidates.length === 0 ? (
          <p className="px-5 py-4 text-body text-muted-foreground">No memory matched this question, so nothing was scored.</p>
        ) : shown.length === 0 ? (
          <p className="px-5 py-4 text-body text-muted-foreground">{show === 'returned' ? 'No memory was returned.' : 'Every candidate was returned.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-left text-body" data-testid="candidates-table">
              <caption className="sr-only">Candidates considered for this retrieval</caption>
              <thead className="border-b bg-surface-sunken/60 text-caption uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-5 py-2.5 font-medium">Result</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Memory</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Score</th>
                  {FEATURE_NAMES.map((f) => (
                    <th key={f} scope="col" className="px-3 py-2.5 text-right font-medium">{FEATURE_LABELS[f]}</th>
                  ))}
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Meaning rank</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Keyword rank</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Score breakdown</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {shown.map((c) => (
                  <tr key={c.id} className={c.selected ? 'bg-primary-subtle/30' : undefined} data-selected={c.selected}>
                    <td className="px-5 py-3 align-top">
                      {c.selected ? <Badge tone="success">Returned #{c.position}</Badge> : <Badge tone="neutral">{droppedReasonLabel(c.droppedReason)}</Badge>}
                    </td>
                    <td className="max-w-xs px-3 py-3 align-top">
                      <div className="flex flex-wrap items-center gap-2">
                        <CategoryBadge category={c.category} />
                      </div>
                      <a href={memoryHref(c.id)} className={`${linkClass} mt-1 block break-words text-body`}>
                        {retrieval.headlines[c.id] ? <span className="line-clamp-2 font-medium text-foreground">{retrieval.headlines[c.id]}</span> : <Mono>{c.id}</Mono>}
                      </a>
                    </td>
                    <td className="px-3 py-3 text-right align-top font-semibold tabular-nums">{formatScore(c.score)}</td>
                    {FEATURE_NAMES.map((f) => (
                      <td key={f} className="px-3 py-3 text-right align-top"><Feature value={c.features[f]} /></td>
                    ))}
                    <td className="px-3 py-3 text-right align-top tabular-nums text-muted-foreground">{c.vectorRank ?? '—'}</td>
                    <td className="px-3 py-3 text-right align-top tabular-nums text-muted-foreground">{c.ftsRank ?? '—'}</td>
                    <td className="px-3 py-3 align-top">
                      <details>
                        <summary className="cursor-pointer rounded-sm text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          Show<span className="sr-only"> how this score was built</span>
                        </summary>
                        <dl className="mt-2 space-y-1 text-caption">
                          {Object.entries(c.components).map(([name, value]) => (
                            <div key={name} className="flex justify-between gap-4">
                              <dt className="text-muted-foreground">{(FEATURE_LABELS as Record<string, string>)[name] ?? name}</dt>
                              <dd className="tabular-nums">{formatScore(value, 3)}</dd>
                            </div>
                          ))}
                          <div className="flex justify-between gap-4 border-t pt-1">
                            <dt className="text-muted-foreground">Combined rank</dt>
                            <dd className="tabular-nums">{formatScore(c.fusedScore, 4)}</dd>
                          </div>
                          {c.vectorSimilarity !== null && (
                            <div className="flex justify-between gap-4">
                              <dt className="text-muted-foreground">Similarity</dt>
                              <dd className="tabular-nums">{formatScore(c.vectorSimilarity, 2)}</dd>
                            </div>
                          )}
                        </dl>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
