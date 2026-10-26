import { describe, it, expect, vi } from 'vitest';
import { createLogger, setLogger, type LogEntry } from '../log/logger';
import { HttpMemoryApi } from './http';
import { InMemoryMemoryApi } from './in-memory/in-memory-memory-api';
import { memoryId } from './in-memory/memory-seed';

const NOW = Date.parse('2026-10-26T12:30:00.000Z');

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

function make(fetchImpl: typeof fetch, getToken = vi.fn(async (force?: boolean) => (force ? 'fresh-token' : 'token'))) {
  return { api: new HttpMemoryApi({ baseUrl: 'https://memory.acme.io/', getToken, fetchImpl }), getToken };
}

const call = (fetchImpl: ReturnType<typeof vi.fn>, n = 0) => fetchImpl.mock.calls[n] as unknown as [string, RequestInit];

describe('HttpMemoryApi', () => {
  it('calls /v1 with the ID token as a bearer token, never in the address, and no workspace parameter', async () => {
    const fetchImpl = vi.fn(async () => json(200, { memories: [], nextCursor: null }));
    const { api } = make(fetchImpl as unknown as typeof fetch);
    await api.listMemories({ limit: 25 });
    const [url, init] = call(fetchImpl);
    expect(url).toBe('https://memory.acme.io/v1/memories?limit=25');
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token');
    expect(url).not.toMatch(/token|workspace/i);
  });

  it('serialises list filters the way the API documents them, leaving out what is not set', async () => {
    const fetchImpl = vi.fn(async () => json(200, { memories: [], nextCursor: null }));
    const { api } = make(fetchImpl as unknown as typeof fetch);
    await api.listMemories({ categories: ['semantic', 'procedural'], statuses: ['active', 'superseded'], sourceKind: 'approval', limit: 50, cursor: 'abc', goalId: '' });
    const url = new URL(call(fetchImpl)[0]);
    expect(Object.fromEntries(url.searchParams)).toEqual({ category: 'semantic,procedural', status: 'active,superseded', sourceKind: 'approval', limit: '50', cursor: 'abc' });
  });

  it('posts a search with the question and filter in the body, never in the address or the log', async () => {
    const entries: LogEntry[] = [];
    setLogger(createLogger({ level: 'debug', sink: { write: (e) => entries.push(e) }, sessionId: 's' }));
    try {
      const source = new InMemoryMemoryApi({ now: () => NOW });
      const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as { query: string };
        return json(200, await source.searchMemories({ query: body.query, includeCandidates: true }));
      });
      const { api } = make(fetchImpl as unknown as typeof fetch);
      const res = await api.searchMemories({ query: 'confidential question about budget approval', filter: { categories: ['semantic'], sourceKind: undefined }, includeCandidates: true, limit: 5 });
      expect(res.candidates?.length).toBeGreaterThan(0);
      const [url, init] = call(fetchImpl as unknown as ReturnType<typeof vi.fn>);
      expect(url).toBe('https://memory.acme.io/v1/memories/search');
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
      expect(JSON.parse(String(init.body))).toEqual({ query: 'confidential question about budget approval', filter: { categories: ['semantic'] }, limit: 5, includeCandidates: true });
      const log = JSON.stringify(entries);
      expect(log).not.toContain('confidential question');
      expect(log).not.toContain('Bearer');
      expect(entries.find((e) => e.event === 'api.request')).toMatchObject({ method: 'POST', path: '/v1/memories/search', bodyKeys: ['query', 'filter', 'limit', 'includeCandidates'] });
    } finally {
      setLogger(createLogger({ level: 'silent' }));
    }
  });

  it('omits an empty filter from the body', async () => {
    const source = new InMemoryMemoryApi({ now: () => NOW });
    const fetchImpl = vi.fn(async () => json(200, await source.searchMemories({ query: 'budget approval' })));
    await make(fetchImpl as unknown as typeof fetch).api.searchMemories({ query: 'budget approval', filter: {} });
    expect(JSON.parse(String(call(fetchImpl)[1].body))).toEqual({ query: 'budget approval' });
  });

  it('encodes ids in the path and keeps the API error code', async () => {
    const fetchImpl = vi.fn(async () => json(404, { error: 'memory_not_found', message: 'x', traceId: 't-1' }));
    const { api } = make(fetchImpl as unknown as typeof fetch);
    await expect(api.getMemory('a/b')).rejects.toMatchObject({ kind: 'not_found', code: 'memory_not_found', traceId: 't-1' });
    expect(call(fetchImpl)[0]).toBe('https://memory.acme.io/v1/memories/a%2Fb');
  });

  it('refreshes the token once after a 401 and retries, repeating the body', async () => {
    const source = new InMemoryMemoryApi({ now: () => NOW });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(401, { error: 'invalid_token' }))
      .mockResolvedValueOnce(json(200, await source.searchMemories({ query: 'budget approval' })));
    const { api, getToken } = make(fetchImpl as unknown as typeof fetch);
    await api.searchMemories({ query: 'budget approval' });
    expect(getToken).toHaveBeenNthCalledWith(2, true);
    expect(call(fetchImpl, 1)[1].body).toBe(call(fetchImpl, 0)[1].body);
    expect((call(fetchImpl, 1)[1].headers as Record<string, string>).Authorization).toBe('Bearer fresh-token');
  });

  it.each([
    [403, 'forbidden'],
    [404, 'not_found'],
    [429, 'rate_limited'],
    [400, 'invalid_request'],
    [503, 'unavailable'],
  ] as const)('maps HTTP %s to %s', async (status, kind) => {
    const fetchImpl = vi.fn(async () => json(status, { error: 'x', message: 'Detail', traceId: 'tr' }));
    await expect(make(fetchImpl as unknown as typeof fetch).api.listProfiles()).rejects.toMatchObject({ kind, status, traceId: 'tr' });
  });

  it('rejects a response that does not have the documented shape instead of rendering it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchImpl = vi.fn(async () => json(200, { memories: [{ id: 'm', content: 5 }], nextCursor: null }));
    await expect(make(fetchImpl as unknown as typeof fetch).api.listMemories({})).rejects.toMatchObject({ kind: 'bad_response' });
    // Memory text that is not marked as untrusted is not accepted either.
    const source = new InMemoryMemoryApi({ now: () => NOW });
    const detail = await source.getMemory(memoryId(3));
    const unmarked = vi.fn(async () => json(200, { memory: { ...detail.memory, trust: 'trusted' }, links: [] }));
    await expect(make(unmarked as unknown as typeof fetch).api.getMemory(memoryId(3))).rejects.toMatchObject({ kind: 'bad_response' });
  });

  it('reads every response of the service through the same interface as the in-memory source', async () => {
    const source = new InMemoryMemoryApi({ now: () => NOW });
    const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const q = Object.fromEntries(url.searchParams) as Record<string, string>;
      const path = url.pathname;
      if (path === '/v1/session') return json(200, await source.getSession());
      if (path === '/v1/memories/search') return json(200, await source.searchMemories(JSON.parse(String(init?.body))));
      if (path === '/v1/memories') return json(200, await source.listMemories({ limit: Number(q.limit) || undefined, cursor: q.cursor }));
      if (path === '/v1/profiles') return json(200, { profiles: await source.listProfiles() });
      if (path === '/v1/jobs/runs') return json(200, { runs: await source.listJobRuns({ limit: Number(q.limit) || undefined }) });
      const memoryRetrievals = path.match(/^\/v1\/memories\/([^/]+)\/retrievals$/);
      if (memoryRetrievals) return json(200, { retrievals: await source.listMemoryRetrievals(decodeURIComponent(memoryRetrievals[1]!)) });
      const retrieval = path.match(/^\/v1\/retrievals\/([^/]+)$/);
      if (retrieval) return json(200, await source.getRetrieval(decodeURIComponent(retrieval[1]!)));
      const memory = path.match(/^\/v1\/memories\/([^/]+)$/);
      if (memory) return json(200, await source.getMemory(decodeURIComponent(memory[1]!)));
      return json(404, { error: 'not_found' });
    });
    const { api } = make(fetchImpl as unknown as typeof fetch);
    expect((await api.getSession()).role).toBe('admin');
    const page = await api.listMemories({ limit: 3 });
    expect(page.memories).toHaveLength(3);
    expect(page.nextCursor).not.toBeNull();
    await expect(api.getMemory(page.memories[0]!.id)).resolves.toMatchObject({ memory: { id: page.memories[0]!.id } });
    const found = await api.searchMemories({ query: 'budget approval administrator', includeCandidates: true });
    expect(found.candidates?.length).toBeGreaterThan(0);
    await expect(api.getRetrieval(found.retrievalId)).resolves.toMatchObject({ id: found.retrievalId });
    expect((await api.listMemoryRetrievals(found.results[0]!.id)).length).toBeGreaterThan(0);
    expect((await api.listProfiles()).some((p) => p.status === 'active' && p.config?.weights)).toBe(true);
    expect((await api.listJobRuns({ limit: 5 })).length).toBe(5);
  });
});
