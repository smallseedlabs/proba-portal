// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { HttpAuditApi } from './http';

/**
 * Checks the HTTP adapter against a running audit API (every response is parsed by the same schemas
 * the app uses, so any drift between the API and the portal fails here). Skipped unless
 * PROBA_AUDIT_API_URL and PROBA_AUDIT_API_TOKEN are set (a token the API accepts: with the local
 * stack, the API's static local token). Run it with `npm run test:live`.
 */
const url = process.env.PROBA_AUDIT_API_URL;
const token = process.env.PROBA_AUDIT_API_TOKEN;

describe.skipIf(!url || !token)('audit API (live)', () => {
  const api = new HttpAuditApi({ baseUrl: url ?? '', getToken: async () => token ?? '' });
  const hours = (n: number) => new Date(Date.now() - n * 3_600_000).toISOString();
  // The API limits a trace listing to 7 days.
  const week = () => hours(24 * 6);

  it('reads the session', async () => {
    const session = await api.getSession();
    expect(['viewer', 'admin']).toContain(session.role);
    expect(session.workspaceId).toBeTruthy();
  });

  it('searches events, pages with the cursor, and reads one event and its trace', async () => {
    const first = await api.searchEvents({ from: week(), limit: 5 });
    expect(first.events.length).toBeGreaterThan(0);
    if (first.nextCursor) {
      const second = await api.searchEvents({ from: week(), limit: 5, cursor: first.nextCursor });
      expect(second.events[0]?.eventId).not.toBe(first.events[0]?.eventId);
    }
    const event = await api.getEvent(first.events[0]!.eventId);
    expect(event.eventId).toBe(first.events[0]!.eventId);
    const trace = await api.getTrace(event.traceId);
    expect(trace.traceId).toBe(event.traceId);
    expect(trace.roots.length).toBeGreaterThan(0);
  });

  it('lists traces and facets', async () => {
    const traces = await api.listTraces({ from: week(), limit: 5 });
    expect(traces.traces.length).toBeGreaterThan(0);
    const facets = await api.getFacets({ from: week() });
    expect(Object.keys(facets).length).toBeGreaterThan(0);
  });

  it('reports a missing trace as not found', async () => {
    await expect(api.getTrace('00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({ kind: 'not_found' });
  });

  it('verifies a chain period', async () => {
    const result = await api.verifyChain({ from: hours(6), to: hours(0) });
    expect(typeof result.ok).toBe('boolean');
    expect(result.checked).toBeGreaterThanOrEqual(0);
  });

  it('reads analytics', async () => {
    const hour = new Date();
    hour.setUTCMinutes(0, 0, 0);
    const to = hour.toISOString();
    const from = new Date(hour.getTime() - 24 * 3_600_000).toISOString();
    const summary = await api.getAnalyticsSummary({ from, to, granularity: 'hour' });
    expect(summary).toBeTruthy();
    const prevFrom = new Date(hour.getTime() - 48 * 3_600_000).toISOString();
    const compare = await api.compareAnalytics({ granularity: 'hour', currentFrom: from, currentTo: to, previousFrom: prevFrom, previousTo: from });
    expect(compare).toBeTruthy();
    const campaigns = await api.getTopCampaigns({ from, to, granularity: 'hour', limit: 5 });
    expect(campaigns).toBeTruthy();
  });
});
