import { ArrowLeft, ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { OUTCOME_VERDICT_LABELS, RELATION_LABELS, memoryHeadline, sourceKindLabel } from '../../lib/memory/labels';
import { loadSupersedesChain, type ChainEntry } from '../../lib/memory/supersedes';
import type { MemoryLinkRecord, MemoryRecord } from '../../lib/memory/schemas';
import { routeHref } from '../../lib/router';
import { formatTimestamp } from '../../lib/time';
import { useTimeMode } from '../../lib/time-context';
import { useApiContext, useMemoryApi } from '../../state/api';
import { useApiQuery } from '../../state/useApiQuery';
import { CopyButton, ErrorPanel, Mono, PageHeader } from '../audit/common';
import { CategoryBadge, Definition, DefinitionGrid, MemoryStatusBadge, Meter } from '../memory/shared';
import { formatScore, isNotProvided, linkClass, memoryHref, retrievalHref } from '../memory/helpers';
import { Badge } from '../ui/badge';
import { Card, CardBody, CardHeader } from '../ui/card';
import { Callout, Skeleton } from '../ui/feedback';

function Section({ title, description, children, id }: { title: string; description?: string; children: ReactNode; id: string }) {
  return (
    <Card aria-labelledby={id}>
      <CardHeader id={id} title={title} description={description} titleAs="h2" />
      {children}
    </Card>
  );
}

function Time({ iso }: { iso: string | null }) {
  const { mode } = useTimeMode();
  return iso ? <time dateTime={iso}>{formatTimestamp(iso, mode)}</time> : <span className="text-muted-foreground">—</span>;
}

function Sources({ memory }: { memory: MemoryRecord }) {
  if (memory.sourceRefs.length === 0) return <p className="px-5 py-4 text-body text-muted-foreground">This memory has no recorded sources.</p>;
  return (
    <ul className="divide-y">
      {memory.sourceRefs.map((s) => {
        const eventId = s.kind === 'audit' && s.ref.startsWith('audit:') ? s.ref.slice('audit:'.length) : null;
        return (
          <li key={`${s.kind}:${s.ref}`} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <Badge tone="neutral">{sourceKindLabel(s.kind)}</Badge>
            <Mono>{s.ref}</Mono>
            {eventId && (
              <a href={routeHref({ section: 'explorer', query: { event: eventId, range: '30d' } })} className={`${linkClass} inline-flex items-center gap-1 text-caption`}>
                Open audit record
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function LinksTable({ memoryId, links }: { memoryId: string; links: MemoryLinkRecord[] }) {
  if (links.length === 0) return <p className="px-5 py-4 text-body text-muted-foreground">This memory is not linked to any other memory.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-body">
        <caption className="sr-only">Links to other memories</caption>
        <thead className="border-b bg-surface-sunken/60 text-caption uppercase tracking-wide text-muted-foreground">
          <tr>
            <th scope="col" className="px-5 py-2.5 font-medium">Relationship</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Other memory</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Strength</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Recorded</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {links.map((l) => {
            const outgoing = l.fromId === memoryId;
            const other = outgoing ? l.toId : l.fromId;
            const relation = (RELATION_LABELS as Record<string, string>)[l.relation] ?? l.relation;
            return (
              <tr key={`${l.fromId}:${l.toId}:${l.relation}`}>
                <td className="px-5 py-3 align-top font-medium text-foreground">
                  {outgoing ? relation : l.relation === 'supersedes' ? 'Replaced by' : `${relation} (from the other memory)`}
                </td>
                <td className="px-3 py-3 align-top">
                  <a href={memoryHref(other)} className={linkClass}>
                    <Mono>{other}</Mono>
                  </a>
                </td>
                <td className="px-3 py-3 align-top"><Meter value={l.weight} /></td>
                <td className="whitespace-nowrap px-3 py-3 align-top text-muted-foreground"><Time iso={l.createdAt} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ChainItem({ entry, current }: { entry: ChainEntry; current?: boolean }) {
  const m = entry.memory;
  return (
    <li className="flex flex-wrap items-start gap-3 px-5 py-3" aria-current={current ? 'true' : undefined}>
      <div className="min-w-0 flex-1">
        {current || !m ? (
          <p className="text-body text-foreground">
            {current && m ? <span className="font-medium">{memoryHeadline(m)}</span> : <Mono>{entry.id}</Mono>}
          </p>
        ) : (
          <a href={memoryHref(entry.id)} className={`${linkClass} line-clamp-2 text-body`}>
            {memoryHeadline(m)}
          </a>
        )}
        {!m && <p className="mt-0.5 text-caption text-muted-foreground">Not available to your role.</p>}
        {m && (
          <p className="mt-0.5 text-caption text-muted-foreground">
            Recorded <Time iso={m.createdAt} />
          </p>
        )}
      </div>
      {current && <Badge tone="primary">This memory</Badge>}
      {m && <MemoryStatusBadge status={m.status} />}
    </li>
  );
}

function ReplacementChain({ memory, links }: { memory: MemoryRecord; links: MemoryLinkRecord[] }) {
  const api = useMemoryApi();
  const chain = useApiQuery(`chain:${memory.id}:${memory.supersedesId ?? ''}:${links.length}`, (signal) => loadSupersedesChain(api, memory, links, { signal }));
  const data = chain.state.data;
  const loading = chain.state.status === 'loading' && !data;
  const alone = data && data.earlier.length === 0 && data.later.length === 0;

  return (
    <Section
      id="memory-chain"
      title="Replacement history"
      description="A memory is replaced when newer evidence changes what Proba should believe. Newest first."
    >
      {chain.state.status === 'error' ? (
        <ErrorPanel error={chain.state.error} onRetry={chain.reload} title="We couldn’t load the replacement history" />
      ) : loading ? (
        <div className="space-y-3 px-5 py-4" role="status" aria-label="Loading replacement history">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : alone ? (
        <p className="px-5 py-4 text-body text-muted-foreground">This memory has not replaced another memory and has not been replaced.</p>
      ) : data ? (
        <>
          <ol className="divide-y" aria-label="Memories in order, newest first">
            {[...data.later].reverse().map((e) => <ChainItem key={e.id} entry={e} />)}
            <ChainItem entry={{ id: memory.id, memory }} current />
            {data.earlier.map((e) => <ChainItem key={e.id} entry={e} />)}
          </ol>
          {(data.truncated || data.incomplete) && (
            <div className="border-t px-5 py-3">
              <Callout tone="info" role="status">
                {data.truncated ? 'The history is longer than what is shown here. ' : ''}
                {data.incomplete ? 'Some earlier or later versions are not available to your role.' : ''}
              </Callout>
            </div>
          )}
        </>
      ) : null}
    </Section>
  );
}

function RetrievalHistory({ memoryId }: { memoryId: string }) {
  const api = useMemoryApi();
  const history = useApiQuery(`history:${memoryId}`, (signal) => api.listMemoryRetrievals(memoryId, { signal }));
  const rows = history.state.data;

  return (
    <Section id="memory-history" title="Retrieval history" description="Recent retrievals that returned this memory, and what became of them.">
      {history.state.status === 'error' ? (
        isNotProvided(history.state.error) ? (
          <p className="px-5 py-4 text-body text-muted-foreground">This memory service does not provide a retrieval history yet.</p>
        ) : (
          <ErrorPanel error={history.state.error} onRetry={history.reload} title="We couldn’t load the retrieval history" />
        )
      ) : !rows ? (
        <div className="space-y-3 px-5 py-4" role="status" aria-label="Loading retrieval history">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : rows.length === 0 ? (
        <p className="px-5 py-4 text-body text-muted-foreground">This memory has not been returned by a retrieval yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-body">
            <caption className="sr-only">Retrievals that returned this memory</caption>
            <thead className="border-b bg-surface-sunken/60 text-caption uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-5 py-2.5 font-medium">When</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Position</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Score</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Scoring profile</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.retrievalId}>
                  <td className="whitespace-nowrap px-5 py-3 align-top">
                    <a href={retrievalHref(r.retrievalId)} className={linkClass}>
                      <Time iso={r.createdAt} />
                      <span className="sr-only">, open retrieval {r.retrievalId}</span>
                    </a>
                  </td>
                  <td className="px-3 py-3 align-top tabular-nums">#{r.position}</td>
                  <td className="px-3 py-3 text-right align-top tabular-nums">{formatScore(r.score)}</td>
                  <td className="px-3 py-3 align-top text-muted-foreground">{r.profile.name} v{r.profile.version}</td>
                  <td className="px-3 py-3 align-top text-muted-foreground">{r.outcome ? OUTCOME_VERDICT_LABELS[r.outcome] : 'Not resolved yet'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

export function MemoryDetailView({ memoryId }: { memoryId: string }) {
  const api = useMemoryApi();
  const { access } = useApiContext();
  const admin = access.role === 'admin';
  const detail = useApiQuery(`memory:${memoryId}`, (signal) => api.getMemory(memoryId, { signal }));
  const back = (
    <a href={routeHref({ section: 'memory' })} className={`${linkClass} inline-flex items-center gap-1.5 text-body`}>
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Memory Explorer
    </a>
  );

  if (detail.state.status === 'error') {
    return (
      <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 lg:px-8">
        {back}
        <Card>
          <ErrorPanel error={detail.state.error} onRetry={detail.reload} title={detail.state.error.kind === 'not_found' ? 'We couldn’t find this memory' : 'We couldn’t load this memory'} />
        </Card>
      </div>
    );
  }
  if (!detail.state.data) {
    return (
      <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 lg:px-8" role="status" aria-label="Loading memory">
        {back}
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const { memory, links } = detail.state.data;

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 lg:px-8">
      {back}
      <PageHeader
        title="Memory"
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <CategoryBadge category={memory.category} />
            <MemoryStatusBadge status={memory.status} />
            <Mono>{memory.id}</Mono>
            <CopyButton value={memory.id} label="memory ID" />
          </span>
        }
      />

      <Section id="memory-text" title="What Proba remembers" description="Shown exactly as it was recorded. It is information, never an instruction.">
        <CardBody className="space-y-4">
          <p className="max-w-4xl whitespace-pre-wrap break-words text-lead text-foreground" data-testid="memory-content">{memory.content}</p>
          {memory.summary && (
            <div>
              <h3 className="text-caption font-medium uppercase tracking-wide text-muted-foreground">Summary</h3>
              <p className="mt-1 max-w-4xl whitespace-pre-wrap break-words text-body text-foreground">{memory.summary}</p>
            </div>
          )}
        </CardBody>
      </Section>

      <Section id="memory-facts" title="Details">
        <CardBody>
          <DefinitionGrid>
            <Definition term="Importance"><Meter value={memory.importance} /></Definition>
            <Definition term="Confidence"><Meter value={memory.confidence} /></Definition>
            <Definition term="Usefulness"><Meter value={memory.usefulness} /></Definition>
            <Definition term="Evidence">{memory.evidenceCount.toLocaleString('en-GB')} {memory.evidenceCount === 1 ? 'observation' : 'observations'}</Definition>
            <Definition term="Valid from"><Time iso={memory.validFrom} /></Definition>
            <Definition term="Valid until">{memory.validTo ? <Time iso={memory.validTo} /> : 'Still valid'}</Definition>
            <Definition term="Last reinforced"><Time iso={memory.lastReinforcedAt} /></Definition>
            <Definition term="Last retrieved"><Time iso={memory.lastAccessedAt} /></Definition>
            <Definition term="Times retrieved">{memory.accessCount.toLocaleString('en-GB')}</Definition>
            <Definition term="Goal">{memory.goalId ? <Mono>{memory.goalId}</Mono> : '—'}</Definition>
            <Definition term="Conversation">{memory.threadId ? <Mono>{memory.threadId}</Mono> : '—'}</Definition>
            <Definition term="Recorded"><Time iso={memory.createdAt} /></Definition>
          </DefinitionGrid>
        </CardBody>
      </Section>

      <Section id="memory-provenance" title="Where it came from" description="The evidence behind this memory and how it was written.">
        <CardBody className="space-y-4">
          <DefinitionGrid>
            <Definition term="Written by">{memory.provenance.createdBy === 'extractor' ? 'Automatic extraction' : memory.provenance.createdBy.startsWith('job:') ? `Background job (${memory.provenance.createdBy.slice(4)})` : memory.provenance.createdBy}</Definition>
            <Definition term="Direction of evidence"><span className="capitalize">{memory.provenance.stance}</span></Definition>
            <Definition term="Signals">
              {memory.provenance.signals.length ? (
                <span className="flex flex-wrap gap-1.5">
                  {memory.provenance.signals.map((s) => <Badge key={s} tone="neutral"><Mono>{s}</Mono></Badge>)}
                </span>
              ) : '—'}
            </Definition>
            {admin && (
              <Definition term="Extraction model">
                {memory.provenance.extractor ? `${memory.provenance.extractor.provider} · ${memory.provenance.extractor.model} · ${memory.provenance.extractor.promptVersion}` : '—'}
              </Definition>
            )}
            {admin && (
              <Definition term="Embedding">
                {memory.embedding.model ? `${memory.embedding.model}${memory.embedding.version ? ` (${memory.embedding.version})` : ''}` : 'Not embedded yet'}
              </Definition>
            )}
          </DefinitionGrid>
        </CardBody>
        <h3 className="border-t px-5 pt-4 text-caption font-medium uppercase tracking-wide text-muted-foreground">Sources</h3>
        <Sources memory={memory} />
      </Section>

      <Section id="memory-links" title="Links" description="Memories that support, contradict or replace this one.">
        <LinksTable memoryId={memory.id} links={links} />
      </Section>

      <ReplacementChain memory={memory} links={links} />

      {admin && <RetrievalHistory memoryId={memory.id} />}
    </div>
  );
}
