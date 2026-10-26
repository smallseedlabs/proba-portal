import { useId, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Clock, Minus, RefreshCw } from 'lucide-react';
import type { Change, Granularity, MetricsTotals } from '../../lib/api/schemas';
import { ANALYTICS_PRESETS, defaultPreset, periodFor, presetsFor } from '../../lib/analytics-ranges';
import { routeHref, useRoute } from '../../lib/router';
import { METRICS, buildSeries, formatChange, type MetricKey } from '../../lib/series';
import { formatTimestamp } from '../../lib/time';
import { useTimeMode } from '../../lib/time-context';
import { cn } from '../../lib/utils/cn';
import { formatCurrency, formatNumber, formatPercent } from '../../lib/utils/format';
import { useApi } from '../../state/api';
import { useApiQuery } from '../../state/useApiQuery';
import { MetricChart } from '../analytics/MetricChart';
import { ErrorPanel, NoResults, PageHeader } from '../audit/common';
import { Button } from '../ui/button';
import { Card, CardBody, CardHeader } from '../ui/card';
import { Skeleton } from '../ui/feedback';
import { Label, NativeSelect } from '../ui/field';

function money(value: number, currency: string, compact = false) {
  return formatCurrency(value, currency, { compact, decimals: compact ? 0 : 2 });
}

function ChangeIndicator({ change, goodWhen, label }: { change: Change | undefined; goodWhen: 'up' | 'none'; label: string }) {
  if (!change) return null;
  const direction = change.change > 0 ? 'up' : change.change < 0 ? 'down' : 'flat';
  const text = formatChange(change.changePct, change.change);
  const tone =
    direction === 'flat' || goodWhen === 'none'
      ? 'text-muted-foreground'
      : direction === 'up'
        ? 'text-success'
        : 'text-destructive';
  const Icon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus;
  return (
    <p className={cn('mt-1 flex items-center gap-1 text-caption font-medium', tone)}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span>
        {text}
        <span className="sr-only">{direction === 'up' ? ' increase' : direction === 'down' ? ' decrease' : ''} compared with {label}</span>
      </span>
      <span className="font-normal text-muted-foreground" aria-hidden="true">vs {label}</span>
    </p>
  );
}

function SummaryCard({
  label,
  value,
  change,
  goodWhen,
  previousLabel,
}: {
  label: string;
  value: string;
  change: Change | undefined;
  goodWhen: 'up' | 'none';
  previousLabel: string;
}) {
  return (
    <Card>
      <CardBody>
        <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-[1.75rem] font-semibold leading-9 tracking-tight text-foreground tabular-nums">{value}</p>
        <ChangeIndicator change={change} goodWhen={goodWhen} label={previousLabel} />
      </CardBody>
    </Card>
  );
}

