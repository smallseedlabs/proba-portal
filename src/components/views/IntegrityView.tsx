import { useId, useState, type FormEvent } from 'react';
import { CircleAlert, CircleCheck, ShieldCheck, ShieldOff } from 'lucide-react';
import type { ChainVerification } from '../../lib/api/schemas';
import { ApiError, isApiError } from '../../lib/api/errors';
import { routeHref } from '../../lib/router';
import { formatTimestamp, fromInputValue, toInputValue, zoneLabel } from '../../lib/time';
import { useTimeMode } from '../../lib/time-context';
import { useApiContext } from '../../state/api';
import { CopyButton, ErrorPanel, Mono, PageHeader } from '../audit/common';
import { Button } from '../ui/button';
import { Card, CardBody, CardHeader } from '../ui/card';
import { Callout, EmptyState } from '../ui/feedback';
import { FieldError, FieldHint, Input, Label, NativeSelect } from '../ui/field';

const HOUR = 3_600_000;
const MAX_RANGE_MS = 24 * HOUR;

type Preset = 'last24' | 'previous24' | 'custom';

const PROBLEM_LABELS: Record<string, string> = {
  hash_mismatch: 'Record was changed after it was written',
  broken_link: 'Missing or reordered record in the chain',
  bad_genesis: 'The chain does not start correctly',
  workspace_mismatch: 'Record belongs to another workspace',
  invalid_event: 'Record could not be read',
  non_monotonic_ingested_at: 'Records are out of order',
};

function periodFor(preset: Preset, now: number): { from: string; to: string } {
  const to = preset === 'previous24' ? now - 24 * HOUR : now;
  return { from: new Date(to - 24 * HOUR).toISOString(), to: new Date(to).toISOString() };
}

