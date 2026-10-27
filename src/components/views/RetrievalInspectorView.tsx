import { useId, useState, type FormEvent } from 'react';
import { Microscope, Search } from 'lucide-react';
import { ApiError, isApiError } from '../../lib/api/errors';
import { memoryHeadline } from '../../lib/memory/labels';
import type { RetrievalRecord, SearchResponse } from '../../lib/memory/schemas';
import { useRoute } from '../../lib/router';
import { useApiContext, useMemoryApi } from '../../state/api';
import { useApiQuery } from '../../state/useApiQuery';
import { ErrorPanel, PageHeader } from '../audit/common';
import { AdminOnly } from '../memory/shared';
import { RetrievalPanel, type InspectedRetrieval } from '../memory/RetrievalPanel';
import { Button } from '../ui/button';
import { Card, CardBody, CardHeader } from '../ui/card';
import { EmptyState, Skeleton } from '../ui/feedback';
import { FieldError, FieldHint, Input, Label } from '../ui/field';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fromRecord(r: RetrievalRecord): InspectedRetrieval {
  return {
    id: r.id,
    traceId: r.traceId,
    createdAt: r.createdAt,
    queryText: r.queryText,
    queryLength: r.queryText.length,
    filter: r.filter,
    profile: r.profile,
    stats: r.stats,
    candidates: r.candidates,
    outcome: r.outcome,
    headlines: {},
  };
}

function fromSearch(query: string, r: SearchResponse): InspectedRetrieval {
  return {
    id: r.retrievalId,
    traceId: r.traceId,
    createdAt: null,
    queryText: query,
    queryLength: r.query.length,
    filter: {},
    profile: { name: r.profile.name, version: r.profile.version, served: r.profile.served, shadowVersion: r.profile.shadow?.version ?? null },
    stats: r.stats,
    candidates: r.candidates ?? [],
    outcome: null,
    headlines: Object.fromEntries(r.results.map((m) => [m.id, memoryHeadline(m)])),
  };
}

type Run = { status: 'idle' } | { status: 'running' } | { status: 'done'; retrieval: InspectedRetrieval } | { status: 'error'; error: ApiError };

