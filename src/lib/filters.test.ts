import { describe, it, expect } from 'vitest';
import { DEFAULT_FILTERS, buildEventQuery, countActiveFilters, filtersFromParams, filtersToParams, validateFilters } from './filters';

const UUID = '3f2b8c1e-5a7d-4e90-b1c2-6d8f0a9e4b73';

describe('filters', () => {
  it('round-trips through the address, leaving defaults out', () => {
    expect(filtersToParams(DEFAULT_FILTERS).toString()).toBe('');
    const filters = filtersFromParams(new URLSearchParams(`outcome=failure&service=proba-tools&goalId=${UUID}&range=any&order=asc`));
    expect(filters).toMatchObject({ outcome: 'failure', service: 'proba-tools', goalId: UUID, range: 'any', order: 'asc' });
    expect(filtersFromParams(filtersToParams(filters))).toEqual(filters);
  });

  it('ignores values it does not recognise', () => {
    const filters = filtersFromParams(new URLSearchParams('outcome=exploded&category=nope&range=forever&riskLevel=extreme'));
    expect(filters).toEqual(DEFAULT_FILTERS);
  });

  it('counts only the filters that narrow results', () => {
    expect(countActiveFilters({ ...DEFAULT_FILTERS, outcome: 'denied', q: 'ap', range: '7d' })).toBe(2);
  });

  it('validates identifiers, patterns and ranges', () => {
    expect(validateFilters(DEFAULT_FILTERS)).toEqual({});
    expect(validateFilters({ ...DEFAULT_FILTERS, traceId: 'abc' }).traceId).toBeDefined();
    expect(validateFilters({ ...DEFAULT_FILTERS, action: 'Has Spaces' }).action).toBeDefined();
    expect(validateFilters({ ...DEFAULT_FILTERS, campaignId: 'bad id' }).campaignId).toBeDefined();
    expect(validateFilters({ ...DEFAULT_FILTERS, q: 'a' }).q).toBeDefined();
    expect(validateFilters({ ...DEFAULT_FILTERS, range: 'any' }).range).toBeDefined();
    expect(validateFilters({ ...DEFAULT_FILTERS, range: 'any', traceId: UUID })).toEqual({});
    expect(validateFilters({ ...DEFAULT_FILTERS, range: 'custom' }).range).toBeDefined();
    expect(validateFilters({ ...DEFAULT_FILTERS, range: 'custom', from: '2026-10-02T00:00:00Z', to: '2026-10-01T00:00:00Z' }).range).toBeDefined();
    expect(validateFilters({ ...DEFAULT_FILTERS, range: 'custom', from: '2026-01-01T00:00:00Z', to: '2026-10-01T00:00:00Z' }).range).toMatch(/90 days/);
  });

  it('builds the API query, measuring relative ranges from the search time', () => {
    const now = Date.parse('2026-10-26T12:00:00.000Z');
    expect(buildEventQuery({ ...DEFAULT_FILTERS, outcome: 'failure', q: 'tool' }, now, 50, 'next')).toEqual({
      order: 'desc',
      limit: 50,
      from: '2026-10-25T12:00:00.000Z',
      outcome: 'failure',
      q: 'tool',
      cursor: 'next',
    });
    expect(buildEventQuery({ ...DEFAULT_FILTERS, range: 'any', traceId: UUID }, now, 25)).toEqual({ order: 'desc', limit: 25, traceId: UUID });
    expect(buildEventQuery({ ...DEFAULT_FILTERS, range: 'custom', from: 'a', to: 'b' }, now, 25)).toMatchObject({ from: 'a', to: 'b' });
  });
});
