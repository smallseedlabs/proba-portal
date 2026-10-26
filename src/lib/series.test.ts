import { describe, it, expect } from 'vitest';
import { ANALYTICS_PRESETS, defaultPreset, periodFor, presetsFor } from './analytics-ranges';
import { buildSeries, formatChange } from './series';
import type { SeriesPoint } from './api/schemas';

const point = (bucket: string, impressions: number, currency = 'USD'): SeriesPoint => ({
  bucket,
  currency,
  impressions,
  clicks: 0,
  spend: 0,
  conversions: 0,
  ctr: null,
  cpc: null,
  cpm: null,
  cpa: null,
  roas: null,
  observationCount: 1,
});

describe('buildSeries', () => {
  it('fills missing days with zero and keeps one currency', () => {
    const points = buildSeries(
      [point('2026-10-01', 10), point('2026-10-03', 30), point('2026-10-03', 99, 'EUR')],
      'impressions',
      'USD',
      { from: '2026-10-01T00:00:00.000Z', to: '2026-10-04T00:00:00.000Z' },
      'day'
    );
    expect(points).toEqual([
      { bucket: '2026-10-01', value: 10 },
      { bucket: '2026-10-02', value: 0 },
      { bucket: '2026-10-03', value: 30 },
    ]);
  });

  it('matches hourly buckets however the API writes the instant', () => {
    const points = buildSeries([point('2026-10-01T01:00:00Z', 5)], 'impressions', 'USD', { from: '2026-10-01T00:00:00.000Z', to: '2026-10-01T03:00:00.000Z' }, 'hour');
    expect(points.map((p) => p.value)).toEqual([0, 5, 0]);
  });
});

describe('formatChange', () => {
  it('formats movement for people', () => {
    expect(formatChange(12.44, 5)).toBe('+12%');
    expect(formatChange(4.26, 1)).toBe('+4.3%');
    expect(formatChange(-3, -3)).toBe('−3%');
    expect(formatChange(0, 0)).toBe('0%');
    expect(formatChange(null, 7)).toBe('New');
    expect(formatChange(null, 0)).toBe('0%');
  });
});

describe('analytics periods', () => {
  it('aligns hourly periods to the last full hour and daily periods to UTC midnight', () => {
    const now = Date.parse('2026-10-26T12:34:56.000Z');
    const hourly = periodFor(ANALYTICS_PRESETS.find((p) => p.value === 'h24')!, now);
    expect(hourly).toEqual({
      from: '2026-10-25T12:00:00.000Z',
      to: '2026-10-26T12:00:00.000Z',
      previousFrom: '2026-10-24T12:00:00.000Z',
      previousTo: '2026-10-25T12:00:00.000Z',
    });
    const daily = periodFor(ANALYTICS_PRESETS.find((p) => p.value === 'd7')!, now);
    expect(daily.from).toBe('2026-10-19T00:00:00.000Z');
    expect(daily.to).toBe('2026-10-26T00:00:00.000Z');
  });

  it('keeps every preset within what the API accepts', () => {
    for (const p of ANALYTICS_PRESETS) {
      const days = p.ms / 86_400_000;
      expect(days).toBeLessThanOrEqual(p.granularity === 'hour' ? 14 : 366);
    }
    expect(presetsFor('hour').every((p) => p.granularity === 'hour')).toBe(true);
    expect(defaultPreset('day').granularity).toBe('day');
  });
});
