import type { Page, Route } from '@playwright/test';
import { ApiError } from '../../src/lib/api/errors';
import { InMemoryMemoryApi } from '../../src/lib/memory/in-memory/in-memory-memory-api';

/**
 * A network-level stand-in for the memory API (proba-memory /v1) that answers with the same data as the in-memory
 * source. The browser runs the production HttpMemoryApi against it, so everything between the screens and the wire
 * (bearer token, request bodies, query strings, status handling, response parsing) is exercised for real.
 */
export interface MemoryApiMock {
  requests: { method: string; path: string; query: Record<string, string>; body: unknown; authorization: string | null }[];
  role: 'viewer' | 'admin';
  source: InMemoryMemoryApi;
  count(method: string, path: string): number;
}

export const MEMORY_ORIGIN = 'http://127.0.0.1:3997';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-expose-headers': 'x-trace-id, retry-after',
};

const STATUS: Record<string, number> = { forbidden: 403, not_found: 404, invalid_request: 400, unavailable: 503, rate_limited: 429, unauthenticated: 401 };

export async function mockMemoryApi(page: Page, options: { role?: 'viewer' | 'admin'; unserved?: ('retrievals' | 'history' | 'jobs')[] } = {}): Promise<MemoryApiMock> {
  const role = options.role ?? 'admin';
  const mock: MemoryApiMock = {
    requests: [],
    role,
    source: new InMemoryMemoryApi({ role, unserved: options.unserved }),
    count: (method, path) => mock.requests.filter((r) => r.method === method && r.path === path).length,
  };

  const send = (route: Route, status: number, body: unknown) =>
    route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json', 'x-trace-id': 'e2e-memory-ref' }, body: JSON.stringify(body) });

  await page.route(`${MEMORY_ORIGIN}/**`, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(request.url());
    const path = url.pathname;
    const q = Object.fromEntries(url.searchParams) as Record<string, string>;
    const authorization = request.headers()['authorization'] ?? null;
    const body = request.postData() ? (JSON.parse(request.postData()!) as Record<string, unknown>) : undefined;
    mock.requests.push({ method: request.method(), path, query: q, body, authorization });
    if (!authorization) return send(route, 401, { error: 'unauthenticated', message: 'Invalid token', traceId: 'e2e-memory-ref' });

    const s = mock.source;
    const limit = q.limit ? Number(q.limit) : undefined;
    try {
      if (path === '/v1/session') return send(route, 200, await s.getSession());
      if (path === '/v1/memories/search') return send(route, 200, await s.searchMemories(body as never));
      if (path === '/v1/memories') {
        const list = (v?: string) => (v ? v.split(',') : undefined);
        return send(route, 200, await s.listMemories({
          categories: list(q.category) as never, statuses: list(q.status) as never, sourceKind: q.sourceKind as never, limit, cursor: q.cursor,
        }));
      }
      if (path === '/v1/profiles') return send(route, 200, { profiles: await s.listProfiles() });
      if (path === '/v1/jobs/runs') return send(route, 200, { runs: await s.listJobRuns({ job: q.job, status: q.status as never, limit }) });
      const history = path.match(/^\/v1\/memories\/([^/]+)\/retrievals$/);
      if (history) return send(route, 200, { retrievals: await s.listMemoryRetrievals(decodeURIComponent(history[1]!)) });
      const retrieval = path.match(/^\/v1\/retrievals\/([^/]+)$/);
      if (retrieval) return send(route, 200, await s.getRetrieval(decodeURIComponent(retrieval[1]!)));
      const memory = path.match(/^\/v1\/memories\/([^/]+)$/);
      if (memory) return send(route, 200, await s.getMemory(decodeURIComponent(memory[1]!)));
      return send(route, 404, { error: 'not_found', message: 'Unknown route', traceId: 'e2e-memory-ref' });
    } catch (error) {
      if (error instanceof ApiError) {
        return send(route, error.status ?? STATUS[error.kind] ?? 500, { error: error.code ?? error.kind, message: error.message, traceId: 'e2e-memory-ref' });
      }
      throw error;
    }
  });
  return mock;
}
