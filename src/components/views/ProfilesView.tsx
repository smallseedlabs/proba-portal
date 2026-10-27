import { SlidersHorizontal } from 'lucide-react';
import { CATEGORY_LABELS, FEATURE_LABELS, PROFILE_STATUS_HELP, PROFILE_STATUS_LABELS } from '../../lib/memory/labels';
import { MEMORY_CATEGORIES, type ProfileConfig, type ScoringProfile } from '../../lib/memory/schemas';
import { formatTimestamp } from '../../lib/time';
import { useTimeMode } from '../../lib/time-context';
import { useApiContext, useMemoryApi } from '../../state/api';
import { useApiQuery } from '../../state/useApiQuery';
import { ErrorPanel, NoResults, PageHeader } from '../audit/common';
import { AdminOnly, Definition, DefinitionGrid, Meter, ProfileStatusBadge } from '../memory/shared';
import { Card, CardBody, CardHeader } from '../ui/card';
import { Skeleton } from '../ui/feedback';

const STATUS_ORDER = ['active', 'canary', 'shadow', 'draft', 'retired'] as const;

function byRank(a: ScoringProfile, b: ScoringProfile): number {
  return a.name.localeCompare(b.name) || b.version - a.version;
}

function ConfigDetails({ config }: { config: ProfileConfig }) {
  const weights = config.weights ?? {};
  const total = Object.values(weights).reduce((sum, w) => sum + w, 0) || 1;
  return (
    <div className="space-y-4 pt-3">
      {config.weights && (
        <div>
          <h4 className="text-caption font-medium uppercase tracking-wide text-muted-foreground">Share of the score</h4>
          <dl className="mt-2 grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-5">
            {Object.entries(weights).map(([name, weight]) => (
              <div key={name}>
                <dt className="text-caption text-muted-foreground">{(FEATURE_LABELS as Record<string, string>)[name] ?? name}</dt>
                <dd className="text-body"><Meter value={weight / total} /></dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {config.halfLifeDays && (
        <div>
          <h4 className="text-caption font-medium uppercase tracking-wide text-muted-foreground">Days until recency halves</h4>
          <dl className="mt-2 grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-5">
            {MEMORY_CATEGORIES.filter((c) => config.halfLifeDays?.[c] !== undefined).map((c) => (
              <div key={c}>
                <dt className="text-caption text-muted-foreground">{CATEGORY_LABELS[c]}</dt>
                <dd className="text-body tabular-nums">{config.halfLifeDays?.[c]}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <DefinitionGrid>
        {config.candidates && <Definition term="Shortlist">{config.candidates.poolSize} memories from up to {config.candidates.vectorK} by meaning and {config.candidates.ftsK} by keywords</Definition>}
        {config.minScore !== undefined && <Definition term="Minimum score">{config.minScore}</Definition>}
        {config.mmr && <Definition term="Variety">{config.mmr.enabled ? `On (balance ${config.mmr.lambda})` : 'Off'}</Definition>}
        {config.rerank && <Definition term="Re-ranking">{config.rerank.enabled ? `On, top ${config.rerank.topN}` : 'Off'}</Definition>}
        {config.packing && <Definition term="Token budget">{config.packing.tokenBudget.toLocaleString('en-GB')} (up to {config.packing.maxItemTokens.toLocaleString('en-GB')} per memory)</Definition>}
        {config.fusion && <Definition term="Merging">Meaning {config.fusion.vectorWeight} : keywords {config.fusion.ftsWeight}</Definition>}
      </DefinitionGrid>
    </div>
  );
}

export function ProfilesView() {
  const memory = useMemoryApi();
  const { access } = useApiContext();
  const { mode } = useTimeMode();
  const admin = access.role === 'admin';
  const profiles = useApiQuery(admin ? 'profiles' : null, (signal) => memory.listProfiles({ signal }));
  const list = profiles.state.data;

  if (!admin || (profiles.state.status === 'error' && profiles.state.error.code === 'insufficient_role')) {
    return (
      <AdminOnly
        title="Scoring profiles"
        description="Only workspace administrators can see scoring profiles and their configuration. Ask an administrator, or to change your role."
      />
    );
  }

  const names = list ? [...new Set(list.map((p) => p.name))].sort() : [];
  const active = (name: string) => list?.find((p) => p.name === name && p.status === 'active');

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 lg:px-8">
      <PageHeader
        title="Scoring profiles"
        description="A scoring profile decides how memories are ranked for a question. Profiles are versioned: a new version is tried beside the active one before it serves anyone. This page is read-only."
      />

      {profiles.state.status === 'error' ? (
        <Card><ErrorPanel error={profiles.state.error} onRetry={profiles.reload} title="We couldn’t load the scoring profiles" /></Card>
      ) : !list ? (
        <div className="space-y-4" role="status" aria-label="Loading scoring profiles">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : list.length === 0 ? (
        <Card><NoResults title="No scoring profiles" description="Retrieval uses the built-in ranking until a profile is recorded." /></Card>
      ) : (
        <>
          <section aria-labelledby="active-versions" className="space-y-3">
            <h2 id="active-versions" className="text-title text-foreground">Active versions</h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {names.map((name) => {
                const current = active(name);
                return (
                  <li key={name}>
                    <Card className="h-full">
                      <CardBody className="space-y-2">
                        <p className="text-body font-semibold text-foreground">{name}</p>
                        {current ? (
                          <>
                            <p className="text-heading text-foreground" data-testid={`active-${name}`}>Version {current.version}</p>
                            <p className="text-caption text-muted-foreground">Active since <time dateTime={current.createdAt}>{formatTimestamp(current.createdAt, mode, false)}</time></p>
                          </>
                        ) : (
                          <p className="text-body text-muted-foreground">No active version</p>
                        )}
                      </CardBody>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </section>

          <Card aria-labelledby="all-profiles">
            <CardHeader id="all-profiles" titleAs="h2" title="All versions" description={admin ? 'Open a version to see its full configuration.' : undefined} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-body">
                <caption className="sr-only">Scoring profile versions</caption>
                <thead className="border-b bg-surface-sunken/60 text-caption uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-5 py-2.5 font-medium">Profile</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Version</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Applies to</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Created</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {[...list].sort(byRank).map((p) => (
                    <tr key={`${p.name}:${p.version}`} data-status={p.status}>
                      <td className="px-5 py-3 align-top font-medium text-foreground">{p.name}</td>
                      <td className="px-3 py-3 align-top tabular-nums">v{p.version}</td>
                      <td className="px-3 py-3 align-top">
                        <ProfileStatusBadge status={p.status} />
                        {p.status === 'canary' && <p className="mt-1 text-caption text-muted-foreground">{p.canaryPercent}% of requests</p>}
                        <p className="sr-only">{PROFILE_STATUS_HELP[p.status]}</p>
                      </td>
                      <td className="px-3 py-3 align-top text-muted-foreground">{p.scope === 'global' ? 'Every workspace' : 'This workspace'}</td>
                      <td className="whitespace-nowrap px-3 py-3 align-top text-muted-foreground"><time dateTime={p.createdAt}>{formatTimestamp(p.createdAt, mode, false)}</time></td>
                      <td className="max-w-md px-3 py-3 align-top text-muted-foreground">
                        {p.description}
                        {admin && p.config && (
                          <details className="mt-2">
                            <summary className="cursor-pointer rounded-sm text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                              Configuration<span className="sr-only"> of {p.name} version {p.version}</span>
                            </summary>
                            <ConfigDetails config={p.config} />
                          </details>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <p className="flex items-center gap-2 text-caption text-muted-foreground">
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            {STATUS_ORDER.map((s) => `${PROFILE_STATUS_LABELS[s]}: ${PROFILE_STATUS_HELP[s].charAt(0).toLowerCase()}${PROFILE_STATUS_HELP[s].slice(1)}`).join(' · ')}.
          </p>
        </>
      )}
    </div>
  );
}
