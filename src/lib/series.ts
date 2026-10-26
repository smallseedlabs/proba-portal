import type { Granularity, SeriesPoint } from './api/schemas';

export type MetricKey = 'impressions' | 'clicks' | 'spend' | 'conversions';

export const METRICS: Array<{ key: MetricKey; label: string }> = [
  { key: 'impressions', label: 'Impressions' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'spend', label: 'Spend' },
  { key: 'conversions', label: 'Conversions' },
];

export interface ChartPoint {
  /** Hour: an ISO instant. Day: YYYY-MM-DD. */
  bucket: string;
  value: number;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Every bucket of the period, with 0 where nothing was delivered, so gaps are visible rather than hidden. */
export function buildSeries(
  series: SeriesPoint[],
  metric: MetricKey,
  currency: string,
  period: { from: string; to: string },
  granularity: Granularity
): ChartPoint[] {
  const unit = granularity === 'hour' ? HOUR : DAY;
  const key = (t: number) => (granularity === 'hour' ? new Date(t).toISOString() : new Date(t).toISOString().slice(0, 10));
  const normalise = (bucket: string) => (granularity === 'hour' ? new Date(bucket).toISOString() : bucket.slice(0, 10));
  const values = new Map<string, number>();
  for (const point of series) {
    if (point.currency !== currency) continue;
    values.set(normalise(point.bucket), point[metric]);
  }
  const points: ChartPoint[] = [];
  for (let t = Date.parse(period.from); t < Date.parse(period.to); t += unit) {
    const bucket = key(t);
    points.push({ bucket, value: values.get(bucket) ?? 0 });
  }
  return points;
}

/** Percent change as text: "+12.4%", "−3%", or "New" when there was nothing before. */
export function formatChange(changePct: number | null, change: number): string {
  if (changePct === null) return change === 0 ? '0%' : 'New';
  const rounded = Math.abs(changePct) >= 10 ? Math.round(changePct) : Math.round(changePct * 10) / 10;
  if (rounded === 0) return '0%';
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)}%`;
}