function Ratio({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-body font-medium tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function ratios(t: MetricsTotals) {
  return {
    ctr: t.ctr === null ? '—' : formatPercent(t.ctr * 100, 2),
    cpc: t.cpc === null ? '—' : money(t.cpc, t.currency),
    cpa: t.cpa === null ? '—' : money(t.cpa, t.currency),
    roas: t.roas === null ? '—' : `${t.roas.toFixed(2)}×`,
  };
}

export function AnalyticsView() {
  const api = useApi();
  const { mode } = useTimeMode();
  const [route, navigate] = useRoute();
  const granularity: Granularity = route.query.get('granularity') === 'hour' ? 'hour' : 'day';
  const preset = ANALYTICS_PRESETS.find((p) => p.value === route.query.get('period') && p.granularity === granularity) ?? defaultPreset(granularity);
  const campaignId = route.query.get('campaignId') ?? undefined;
  const [metric, setMetric] = useState<MetricKey>('impressions');
  const [chosenCurrency, setChosenCurrency] = useState<string | undefined>();
  const [ranAt, setRanAt] = useState(() => Date.now());
  const ids = { granularity: useId(), period: useId(), campaign: useId() };

  const period = useMemo(() => periodFor(preset, ranAt), [preset, ranAt]);
  const baseKey = `${preset.value}:${ranAt}`;

  const summary = useApiQuery(`summary:${baseKey}:${campaignId ?? ''}`, (signal) =>
    api.getAnalyticsSummary({ from: period.from, to: period.to, granularity, campaignId }, { signal })
  );
  const comparison = useApiQuery(`compare:${baseKey}:${campaignId ?? ''}`, (signal) =>
    api.compareAnalytics(
      { granularity, currentFrom: period.from, currentTo: period.to, previousFrom: period.previousFrom, previousTo: period.previousTo, campaignId },
      { signal }
    )
  );
  const campaigns = useApiQuery(`campaigns:${baseKey}`, (signal) =>
    api.getTopCampaigns({ from: period.from, to: period.to, granularity, limit: 10 }, { signal })
  );

  const update = (next: { granularity?: Granularity; period?: string; campaignId?: string | null }) => {
    const g = next.granularity ?? granularity;
    const p = next.period ?? (next.granularity ? defaultPreset(g).value : preset.value);
    const c = next.campaignId === null ? undefined : (next.campaignId ?? campaignId);
    setRanAt(Date.now());
    navigate(
      {
        section: 'analytics',
        query: { granularity: g === 'day' ? undefined : g, period: p === defaultPreset(g).value ? undefined : p, campaignId: c },
      },
      { replace: true }
    );
  };

  const reloadAll = () => {
    setRanAt(Date.now());
  };

  const totals = summary.state.data?.totals ?? [];
  const currencies = totals.map((t) => t.currency);
  const currency =
    chosenCurrency && currencies.includes(chosenCurrency)
      ? chosenCurrency
      : [...totals].sort((a, b) => b.spend - a.spend)[0]?.currency;
  const current = totals.find((t) => t.currency === currency);
  const compareRow = comparison.state.data?.comparison.find((c) => c.currency === currency);
  const previousLabel = `previous ${preset.label.replace('Last ', '')}`;
  const loading = summary.state.status === 'loading' || comparison.state.status === 'loading';
  const freshness = summary.state.data?.freshness;

  const campaignOptions = useMemo(() => {
    const list = campaigns.state.data?.campaigns.map((c) => c.campaignId) ?? [];
    return campaignId && !list.includes(campaignId) ? [campaignId, ...list] : list;
  }, [campaigns.state.data, campaignId]);

  const points = useMemo(
    () => (summary.state.data && currency ? buildSeries(summary.state.data.series, metric, currency, period, granularity) : []),
    [summary.state.data, currency, metric, period, granularity]
  );
  const isMoney = metric === 'spend';
  const metricLabel = METRICS.find((m) => m.key === metric)!.label;
  const noData = summary.state.status === 'success' && totals.length === 0;

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 lg:px-8">
      <PageHeader
        title="Analytics"
        description="How your campaigns are performing, compared with the period before. Amounts in different currencies are never added together."
        actions={
          <p className="flex items-center gap-1.5 text-caption text-muted-foreground" data-testid="freshness">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {freshness === undefined ? (
              'Checking data freshness…'
            ) : freshness.asOf ? (
              <span title={freshness.rollupsComputedAt ? `Calculated ${formatTimestamp(freshness.rollupsComputedAt, mode)}` : undefined}>
                Data as of <time dateTime={freshness.asOf}>{formatTimestamp(freshness.asOf, mode, false)}</time>
              </span>
            ) : (
              'No data received yet'
            )}
          </p>
        }
      />

      <Card>
        <CardBody>
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-40 space-y-1.5">
              <Label htmlFor={ids.granularity}>Granularity</Label>
              <NativeSelect id={ids.granularity} value={granularity} onChange={(e) => update({ granularity: e.target.value as Granularity })}>
                <option value="day">Daily</option>
                <option value="hour">Hourly</option>
              </NativeSelect>
            </div>
            <div className="w-48 space-y-1.5">
              <Label htmlFor={ids.period}>Period</Label>
              <NativeSelect id={ids.period} value={preset.value} onChange={(e) => update({ period: e.target.value })}>
                {presetsFor(granularity).map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="w-56 space-y-1.5">
              <Label htmlFor={ids.campaign}>Campaign</Label>
              <NativeSelect id={ids.campaign} value={campaignId ?? ''} onChange={(e) => update({ campaignId: e.target.value || null })}>
                <option value="">All campaigns</option>
                {campaignOptions.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </NativeSelect>
            </div>
            {currencies.length > 1 && currency && (
              <div className="space-y-1.5">
                <span className="block text-body font-medium text-foreground" id="currency-label">Currency</span>
                <div role="group" aria-labelledby="currency-label" className="inline-flex rounded-md border bg-surface p-0.5">
                  {currencies.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={c === currency}
                      onClick={() => setChosenCurrency(c)}
                      className={cn(
                        'h-8 rounded px-3 text-body font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        c === currency ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Button variant="outline" onClick={reloadAll} loading={loading} className="ml-auto">
              {!loading && <RefreshCw className="h-4 w-4" aria-hidden="true" />}
              Refresh
            </Button>
          </div>
          <p className="mt-3 text-caption text-muted-foreground">
            {granularity === 'day' ? 'Daily figures cover complete days in UTC.' : 'Hourly figures cover complete hours.'} Compared with the {previousLabel}.
          </p>
        </CardBody>
      </Card>

      {summary.state.status === 'error' ? (
        <Card>
          <ErrorPanel error={summary.state.error} onRetry={reloadAll} title="We couldn’t load performance data" />
        </Card>
      ) : noData ? (
        <Card>
          <NoResults
            title="No performance data for this period"
            description={campaignId ? 'This campaign has no delivery in the period you chose. Try a longer period or all campaigns.' : 'There is no campaign delivery in the period you chose. Try a longer period.'}
            action={
              campaignId ? (
                <Button variant="outline" onClick={() => update({ campaignId: null })}>
                  Show all campaigns
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy={loading}>
            {!current ? (
              Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[108px]" />)
            ) : (
              <>
                <SummaryCard label="Impressions" value={formatNumber(current.impressions)} change={compareRow?.impressions} goodWhen="up" previousLabel={previousLabel} />
                <SummaryCard label="Clicks" value={formatNumber(current.clicks)} change={compareRow?.clicks} goodWhen="up" previousLabel={previousLabel} />
                <SummaryCard label="Spend" value={money(current.spend, current.currency)} change={compareRow?.spend} goodWhen="none" previousLabel={previousLabel} />
                <SummaryCard label="Conversions" value={formatNumber(current.conversions)} change={compareRow?.conversions} goodWhen="up" previousLabel={previousLabel} />
              </>
            )}
          </section>
          {comparison.state.status === 'error' && (
            <p role="alert" className="text-caption text-destructive">
              The comparison with the previous period couldn’t be loaded. <button type="button" className="font-medium underline" onClick={comparison.reload}>Try again</button>
            </p>
          )}

          {current && (
            <dl className="flex flex-wrap gap-x-10 gap-y-3 rounded-lg border bg-surface px-5 py-3" aria-label="Efficiency">
              <Ratio label="Click-through rate" value={ratios(current).ctr} />
              <Ratio label="Cost per click" value={ratios(current).cpc} />
              <Ratio label="Cost per conversion" value={ratios(current).cpa} />
              <Ratio label="Return on ad spend" value={ratios(current).roas} />
            </dl>
          )}

          <Card>
            <CardHeader
              title={`${metricLabel} over time`}
              description={`${granularity === 'hour' ? 'Per hour' : 'Per day'}${currency ? ` · ${currency}` : ''}${campaignId ? ` · ${campaignId}` : ' · all campaigns'}`}
              actions={
                <div role="group" aria-label="Metric" className="inline-flex rounded-md border bg-surface p-0.5">
                  {METRICS.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      aria-pressed={metric === m.key}
                      onClick={() => setMetric(m.key)}
                      className={cn(
                        'h-8 rounded px-3 text-body font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        metric === m.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              }
            />
            <CardBody>
              {summary.state.data && currency ? (
                <MetricChart
                  points={points}
                  granularity={granularity}
                  label={metricLabel}
                  formatValue={(v) => (isMoney ? money(v, currency) : formatNumber(v))}
                  formatAxis={(v) => (isMoney ? money(v, currency, true) : formatNumber(v, { compact: true }))}
                />
              ) : (
                <Skeleton className="h-[280px] w-full" />
              )}
            </CardBody>
          </Card>

          <Card aria-busy={campaigns.state.status === 'loading'}>
            <CardHeader title="Top campaigns" description="Highest spend first, for the same period." />
            {campaigns.state.status === 'error' ? (
              <ErrorPanel error={campaigns.state.error} onRetry={campaigns.reload} title="We couldn’t load campaigns" />
            ) : !campaigns.state.data ? (
              <div className="space-y-3 p-5" role="status" aria-label="Loading campaigns">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </div>
            ) : campaigns.state.data.campaigns.length === 0 ? (
              <NoResults title="No campaign activity" description="No campaign delivered in this period." />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-body">
                    <caption className="sr-only">Top campaigns by spend</caption>
                    <thead className="border-b bg-surface-sunken/60 text-caption uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th scope="col" className="px-5 py-2.5 font-medium">Campaign</th>
                        <th scope="col" className="px-3 py-2.5 font-medium">Platform</th>
                        <th scope="col" className="px-3 py-2.5 text-right font-medium">Spend</th>
                        <th scope="col" className="px-3 py-2.5 text-right font-medium">Impressions</th>
                        <th scope="col" className="px-3 py-2.5 text-right font-medium">Clicks</th>
                        <th scope="col" className="px-3 py-2.5 text-right font-medium">CTR</th>
                        <th scope="col" className="px-3 py-2.5 text-right font-medium">Conversions</th>
                        <th scope="col" className="px-5 py-2.5 text-right font-medium">Cost / conv.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {campaigns.state.data.campaigns.map((c) => (
                        <tr key={`${c.platform}:${c.accountId}:${c.campaignId}`} className={cn('hover:bg-muted/40', campaignId === c.campaignId && 'bg-primary-subtle/50')}>
                          <th scope="row" className="px-5 py-3 text-left font-medium">
                            <button
                              type="button"
                              onClick={() => update({ campaignId: campaignId === c.campaignId ? null : c.campaignId })}
                              aria-pressed={campaignId === c.campaignId}
                              className="rounded-sm text-left text-foreground hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {c.campaignId}
                            </button>
                            <a
                              href={routeHref({ section: 'explorer', query: { campaignId: c.campaignId, range: '7d' } })}
                              className="ml-3 rounded-sm text-caption font-normal text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              Activity<span className="sr-only"> for {c.campaignId}</span>
                            </a>
                          </th>
                          <td className="px-3 py-3 text-muted-foreground">{c.platform.replace(/_/g, ' ')}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{money(c.spend, c.currency)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{formatNumber(c.impressions)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{formatNumber(c.clicks)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{c.ctr === null ? '—' : formatPercent(c.ctr * 100, 2)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{formatNumber(c.conversions)}</td>
                          <td className="px-5 py-3 text-right tabular-nums">{c.cpa === null ? '—' : money(c.cpa, c.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {campaigns.state.data.truncated && (
                  <p className="border-t px-5 py-3 text-caption text-muted-foreground">Showing the top {campaigns.state.data.campaigns.length} campaigns by spend.</p>
                )}
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
