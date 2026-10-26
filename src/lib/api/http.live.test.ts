// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { HttpAuditApi } from './http';

/**
 * Checks the HTTP adapter against a running audit API (every response is parsed by the same schemas
 * the app uses, so any drift between the API and the portal fails here). Skipped unless
 * PROBA_AUDIT_API_URL and PROBA_AUDIT_API_TOKEN are set (a token the API accepts: with the local
 * stack, the API's static local token). Run it with `npm run test:live`. The raw-text checks need an administrator
 * token and a deployment with AUDIT_CONTENT_ENABLED; with PROBA_AUDIT_API_VIEWER_TOKEN (the local stack's viewer
 * token) they also check that a viewer is refused.
 */
const url = process.env.PROBA_AUDIT_API_URL;
const token = process.env.PROBA_AUDIT_API_TOKEN;
const viewerToken = process.env.PROBA_AUDIT_API_VIEWER_TOKEN;

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

  it('reads raw text as an administrator, through the same schemas, and says so when there is none', async () => {
    const page = await api.searchEvents({ from: week(), limit: 200 });
    const withText = page.events.find((e) => e.hasContent);
    if (!withText) {
      // The deployment does not serve text (AUDIT_CONTENT_ENABLED=false) or nothing has any yet.
      await expect(api.getTraceContent(page.events[0]!.traceId)).rejects.toMatchObject({ kind: 'not_found' });
      return;
    }
    expect(withText.contentDigest).toMatch(/^[0-9a-f]{64}$/);
    const one = await api.getEventContent(withText.eventId);
    expect(one.content.text.length).toBeGreaterThan(0);
    expect(one.verified).toBe(true);
    expect(one.contentDigest).toBe(withText.contentDigest);
    const trace = await api.getTraceContent(withText.traceId);
    expect(trace.items.map((i) => i.eventId)).toContain(withText.eventId);
    // An event without text has none to give.
    const without = page.events.find((e) => !e.hasContent);
    if (without) await expect(api.getEventContent(without.eventId)).rejects.toMatchObject({ kind: 'not_found' });
  });

  it.skipIf(!viewerToken)('refuses a viewer the raw text, and shows a viewer neither the text nor its digest', async () => {
    const viewer = new HttpAuditApi({ baseUrl: url ?? '', getToken: async () => viewerToken ?? '' });
    expect((await viewer.getSession()).role).toBe('viewer');
    const page = await viewer.searchEvents({ from: week(), limit: 200 });
    expect(page.events.every((e) => e.contentDigest === undefined)).toBe(true);
    expect(JSON.stringify(page)).not.toContain('"text"');
    const withText = page.events.find((e) => e.hasContent);
    if (withText) {
      await expect(viewer.getEventContent(withText.eventId)).rejects.toMatchObject({ kind: 'forbidden', status: 403 });
      await expect(viewer.getTraceContent(withText.traceId)).rejects.toMatchObject({ kind: 'forbidden', status: 403 });
    }
  });
});
