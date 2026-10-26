import { describe, it, expect } from 'vitest';
import { InMemoryAuditApi } from './memory-audit-api';

const NOW = Date.parse('2026-10-26T12:30:00.000Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const make = (options = {}) => new InMemoryAuditApi({ now: () => NOW, ...options });

describe('in-memory audit source', () => {
  it('searches the last 24 hours by default, newest first, with filters combined', async () => {
    const api = make();
    const page = await api.searchEvents({ limit: 200 });
    expect(page.events.length).toBeGreaterThan(20);
    const times = page.events.map((e) => e.occurredAt);
    expect([...times].sort().reverse()).toEqual(times);
    expect(page.events.every((e) => Date.parse(e.occurredAt) >= NOW - DAY)).toBe(true);

    const failures = await api.searchEvents({ outcome: 'failure', category: 'tool', limit: 200 });
    expect(failures.events.length).toBeGreaterThan(0);
    expect(failures.events.every((e) => e.outcome === 'failure' && e.category === 'tool')).toBe(true);
  });

  it('pages with opaque cursors without repeating or skipping events', async () => {
    const api = make();
    const all = await api.searchEvents({ limit: 200 });
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await api.searchEvents({ limit: 10, cursor });
      seen.push(...page.events.map((e) => e.eventId));
      cursor = page.nextCursor ?? undefined;
      pages += 1;
    } while (cursor);
    expect(seen.slice(0, all.events.length)).toEqual(all.events.map((e) => e.eventId));
    expect(new Set(seen).size).toBe(seen.length);
    expect(pages).toBeGreaterThan(2);
  });

  it('rejects a cursor from another sort order and bad parameters', async () => {
    const api = make();
    const page = await api.searchEvents({ limit: 5 });
    await expect(api.searchEvents({ limit: 5, order: 'asc', cursor: page.nextCursor! })).rejects.toMatchObject({ kind: 'invalid_request', code: 'invalid_cursor' });
    await expect(api.searchEvents({ cursor: '%%%' })).rejects.toMatchObject({ code: 'invalid_cursor' });
    await expect(api.searchEvents({ limit: 500 })).rejects.toMatchObject({ kind: 'invalid_request' });
    await expect(api.searchEvents({ q: 'a' })).rejects.toMatchObject({ kind: 'invalid_request' });
    await expect(api.searchEvents({ from: new Date(NOW - 100 * DAY).toISOString() })).rejects.toMatchObject({ kind: 'invalid_request' });
  });

  it('finds an anchored trace beyond the default range', async () => {
    const api = make();
    const old = (await api.searchEvents({ from: new Date(NOW - 6 * DAY).toISOString(), to: new Date(NOW - 3 * DAY).toISOString(), limit: 1 })).events[0]!;
    expect((await api.searchEvents({ traceId: old.traceId })).events.length).toBeGreaterThan(0);
  });

  it('builds a span tree with offsets, durations and the worst outcome rolled up', async () => {
    const api = make();
    const failed = (await api.searchEvents({ action: 'tool.failed', limit: 1, from: new Date(NOW - 7 * DAY).toISOString() })).events[0]!;
    const trace = await api.getTrace(failed.traceId);
    expect(trace.outcome).toBe('failure');
    expect(trace.truncated).toBe(false);
    expect(trace.roots[0]!.action).toBe('command.received');
    expect(trace.roots[0]!.offsetMs).toBe(0);
    expect(trace.roots[0]!.subtreeOutcome).toBe('failure');
    const count = (nodes: typeof trace.roots): number => nodes.reduce((n, node) => n + 1 + count(node.children), 0);
    expect(count(trace.roots)).toBe(trace.eventCount);
    expect(trace.related.campaignIds.length).toBeGreaterThan(0);
  });

  it('answers not found for unknown ids', async () => {
    const api = make();
    await expect(api.getTrace('00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({ kind: 'not_found' });
    await expect(api.getEvent('00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({ kind: 'not_found' });
  });

  it('lists facets with counts', async () => {
    const facets = await make().getFacets();
    expect(facets.facets.outcome.map((f) => f.value)).toContain('success');
    expect(facets.facets.service.every((f) => f.count > 0)).toBe(true);
  });

  it('verifies the chain, reports the altered record, and is for administrators only', async () => {
    const api = make();
    const clean = await api.verifyChain({ from: new Date(NOW - DAY).toISOString(), to: new Date(NOW).toISOString() });
    expect(clean).toMatchObject({ ok: true, problems: [], complete: true });
    expect(clean.checked).toBeGreaterThan(0);
    const broken = await api.verifyChain({ from: new Date(NOW - 2 * DAY).toISOString(), to: new Date(NOW - DAY).toISOString() });
    expect(broken.ok).toBe(false);
    expect(broken.problems[0]).toMatchObject({ type: 'hash_mismatch', eventId: api.tamperedEventId });
    await expect(api.verifyChain({ from: new Date(NOW - 3 * DAY).toISOString(), to: new Date(NOW).toISOString() })).rejects.toMatchObject({ kind: 'invalid_request' });
    await expect(make({ role: 'viewer' }).verifyChain({ from: new Date(NOW - DAY).toISOString(), to: new Date(NOW).toISOString() })).rejects.toMatchObject({ kind: 'forbidden', code: 'insufficient_role' });
  });

  it('enforces the analytics alignment rules', async () => {
    const api = make();
    const hour = Math.floor(NOW / HOUR) * HOUR;
    await expect(api.getAnalyticsSummary({ from: new Date(hour - DAY + 1000).toISOString(), to: new Date(hour).toISOString(), granularity: 'hour' })).rejects.toMatchObject({ kind: 'invalid_request' });
    await expect(api.getAnalyticsSummary({ from: new Date(hour - 20 * DAY).toISOString(), to: new Date(hour).toISOString(), granularity: 'hour' })).rejects.toMatchObject({ kind: 'invalid_request' });
    await expect(api.getAnalyticsSummary({ from: new Date(hour - DAY).toISOString(), to: new Date(hour).toISOString(), granularity: 'day' })).rejects.toMatchObject({ kind: 'invalid_request' });
  });

  it('summarises per currency without mixing them, and compares with the previous period', async () => {
    const api = make();
    const to = Math.floor(NOW / DAY) * DAY;
    const from = to - 7 * DAY;
    const summary = await api.getAnalyticsSummary({ from: new Date(from).toISOString(), to: new Date(to).toISOString(), granularity: 'day' });
    expect(summary.totals.map((t) => t.currency)).toEqual(['EUR', 'USD']);
    expect(summary.series.filter((s) => s.currency === 'USD')).toHaveLength(7);
    const usd = summary.totals.find((t) => t.currency === 'USD')!;
    expect(summary.series.filter((s) => s.currency === 'USD').reduce((n, s) => n + s.impressions, 0)).toBe(usd.impressions);
    expect(usd.ctr).toBeCloseTo(usd.clicks / usd.impressions, 10);
    expect(summary.freshness.asOf).not.toBeNull();

    const comparison = await api.compareAnalytics({ granularity: 'day', currentFrom: new Date(from).toISOString(), currentTo: new Date(to).toISOString() });
    const row = comparison.comparison.find((c) => c.currency === 'USD')!;
    expect(row.impressions.current).toBe(usd.impressions);
    expect(row.impressions.previous).toBeGreaterThan(0);
    expect(comparison.previous.to).toBe(new Date(from).toISOString());

    const filtered = await api.getAnalyticsSummary({ from: new Date(from).toISOString(), to: new Date(to).toISOString(), granularity: 'day', campaignId: 'cmp_emea_awareness' });
    expect(filtered.totals.map((t) => t.currency)).toEqual(['EUR']);
  });

  it('ranks campaigns by spend and says when the list was cut', async () => {
    const api = make();
    const to = Math.floor(NOW / DAY) * DAY;
    const result = await api.getTopCampaigns({ from: new Date(to - 7 * DAY).toISOString(), to: new Date(to).toISOString(), granularity: 'day', limit: 2 });
    expect(result.campaigns).toHaveLength(2);
    expect(result.truncated).toBe(true);
    expect(result.campaigns[0]!.spend).toBeGreaterThanOrEqual(result.campaigns[1]!.spend);
  });

  it('can be told to fail once', async () => {
    const api = make();
    const { ApiError } = await import('../errors');
    api.failNext = new ApiError('unavailable', 'down', { status: 503 });
    await expect(api.getSession()).rejects.toMatchObject({ kind: 'unavailable' });
    await expect(api.getSession()).resolves.toMatchObject({ role: 'admin' });
  });
});
