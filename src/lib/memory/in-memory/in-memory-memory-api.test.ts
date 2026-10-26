import { describe, it, expect } from 'vitest';
import { InMemoryMemoryApi } from './in-memory-memory-api';
import { memoryId } from './memory-seed';

const NOW = Date.parse('2026-10-26T12:30:00.000Z');
const make = (options = {}) => new InMemoryMemoryApi({ now: () => NOW, ...options });

describe('in-memory memory source', () => {
  it('lists active memories newest first and pages with opaque cursors without repeats', async () => {
    const api = make();
    const all = await api.listMemories({ limit: 200 });
    expect(all.memories.every((m) => m.status === 'active')).toBe(true);
    expect(all.memories.map((m) => m.createdAt)).toEqual([...all.memories.map((m) => m.createdAt)].sort().reverse());
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await api.listMemories({ limit: 3, cursor });
      seen.push(...page.memories.map((m) => m.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toEqual(all.memories.map((m) => m.id));
    await expect(api.listMemories({ cursor: 'garbage' })).rejects.toMatchObject({ kind: 'invalid_request' });
  });

  it('filters by category, status and source together', async () => {
    const api = make();
    const semantic = await api.listMemories({ categories: ['semantic'], limit: 200 });
    expect(semantic.memories.length).toBeGreaterThan(0);
    expect(semantic.memories.every((m) => m.category === 'semantic')).toBe(true);
    const replaced = await api.listMemories({ statuses: ['superseded'], limit: 200 });
    expect(replaced.memories.map((m) => m.status)).toEqual(['superseded', 'superseded']);
    const approvals = await api.listMemories({ sourceKind: 'approval', statuses: ['active', 'superseded', 'tombstoned'], limit: 200 });
    expect(approvals.memories.every((m) => m.sourceRefs.some((s) => s.kind === 'approval'))).toBe(true);
  });

  it('keeps viewers to active memories and refuses what is for administrators', async () => {
    const api = make({ role: 'viewer' });
    await expect(api.listMemories({ statuses: ['superseded'] })).rejects.toMatchObject({ kind: 'forbidden', code: 'insufficient_role' });
    await expect(api.getMemory(memoryId(1))).rejects.toMatchObject({ kind: 'forbidden' });
    await expect(api.searchMemories({ query: 'budget approval', includeCandidates: true })).rejects.toMatchObject({ kind: 'forbidden' });
    await expect(api.getRetrieval('x')).rejects.toMatchObject({ kind: 'forbidden' });
    await expect(api.listMemoryRetrievals(memoryId(3))).rejects.toMatchObject({ kind: 'forbidden' });
    await expect(api.listJobRuns()).rejects.toMatchObject({ kind: 'forbidden' });
    const profiles = await api.listProfiles();
    expect(profiles.length).toBeGreaterThan(0);
    expect(profiles.every((p) => p.config === undefined)).toBe(true);
  });

  it('returns a memory with its links and a 404 for an unknown one', async () => {
    const api = make();
    const detail = await api.getMemory(memoryId(3));
    expect(detail.memory.supersedesId).toBe(memoryId(2));
    expect(detail.links.some((l) => l.relation === 'supersedes' && l.fromId === memoryId(3) && l.toId === memoryId(2))).toBe(true);
    await expect(api.getMemory('00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({ kind: 'not_found' });
  });

  it('searches, ranks, explains every candidate, and logs the retrieval so it can be opened again', async () => {
    const api = make();
    const found = await api.searchMemories({ query: 'when does campaign budget need administrator approval', includeCandidates: true, limit: 3 });
    expect(found.results.length).toBe(3);
    expect(found.results.map((r) => r.score)).toEqual([...found.results.map((r) => r.score)].sort((a, b) => b - a));
    expect(found.results.every((r) => r.trust === 'untrusted_data')).toBe(true);
    expect(found.candidates!.filter((c) => c.selected)).toHaveLength(3);
    expect(found.candidates!.filter((c) => !c.selected).every((c) => c.droppedReason)).toBe(true);
    expect(found.candidates![0]!.features).toEqual(expect.objectContaining({ relevance: expect.any(Number), usefulness: expect.any(Number) }));
    // Without the flag there is no candidate table.
    expect((await api.searchMemories({ query: 'budget approval' })).candidates).toBeUndefined();
    const logged = await api.getRetrieval(found.retrievalId);
    expect(logged.queryText).toContain('administrator approval');
    expect(logged.candidates).toHaveLength(found.candidates!.length);
    const history = await api.listMemoryRetrievals(found.results[0]!.id);
    expect(history.some((h) => h.retrievalId === found.retrievalId)).toBe(true);
  });

  it('applies the filter to a search, and rejects an empty question', async () => {
    const api = make();
    const found = await api.searchMemories({ query: 'budget approval spend', filter: { categories: ['procedural'] } });
    expect(found.results.every((r) => r.category === 'procedural')).toBe(true);
    await expect(api.searchMemories({ query: '   ' })).rejects.toMatchObject({ kind: 'invalid_request' });
  });

  it('lists job runs newest first and filters them', async () => {
    const api = make();
    const runs = await api.listJobRuns({});
    expect(runs.map((r) => r.startedAt)).toEqual([...runs.map((r) => r.startedAt)].sort().reverse());
    expect(runs.some((r) => r.status === 'failed' && r.error)).toBe(true);
    expect(runs.some((r) => r.status === 'running')).toBe(true);
    expect((await api.listJobRuns({ status: 'failed' })).every((r) => r.status === 'failed')).toBe(true);
    expect((await api.listJobRuns({ job: 'decay' })).every((r) => r.jobName === 'decay')).toBe(true);
  });

  it('can behave like a service that does not provide some parts, and can fail on demand', async () => {
    const api = make({ unserved: ['jobs', 'history', 'retrievals'] });
    await expect(api.listJobRuns()).rejects.toMatchObject({ kind: 'not_found' });
    await expect(api.listMemoryRetrievals(memoryId(3))).rejects.toMatchObject({ kind: 'not_found' });
    await expect(api.getRetrieval('x')).rejects.toMatchObject({ kind: 'not_found' });
    const flaky = make();
    flaky.failNext = new (await import('../../api/errors')).ApiError('unavailable', 'down', { status: 503 });
    await expect(flaky.listProfiles()).rejects.toMatchObject({ kind: 'unavailable' });
    await expect(flaky.listProfiles()).resolves.toBeDefined();
  });
});
