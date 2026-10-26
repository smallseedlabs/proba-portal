import type { Page, Route } from '@playwright/test';
import { ApiError } from '../../src/lib/api/errors';
import { InMemoryAuditApi } from '../../src/lib/api/memory/memory-audit-api';

/**
 * A network-level stand-in for the audit API (proba-audit /v1) that answers with the same data as
 * the in-memory source. The browser runs the production HttpAuditApi against it, so everything
 * between the screens and the wire (headers, query strings, status handling, response parsing) is
 * exercised for real.
 */
export interface AuditApiMock {
  requests: { path: string; query: Record<string, string>; authorization: string | null }[];
  /** Answer 401 to any request that carries one of these bearer tokens. */
  rejectTokens: Set<string>;
  /** Answer 401 to every request, whatever the token. */
  rejectAll: boolean;
  /** Answer GET /v1/session with 403. */
  forbidSession: boolean;
  role: 'viewer' | 'admin';
  source: InMemoryAuditApi;
  count(path: string): number;
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-expose-headers': 'x-trace-id, retry-after',
};

export const API_ORIGIN = 'http://127.0.0.1:3998';

const STATUS: Record<string, number> = { forbidden: 403, not_found: 404, invalid_request: 400, unavailable: 503, rate_limited: 429, unauthenticated: 401 };

export async function mockAuditApi(page: Page, options: { role?: 'viewer' | 'admin' } = {}): Promise<AuditApiMock> {
  const mock: AuditApiMock = {
    requests: [],
    rejectTokens: new Set(),
    rejectAll: false,
    forbidSession: false,
    role: options.role ?? 'admin',
    source: new InMemoryAuditApi(),
    count: (path) => mock.requests.filter((r) => r.path === path).length,
  };
  mock.source = new InMemoryAuditApi({ role: mock.role });

  const send = (route: Route, status: number, body: unknown) =>
    route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json', 'x-trace-id': 'e2e-trace-ref' }, body: JSON.stringify(body) });

  await page.route(`${API_ORIGIN}/**`, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(request.url());
    const path = url.pathname;
    const q = Object.fromEntries(url.searchParams) as Record<string, string>;
    const authorization = request.headers()['authorization'] ?? null;
    mock.requests.push({ path, query: q, authorization });

    const token = authorization?.replace(/^Bearer /, '');
    if (!token || mock.rejectAll || mock.rejectTokens.has(token)) {
      return send(route, 401, { error: 'unauthenticated', message: 'Invalid token', traceId: 'e2e-trace-ref' });
    }
    if (path === '/v1/session' && mock.forbidSession) {
      return send(route, 403, { error: 'forbidden', message: 'Not allowed', traceId: 'e2e-trace-ref' });
    }
    const limit = q.limit ? Number(q.limit) : undefined;
    const s = mock.source;
    try {
      if (path === '/v1/session') return send(route, 200, await s.getSession());
      if (path === '/v1/events') return send(route, 200, await s.searchEvents({ ...q, limit } as never));
      if (path === '/v1/facets') return send(route, 200, await s.getFacets(q as never));
      if (path === '/v1/traces') return send(route, 200, await s.listTraces({ ...q, limit }));
      const content = path.match(/^\/v1\/(events|traces)\/([^/]+)\/content$/);
      if (content) {
        const id = decodeURIComponent(content[2]!);
        return send(route, 200, content[1] === 'events' ? await s.getEventContent(id) : await s.getTraceContent(id));
      }
      if (path.startsWith('/v1/traces/')) return send(route, 200, await s.getTrace(decodeURIComponent(path.split('/').pop()!)));
      if (path.startsWith('/v1/events/')) return send(route, 200, await s.getEvent(decodeURIComponent(path.split('/').pop()!)));
      if (path === '/v1/chain/verify') return send(route, 200, await s.verifyChain(q as never));
      if (path === '/v1/analytics/summary') return send(route, 200, await s.getAnalyticsSummary(q as never));
      if (path === '/v1/analytics/compare') return send(route, 200, await s.compareAnalytics(q as never));
      if (path === '/v1/analytics/campaigns') return send(route, 200, await s.getTopCampaigns({ ...q, limit } as never));
      return send(route, 404, { error: 'not_found', message: 'Unknown route', traceId: 'e2e-trace-ref' });
    } catch (error) {
      if (error instanceof ApiError) {
        return send(route, error.status ?? STATUS[error.kind] ?? 500, { error: error.code ?? error.kind, message: error.message, traceId: 'e2e-trace-ref' });
      }
      throw error;
    }
  });
  return mock;
}
