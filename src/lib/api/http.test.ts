import { describe, it, expect, vi } from 'vitest';
import { ApiError } from './errors';
import { HttpAuditApi } from './http';
import { createLogger, setLogger, type LogEntry } from '../log/logger';
import { InMemoryAuditApi } from './memory/memory-audit-api';

const NOW = Date.parse('2026-10-26T12:30:00.000Z');

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

function make(fetchImpl: typeof fetch, getToken = vi.fn(async (force?: boolean) => (force ? 'fresh-token' : 'token'))) {
  return { api: new HttpAuditApi({ baseUrl: 'https://audit.acme.io/', getToken, fetchImpl }), getToken };
}

const SESSION = { subject: 's', email: 'a@b.co', role: 'viewer', workspaceId: 'w' };

describe('HttpAuditApi', () => {
  it('calls /v1 with the ID token as a bearer token, never in the address', async () => {
    const fetchImpl = vi.fn(async () => json(200, SESSION));
    const { api } = make(fetchImpl as unknown as typeof fetch);
    await expect(api.getSession()).resolves.toEqual(SESSION);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://audit.acme.io/v1/session');
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token');
    expect(url).not.toContain('token');
  });

  it('serialises only the filters that are set', async () => {
    const fetchImpl = vi.fn(async () => json(200, { events: [], nextCursor: null, from: null, to: null, order: 'desc', limit: 25 }));
    const { api } = make(fetchImpl as unknown as typeof fetch);
    await api.searchEvents({ outcome: 'failure', q: 'tool', limit: 25, cursor: undefined, actor: '' });
    const url = new URL((fetchImpl.mock.calls[0] as unknown as [string])[0]);
    expect(url.pathname).toBe('/v1/events');
    expect(Object.fromEntries(url.searchParams)).toEqual({ outcome: 'failure', q: 'tool', limit: '25' });
  });

  it('encodes ids in the path', async () => {
    const fetchImpl = vi.fn(async () => json(404, { error: 'not_found', message: 'x', traceId: 't-1' }));
    const { api } = make(fetchImpl as unknown as typeof fetch);
    await expect(api.getTrace('a/b')).rejects.toMatchObject({ kind: 'not_found', traceId: 't-1' });
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe('https://audit.acme.io/v1/traces/a%2Fb');
  });

  it('refreshes the token once after a 401 and retries', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(401, { error: 'invalid_token', message: 'expired', traceId: 't' }))
      .mockResolvedValueOnce(json(200, SESSION));
    const { api, getToken } = make(fetchImpl as unknown as typeof fetch);
    await expect(api.getSession()).resolves.toEqual(SESSION);
    expect(getToken).toHaveBeenNthCalledWith(2, true);
    expect(((fetchImpl.mock.calls[1] as unknown as [string, RequestInit])[1].headers as Record<string, string>).Authorization).toBe('Bearer fresh-token');
  });

  it('reports an unauthenticated error when the retry is refused too, or the token cannot be refreshed', async () => {
    const refused = vi.fn(async () => json(401, { error: 'invalid_token' }));
    await expect(make(refused as unknown as typeof fetch).api.getSession()).rejects.toMatchObject({ kind: 'unauthenticated' });
    expect(refused).toHaveBeenCalledTimes(2);

    const getToken = vi.fn(async (force?: boolean) => {
      if (force) throw new Error('revoked');
      return 'token';
    });
    const once = vi.fn(async () => json(401, { error: 'invalid_token' }));
    await expect(make(once as unknown as typeof fetch, getToken).api.getSession()).rejects.toMatchObject({ kind: 'unauthenticated' });
    expect(once).toHaveBeenCalledTimes(1);
  });

  it.each([
    [403, 'forbidden'],
    [429, 'rate_limited'],
    [400, 'invalid_request'],
    [500, 'unavailable'],
    [503, 'unavailable'],
  ] as const)('maps HTTP %s to %s', async (status, kind) => {
    const fetchImpl = vi.fn(async () => json(status, { error: 'x', message: 'Server detail', traceId: 'tr', issues: [{ path: 'from', message: 'bad' }] }, { 'Retry-After': '7' }));
    const error = (await make(fetchImpl as unknown as typeof fetch).api.getSession().catch((e) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.kind).toBe(kind);
    expect(error.status).toBe(status);
    expect(error.traceId).toBe('tr');
    expect(error.retryAfterSeconds).toBe(7);
    // Server messages are only shown for rejected input; everything else gets a plain explanation.
    expect(error.message === 'Server detail').toBe(kind === 'invalid_request');
  });

  it('copes with error pages that are not JSON', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502, headers: { 'X-Trace-Id': 'proxy-1' } }));
    const error = (await make(fetchImpl as unknown as typeof fetch).api.getSession().catch((e) => e)) as ApiError;
    expect(error).toMatchObject({ kind: 'unavailable', status: 502, traceId: 'proxy-1' });
  });

  it('reports network failures and cancellations distinctly', async () => {
    const down = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(make(down as unknown as typeof fetch).api.getSession()).rejects.toMatchObject({ kind: 'network' });
    const aborted = vi.fn(async () => {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    });
    await expect(make(aborted as unknown as typeof fetch).api.getSession()).rejects.toMatchObject({ kind: 'cancelled' });
  });

  it('rejects responses that do not have the documented shape', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchImpl = vi.fn(async () => json(200, { events: 'nope' }));
    await expect(make(fetchImpl as unknown as typeof fetch).api.searchEvents({})).rejects.toMatchObject({ kind: 'bad_response' });
    const notJson = vi.fn(async () => new Response('plain', { status: 200 }));
    await expect(make(notJson as unknown as typeof fetch).api.getSession()).rejects.toMatchObject({ kind: 'bad_response' });
  });

  it('reads every response of the API through the same adapter interface (contract with the in-memory source)', async () => {
    // The in-memory source is served over a fake fetch, so each HttpAuditApi method parses what the
    // documented shapes look like. Both adapters then agree on the data.
    const source = new InMemoryAuditApi({ now: () => NOW });
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const q = Object.fromEntries(url.searchParams) as Record<string, string>;
      const path = url.pathname;
      if (path === '/v1/session') return json(200, await source.getSession());
      if (path === '/v1/events') return json(200, await source.searchEvents({ ...q, limit: Number(q.limit) || undefined } as never));
      if (path === '/v1/facets') return json(200, await source.getFacets({}));
      if (path === '/v1/traces') return json(200, await source.listTraces({ ...q, limit: Number(q.limit) || undefined }));
      if (path.startsWith('/v1/traces/')) return json(200, await source.getTrace(decodeURIComponent(path.split('/').pop()!)));
      if (path.startsWith('/v1/events/')) return json(200, await source.getEvent(path.split('/').pop()!));
      if (path === '/v1/chain/verify') return json(200, await source.verifyChain(q as never));
      if (path === '/v1/analytics/summary') return json(200, await source.getAnalyticsSummary(q as never));
      if (path === '/v1/analytics/compare') return json(200, await source.compareAnalytics(q as never));
      if (path === '/v1/analytics/campaigns') return json(200, await source.getTopCampaigns({ ...q, limit: Number(q.limit) || undefined } as never));
      return json(404, { error: 'not_found' });
    });
    const { api } = make(fetchImpl as unknown as typeof fetch);
    const from = new Date(NOW - 86_400_000).toISOString();
    const events = await api.searchEvents({ from, limit: 5 });
    expect(events.events).toHaveLength(5);
    await expect(api.getEvent(events.events[0]!.eventId)).resolves.toMatchObject({ eventId: events.events[0]!.eventId });
    const trace = await api.getTrace(events.events[0]!.traceId);
    expect(trace.roots.length).toBeGreaterThan(0);
    expect((await api.listTraces({ from, limit: 3 })).traces).toHaveLength(3);
    expect((await api.getFacets()).facets.outcome.length).toBeGreaterThan(0);
    const dayFrom = '2026-10-19T00:00:00.000Z';
    const dayTo = '2026-10-26T00:00:00.000Z';
    expect((await api.getAnalyticsSummary({ from: dayFrom, to: dayTo, granularity: 'day' })).series.length).toBeGreaterThan(0);
    expect((await api.compareAnalytics({ granularity: 'day', currentFrom: dayFrom, currentTo: dayTo })).comparison.length).toBeGreaterThan(0);
    expect((await api.getTopCampaigns({ from: dayFrom, to: dayTo, granularity: 'day', limit: 3 })).campaigns).toHaveLength(3);
    expect((await api.verifyChain({ from, to: new Date(NOW).toISOString() })).ok).toBe(true);
  });
});