function Result({ result }: { result: ChainVerification }) {
  const { mode } = useTimeMode();
  return (
    <Card aria-live="polite">
      <div className={result.ok ? 'rounded-t-lg border-b border-success/25 bg-success-subtle px-5 py-5' : 'rounded-t-lg border-b border-destructive/25 bg-destructive-subtle px-5 py-5'}>
        <div className="flex items-start gap-4">
          <span
            className={result.ok ? 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground' : 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground'}
            aria-hidden="true"
          >
            {result.ok ? <ShieldCheck className="h-6 w-6" /> : <CircleAlert className="h-6 w-6" />}
          </span>
          <div className="min-w-0">
            <h2 className="text-title text-foreground" data-testid="integrity-verdict">
              {result.ok ? 'Chain intact' : `${result.problems.length} ${result.problems.length === 1 ? 'problem' : 'problems'} found`}
            </h2>
            <p className="mt-0.5 text-body text-foreground/85">
              {result.ok
                ? `All ${result.checked.toLocaleString('en-GB')} records in this range are present, in order and unchanged since they were written.`
                : `${result.checked.toLocaleString('en-GB')} records were checked. The records listed below do not match what was originally written.`}
            </p>
          </div>
        </div>
      </div>
      <CardBody className="space-y-5">
        {result.truncated && (
          <Callout tone="warning" title="Verification covered part of this range" role="status">
            Checking stopped after {result.checked.toLocaleString('en-GB')} records. Choose a shorter range to verify the rest.
          </Callout>
        )}
        {!result.complete && !result.truncated && (
          <Callout tone="warning" title="This check is incomplete" role="status">
            Not every record in the range could be read. Run the check again.
          </Callout>
        )}
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-caption font-medium uppercase tracking-wide text-muted-foreground">Records checked</dt>
            <dd className="mt-1 text-body text-foreground">{result.checked.toLocaleString('en-GB')}</dd>
          </div>
          <div>
            <dt className="text-caption font-medium uppercase tracking-wide text-muted-foreground">From</dt>
            <dd className="mt-1 text-body text-foreground">{formatTimestamp(result.range.from, mode)}</dd>
          </div>
          <div>
            <dt className="text-caption font-medium uppercase tracking-wide text-muted-foreground">To</dt>
            <dd className="mt-1 text-body text-foreground">{formatTimestamp(result.range.to, mode)}</dd>
          </div>
          <div>
            <dt className="text-caption font-medium uppercase tracking-wide text-muted-foreground">Last record fingerprint</dt>
            <dd className="mt-1 flex items-center gap-2">
              {result.lastHash ? (
                <>
                  <Mono>{result.lastHash.slice(0, 16)}…</Mono>
                  <CopyButton value={result.lastHash} label="fingerprint" />
                </>
              ) : (
                <span className="text-body text-muted-foreground">—</span>
              )}
            </dd>
          </div>
        </dl>

        {result.problems.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[560px] text-left text-body">
              <caption className="sr-only">Records that failed verification</caption>
              <thead className="border-b bg-surface-sunken/60 text-caption uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Problem</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Record</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {result.problems.map((p) => (
                  <tr key={`${p.type}:${p.eventId}`}>
                    <td className="px-4 py-3 align-top font-medium text-foreground">{PROBLEM_LABELS[p.type] ?? p.type.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3 align-top">
                      <a
                        href={routeHref({ section: 'explorer', query: { event: p.eventId, range: '30d' } })}
                        className="rounded-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Mono>{p.eventId}</Mono>
                      </a>
                    </td>
                    <td className="px-4 py-3 align-top text-muted-foreground">{p.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export function IntegrityView() {
  const { api, access } = useApiContext();
  const { mode } = useTimeMode();
  const [preset, setPreset] = useState<Preset>('last24');
  const [custom, setCustom] = useState<{ from?: string; to?: string }>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [state, setState] = useState<{ status: 'idle' | 'running' | 'done' | 'error'; result?: ChainVerification; error?: ApiError }>({ status: 'idle' });
  const { onSessionExpired } = useApiContext();
  const presetId = useId();
  const fromId = useId();
  const toId = useId();
  const errorId = useId();
  const isAdmin = access.role === 'admin';

  const execute = async () => {
    if (state.status === 'running') return;
    const now = Date.now();
    const range = preset === 'custom' ? custom : periodFor(preset, now);
    if (!range.from || !range.to) return setFormError('Choose both a start and an end.');
    const span = Date.parse(range.to) - Date.parse(range.from);
    if (span <= 0) return setFormError('The start must be before the end.');
    if (span > MAX_RANGE_MS) return setFormError('A check can cover at most 24 hours. Choose a shorter range.');
    setFormError(undefined);
    setState({ status: 'running' });
    try {
      const result = await api.verifyChain({ from: range.from, to: range.to });
      setState({ status: 'done', result });
    } catch (error) {
      const apiError = isApiError(error) ? error : new ApiError('unavailable', 'Something went wrong. Please try again.');
      if (apiError.kind === 'unauthenticated') onSessionExpired();
      setState({ status: 'error', error: apiError });
    }
  };

  const run = (e: FormEvent) => {
    e.preventDefault();
    void execute();
  };

  if (!isAdmin || (state.status === 'error' && state.error?.code === 'insufficient_role')) {
    return (
      <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 lg:px-8">
        <PageHeader title="Integrity" />
        <Card>
          <EmptyState
            icon={<ShieldOff className="h-6 w-6" />}
            title="Integrity checks need an administrator"
            description="Only workspace administrators can verify the audit trail. Ask an administrator to run a check, or to change your role."
          />
        </Card>
      </div>
    );
  }

  const effective = preset === 'custom' ? custom : undefined;

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 lg:px-8">
      <PageHeader
        title="Integrity"
        description="Every audit record is chained to the one before it. Verify a period to confirm that nothing was altered, removed or inserted after it was written."
      />

      <Card>
        <CardHeader title="Verify a period" description="Checks the records written during the period you choose, up to 24 hours at a time." />
        <form onSubmit={run} noValidate aria-label="Verify audit integrity">
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor={presetId}>Period</Label>
                <NativeSelect id={presetId} value={preset} onChange={(e) => { setPreset(e.target.value as Preset); setFormError(undefined); }}>
                  <option value="last24">Last 24 hours</option>
                  <option value="previous24">Previous 24 hours</option>
                  <option value="custom">Custom period…</option>
                </NativeSelect>
              </div>
              {preset === 'custom' && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor={fromId}>From ({zoneLabel(mode)})</Label>
                    <Input id={fromId} type="datetime-local" value={toInputValue(effective?.from, mode)} onChange={(e) => setCustom((c) => ({ ...c, from: fromInputValue(e.target.value, mode) }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={toId}>To ({zoneLabel(mode)})</Label>
                    <Input id={toId} type="datetime-local" value={toInputValue(effective?.to, mode)} onChange={(e) => setCustom((c) => ({ ...c, to: fromInputValue(e.target.value, mode) }))} />
                  </div>
                </>
              )}
            </div>
            {formError && <FieldError id={errorId}>{formError}</FieldError>}
            {preset !== 'custom' && <FieldHint id="integrity-hint">Periods are measured from the moment you start the check.</FieldHint>}
            <Button type="submit" loading={state.status === 'running'}>
              {state.status !== 'running' && <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
              {state.status === 'running' ? 'Verifying…' : 'Verify integrity'}
            </Button>
          </CardBody>
        </form>
      </Card>

      {state.status === 'error' && state.error && (
        <Card>
          <ErrorPanel error={state.error} title="We couldn’t complete the check" onRetry={() => void execute()} />
        </Card>
      )}
      {state.status === 'done' && state.result && <Result result={state.result} />}
      {state.status === 'idle' && (
        <Card>
          <EmptyState
            icon={<CircleCheck className="h-6 w-6" />}
            title="No check run yet"
            description="Choose a period and verify it. The result shows how many records were checked and flags any that don’t match."
          />
        </Card>
      )}
      {state.status === 'running' && (
        <p role="status" className="flex items-center gap-2 text-body text-muted-foreground">
          Verifying records. Large periods can take a little while.
        </p>
      )}
    </div>
  );
}
