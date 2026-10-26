import type { Granularity } from './api/schemas';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface AnalyticsPreset {
  value: string;
  label: string;
  granularity: Granularity;
  /** Length of the period. */
  ms: number;
}

/**
 * Periods the analytics API accepts: hourly periods end on the last full hour and are at most
 * 14 days; daily periods end at the most recent UTC midnight and are at most 366 days. The previous
 * period of the same length is compared by default.
 */
export const ANALYTICS_PRESETS: AnalyticsPreset[] = [
  { value: 'h24', label: 'Last 24 hours', granularity: 'hour', ms: DAY },
  { value: 'h72', label: 'Last 3 days', granularity: 'hour', ms: 3 * DAY },
  { value: 'h168', label: 'Last 7 days', granularity: 'hour', ms: 7 * DAY },
  { value: 'd7', label: 'Last 7 days', granularity: 'day', ms: 7 * DAY },
  { value: 'd30', label: 'Last 30 days', granularity: 'day', ms: 30 * DAY },
  { value: 'd90', label: 'Last 90 days', granularity: 'day', ms: 90 * DAY },
];

export function presetsFor(granularity: Granularity): AnalyticsPreset[] {
  return ANALYTICS_PRESETS.filter((p) => p.granularity === granularity);
}

export function defaultPreset(granularity: Granularity): AnalyticsPreset {
  return granularity === 'hour' ? ANALYTICS_PRESETS[0]! : ANALYTICS_PRESETS[4]!;
}

export interface AnalyticsPeriod {
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
}

export function periodFor(preset: AnalyticsPreset, now: number): AnalyticsPeriod {
  const unit = preset.granularity === 'hour' ? HOUR : DAY;
  const end = Math.floor(now / unit) * unit;
  const start = end - preset.ms;
  return {
    from: new Date(start).toISOString(),
    to: new Date(end).toISOString(),
    previousFrom: new Date(start - preset.ms).toISOString(),
    previousTo: new Date(start).toISOString(),
  };
}