describe('HttpAuditApi token refresh', () => {
  it('shares one refresh between requests rejected at the same time', async () => {
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string>).Authorization;
      seen.push(auth);
      if (auth === 'Bearer token') return json(401, { error: 'unauthenticated', message: 'expired' });
      return json(200, SESSION);
    }) as unknown as typeof fetch;
    const getToken = vi.fn(async (force?: boolean) => {
      if (force) await new Promise((r) => setTimeout(r, 10));
      return force ? 'fresh-token' : 'token';
    });
    const { api } = make(fetchImpl, getToken);
    await Promise.all([api.getSession(), api.getSession(), api.getSession()]);
    expect(getToken.mock.calls.filter(([force]) => force)).toHaveLength(1);
    expect(seen.filter((a) => a === 'Bearer fresh-token')).toHaveLength(3);
  });
});

describe('HttpAuditApi logging', () => {
  it('logs each request with the API trace id, and never the token or the filter values', async () => {
    const entries: LogEntry[] = [];
    setLogger(createLogger({ level: 'debug', sink: { write: (e) => entries.push(e) }, sessionId: 'sess' }));
    try {
      const fetchImpl = vi.fn(async (url: RequestInfo | URL) =>
        String(url).includes('/v1/session')
          ? json(200, SESSION, { 'X-Trace-Id': 'srv-1' })
          : json(503, { error: 'unavailable', traceId: 'srv-2' }, { 'X-Trace-Id': 'srv-2' })
      ) as unknown as typeof fetch;
      const { api } = make(fetchImpl);
      await api.getSession();
      await api.searchEvents({ q: 'confidential text', outcome: 'failure' }).catch(() => undefined);
      const line = JSON.stringify(entries);
      expect(line).not.toContain('confidential text');
      expect(line).not.toContain('Bearer');
      expect(line).not.toContain('"token"');
      expect(entries.find((e) => e.event === 'api.request' && e.path === '/v1/session')).toMatchObject({ status: 200, traceId: 'srv-1', method: 'GET', level: 'info' });
      const failed = entries.filter((e) => e.traceId === 'srv-2');
      expect(failed.map((e) => e.event).sort()).toEqual(['api.error', 'api.request']);
      expect(entries.find((e) => e.event === 'api.error')).toMatchObject({ level: 'error', status: 503, kind: 'unavailable' });
      expect(entries.find((e) => e.event === 'api.request' && e.path === '/v1/events')?.queryKeys).toEqual(['q', 'outcome']);
    } finally {
      setLogger(createLogger({ level: 'silent' }));
    }
  });
});