export function RetrievalInspectorView({ retrievalId }: { retrievalId?: string }) {
  const memory = useMemoryApi();
  const { access, onSessionExpired } = useApiContext();
  const [, navigate] = useRoute();
  const admin = access.role === 'admin';
  const [lookup, setLookup] = useState('');
  const [lookupError, setLookupError] = useState<string | undefined>();
  const [query, setQuery] = useState('');
  const [queryError, setQueryError] = useState<string | undefined>();
  const [run, setRun] = useState<Run>({ status: 'idle' });
  const lookupId = useId();
  const lookupErrorId = useId();
  const queryId = useId();
  const queryErrorId = useId();
  const queryHintId = useId();

  const logged = useApiQuery(admin && retrievalId ? `retrieval:${retrievalId}` : null, async (signal) => fromRecord(await memory.getRetrieval(retrievalId!, { signal })));

  if (!admin || (logged.state.status === 'error' && logged.state.error.code === 'insufficient_role')) {
    return (
      <AdminOnly
        title="Retrieval Inspector"
        description="Only workspace administrators can see which memories were considered for a question and how each was scored. Ask an administrator, or to change your role."
      />
    );
  }

  const openLogged = (e: FormEvent) => {
    e.preventDefault();
    const value = lookup.trim();
    if (!UUID.test(value)) {
      setLookupError('Enter a full retrieval ID, like 3f2b8c1e-5a7d-4e90-b1c2-6d8f0a9e4b73.');
      return;
    }
    setLookupError(undefined);
    setRun({ status: 'idle' });
    navigate({ section: 'retrievals', id: value.toLowerCase() });
  };

  const execute = async (e: FormEvent) => {
    e.preventDefault();
    const text = query.trim();
    if (!text) return setQueryError('Enter a question to search for.');
    if (text.length > 2000) return setQueryError('A question can be at most 2,000 characters.');
    setQueryError(undefined);
    setRun({ status: 'running' });
    if (retrievalId) navigate({ section: 'retrievals' }, { replace: true });
    try {
      const response = await memory.searchMemories({ query: text, limit: 10, includeCandidates: true });
      setRun({ status: 'done', retrieval: fromSearch(text, response) });
    } catch (error) {
      const apiError = isApiError(error) ? error : new ApiError('unavailable', 'Something went wrong. Please try again.');
      if (apiError.kind === 'unauthenticated') onSessionExpired();
      setRun({ status: 'error', error: apiError });
    }
  };

  const shown: InspectedRetrieval | undefined = run.status === 'done' ? run.retrieval : retrievalId ? logged.state.data : undefined;
  const loadingLogged = Boolean(retrievalId) && run.status !== 'done' && logged.state.status === 'loading' && !logged.state.data;

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 lg:px-8">
      <PageHeader
        title="Retrieval Inspector"
        description="See how a retrieval chose its memories: every candidate that was considered, the scores that ranked it, and why the others were left out."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Open a logged retrieval" description="Every retrieval is logged with its candidates and scores." titleAs="h2" />
          <form onSubmit={openLogged} noValidate aria-label="Open a retrieval by ID">
            <CardBody className="space-y-1.5">
              <Label htmlFor={lookupId}>Retrieval ID</Label>
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
                  <Microscope className="h-4 w-4" aria-hidden="true" />
                  Open
                </Button>
              </div>
              <FieldError id={lookupErrorId}>{lookupError}</FieldError>
            </CardBody>
          </form>
        </Card>

        <Card>
          <CardHeader title="Run a search and inspect it" description="Ask a question the way a plan would, and see how it is answered." titleAs="h2" />
          <form onSubmit={(e) => void execute(e)} noValidate aria-label="Run a search and inspect it">
            <CardBody className="space-y-1.5">
              <Label htmlFor={queryId}>Question</Label>
              <div className="flex gap-2">
                <Input
                  id={queryId}
                  value={query}
                  placeholder="For example: when does a campaign budget need approval"
                  aria-invalid={queryError ? true : undefined}
                  aria-describedby={`${queryHintId}${queryError ? ` ${queryErrorId}` : ''}`}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setQueryError(undefined);
                  }}
                />
                <Button type="submit" loading={run.status === 'running'}>
                  {run.status !== 'running' && <Search className="h-4 w-4" aria-hidden="true" />}
                  Run
                </Button>
              </div>
              <FieldHint id={queryHintId}>The search is recorded as a retrieval, and in the audit trail, like any other.</FieldHint>
              <FieldError id={queryErrorId}>{queryError}</FieldError>
            </CardBody>
          </form>
        </Card>
      </div>

      {run.status === 'error' ? (
        <Card><ErrorPanel error={run.error} onRetry={() => setRun({ status: 'idle' })} title="We couldn’t run this search" /></Card>
      ) : run.status !== 'done' && retrievalId && logged.state.status === 'error' ? (
        <Card>
          <ErrorPanel
            error={logged.state.error}
            onRetry={logged.reload}
            title={logged.state.error.kind === 'not_found' ? 'We couldn’t find this retrieval' : 'We couldn’t load this retrieval'}
          />
        </Card>
      ) : loadingLogged || run.status === 'running' ? (
        <div className="space-y-4" role="status" aria-label="Loading retrieval">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : shown ? (
        <RetrievalPanel retrieval={shown} />
      ) : (
        <Card>
          <EmptyState
            icon={<Microscope className="h-6 w-6" />}
            title="No retrieval open"
            description="Open a logged retrieval by its ID, or run a search to see how its memories were chosen."
          />
        </Card>
      )}
    </div>
  );
}
