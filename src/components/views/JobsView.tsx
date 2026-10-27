import { useId, useState } from 'react';
import { Briefcase, RefreshCw } from 'lucide-react';
import { JOB_HELP, JOB_LABELS, JOB_STATUS_LABELS, jobLabel } from '../../lib/memory/labels';
import { JOB_STATUSES, type JobRun, type JobStatus } from '../../lib/memory/schemas';
import { formatDuration, formatTimestamp } from '../../lib/time';
import { useTimeMode } from '../../lib/time-context';
import { useApiContext, useMemoryApi } from '../../state/api';
import { useApiQuery } from '../../state/useApiQuery';
import { ErrorPanel, Mono, NoResults, PageHeader } from '../audit/common';
import { routeHref } from '../../lib/router';
import { AdminOnly, JobStatusBadge } from '../memory/shared';
import { isNotProvided, linkClass } from '../memory/helpers';
import { Button } from '../ui/button';
import { Card, CardBody } from '../ui/card';
import { EmptyState, Skeleton } from '../ui/feedback';
import { Label, NativeSelect } from '../ui/field';

const LIMIT = 100;

function detailFor(run: JobRun): string {
  if (run.error) return run.error;
  if (run.status === 'running') return 'In progress';
  if (run.details.dryRun === true) return 'Checked what would change. Nothing was written.';
  return run.changed === 0 ? 'Nothing needed to change.' : `${run.changed.toLocaleString('en-GB')} changed.`;
}

export function JobsView() {
  const memory = useMemoryApi();
  const { access } = useApiContext();
  const { mode } = useTimeMode();
  const admin = access.role === 'admin';
  const [job, setJob] = useState('');
  const [status, setStatus] = useState<JobStatus | ''>('');
  const [ranAt, setRanAt] = useState(() => Date.now());
  const jobId = useId();
  const statusId = useId();

  const runs = useApiQuery(admin ? `jobs:${job}:${status}:${ranAt}` : null, (signal) =>
    memory.listJobRuns({ job: job || undefined, status: status || undefined, limit: LIMIT }, { signal })
  );

  if (!admin || (runs.state.status === 'error' && runs.state.error.code === 'insufficient_role')) {
    return (
      <AdminOnly
        title="Jobs"
        description="Only workspace administrators can see the background jobs that keep memory tidy. Ask an administrator, or to change your role."
      />
    );
  }

  const data = runs.state.data;
  const loading = runs.state.status === 'loading';

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 lg:px-8">
      <PageHeader
        title="Jobs"
        description="Background jobs keep memory accurate: they fade what is no longer reinforced, merge duplicates, settle contradictions and learn from outcomes. This page shows their most recent runs."
      />

      <Card>
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor={jobId}>Job</Label>
              <NativeSelect id={jobId} value={job} onChange={(e) => setJob(e.target.value)}>
                <option value="">All jobs</option>
                {Object.entries(JOB_LABELS).map(([name, label]) => (
                  <option key={name} value={name}>{label}</option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={statusId}>Result</Label>
              <NativeSelect id={statusId} value={status} onChange={(e) => setStatus(e.target.value as JobStatus | '')}>
                <option value="">Any result</option>
                {JOB_STATUSES.map((s) => (
                  <option key={s} value={s}>{JOB_STATUS_LABELS[s]}</option>
                ))}
              </NativeSelect>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card aria-busy={loading}>
        <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
          <h2 className="text-title text-foreground">Recent runs</h2>
          <Button variant="outline" size="sm" onClick={() => setRanAt(Date.now())} loading={loading}>
            {!loading && <RefreshCw className="h-4 w-4" aria-hidden="true" />}
            Refresh
          </Button>
        </div>
        {runs.state.status === 'error' ? (
          isNotProvided(runs.state.error) ? (
            <EmptyState icon={<Briefcase className="h-6 w-6" />} title="This memory service does not report job runs" description="Job runs appear here once the service provides them." />
          ) : (
            <ErrorPanel error={runs.state.error} onRetry={runs.reload} title="We couldn’t load job runs" />
          )
        ) : !data ? (
          <div className="divide-y" role="status" aria-label="Loading job runs">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="ml-auto h-4 w-32" />
              </div>
            ))}
          </div>
        ) : data.length === 0 ? (
          <NoResults title="No job runs match" description="Try another job or result, or check back after the next scheduled run." />
        ) : (
          <div className={loading ? 'overflow-x-auto opacity-60 transition-opacity' : 'overflow-x-auto'}>
            <table className="w-full min-w-[920px] text-left text-body">
              <caption className="sr-only">Recent background job runs, newest first</caption>
              <thead className="border-b bg-surface-sunken/60 text-caption uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-5 py-2.5 font-medium">Job</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Result</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Started</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Triggered</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Duration</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Looked at</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Changed</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.map((run) => (
                  <tr key={run.id} className="hover:bg-muted/40" data-status={run.status}>
                    <td className="px-5 py-3 align-top">
                      <p className="font-medium text-foreground">{jobLabel(run.jobName)}</p>
                      {JOB_HELP[run.jobName] && <p className="mt-0.5 max-w-xs text-caption text-muted-foreground">{JOB_HELP[run.jobName]}</p>}
                    </td>
                    <td className="px-3 py-3 align-top"><JobStatusBadge status={run.status} /></td>
                    <td className="whitespace-nowrap px-3 py-3 align-top text-muted-foreground">
                      <time dateTime={run.startedAt}>{formatTimestamp(run.startedAt, mode)}</time>
                    </td>
                    <td className="px-3 py-3 align-top text-muted-foreground">{run.trigger === 'manual' ? 'Started by a person' : 'Scheduled'}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right align-top tabular-nums text-muted-foreground">{formatDuration(run.durationMs)}</td>
                    <td className="px-3 py-3 text-right align-top tabular-nums">{run.processed.toLocaleString('en-GB')}</td>
                    <td className="px-3 py-3 text-right align-top tabular-nums">{run.changed.toLocaleString('en-GB')}</td>
                    <td className="max-w-sm px-3 py-3 align-top">
                      <p className={run.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>{detailFor(run)}</p>
                      <a href={routeHref({ section: 'traces', id: run.traceId })} className={`${linkClass} mt-1 inline-block text-caption`}>
                        Trace <Mono>{run.traceId.slice(0, 8)}…</Mono>
                        <span className="sr-only"> for this run</span>
                      </a>
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
