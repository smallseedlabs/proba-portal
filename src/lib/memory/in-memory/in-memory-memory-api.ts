import { ApiError } from '../../api/errors';
import type { CallOptions } from '../../api/port';
import type { ApiSession } from '../../api/schemas';
import type { JobRunsQuery, MemoryApi, MemoryFilter, MemoryListQuery, MemorySearchRequest } from '../port';
import {
  FEATURE_NAMES,
  type Candidate,
  type JobRun,
  type MemoryDetail,
  type MemoryLinkRecord,
  type MemoryPage,
  type MemoryRecord,
  type MemoryRetrieval,
  type RetrievalRecord,
  type ScoringProfile,
  type SearchResponse,
} from '../schemas';
import { DEFAULT_CONFIG, PROBA_IN_MEMORY_MEMORY_MARKER, seedJobRuns, seedMemories, seedProfiles } from './memory-seed';

const DAY = 86_400_000;
const WORKSPACE_ID = 'ws_northwind';

/** The parts of the memory service that a deployment may not serve, so screens can show their "not available" state. */
export type UnservedPart = 'retrievals' | 'history' | 'jobs';

export interface InMemoryMemoryApiOptions {
  now?: () => number;
  role?: ApiSession['role'];
  email?: string;
  /** Artificial latency per call, to exercise loading states. */
  latencyMs?: number;
  memories?: MemoryRecord[];
  links?: MemoryLinkRecord[];
  profiles?: ScoringProfile[];
  jobRuns?: JobRun[];
  unserved?: UnservedPart[];
}

const STOP = new Set(['the', 'and', 'for', 'are', 'was', 'that', 'this', 'with', 'from', 'what', 'when', 'how', 'who', 'does', 'did', 'has', 'have', 'its', 'any', 'all']);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOP.has(t))
    .map((t) => t.replace(/(ing|ed|es|s)$/, ''));
}

function forbidden(): ApiError {
  return new ApiError('forbidden', "Your account doesn't have access to this.", { status: 403, code: 'insufficient_role' });
}

function notServed(): ApiError {
  return new ApiError('not_found', 'This memory service does not provide that.', { status: 404, code: 'not_found' });
}

function encodeCursor(offset: number): string {
  return btoa(JSON.stringify({ offset })).replace(/=+$/, '');
}

function decodeCursor(cursor: string): number {
  try {
    const { offset } = JSON.parse(atob(cursor)) as { offset: number };
    if (Number.isInteger(offset) && offset >= 0) return offset;
  } catch {
    /* fall through */
  }
  throw new ApiError('invalid_request', 'The cursor is not valid.', { status: 400, code: 'invalid_query', issues: [{ path: 'cursor', message: 'not a cursor of this list' }] });
}

function matches(memory: MemoryRecord, filter: MemoryFilter): boolean {
  const statuses = filter.statuses?.length ? filter.statuses : ['active'];
  if (!statuses.includes(memory.status)) return false;
  if (filter.categories?.length && !filter.categories.includes(memory.category)) return false;
  if (filter.sourceKind && !memory.sourceRefs.some((s) => s.kind === filter.sourceKind)) return false;
  if (filter.minConfidence !== undefined && memory.confidence < filter.minConfidence) return false;
  if (filter.minImportance !== undefined && memory.importance < filter.minImportance) return false;
  if (filter.goalId && memory.goalId !== filter.goalId) return false;
  if (filter.threadId && memory.threadId !== filter.threadId) return false;
  if (filter.createdFrom && memory.createdAt < filter.createdFrom) return false;
  if (filter.createdTo && memory.createdAt >= filter.createdTo) return false;
  return true;
}

/** An in-process memory service for the automated checks. Behaves like the documented API, roles included. */
export class InMemoryMemoryApi implements MemoryApi {
  readonly marker = PROBA_IN_MEMORY_MEMORY_MARKER;
  private readonly now: () => number;
  private readonly memories: MemoryRecord[];
  private readonly links: MemoryLinkRecord[];
  private readonly profiles: ScoringProfile[];
  private readonly jobRuns: JobRun[];
  private readonly retrievals: RetrievalRecord[] = [];
  /** Total calls per operation, for assertions. */
  readonly calls: Record<string, number> = {};
  failNext: ApiError | null = null;
  private counter = 0;

  constructor(private readonly options: InMemoryMemoryApiOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    const seeded = options.memories ? null : seedMemories(this.now());
    this.memories = options.memories ?? seeded!.memories;
    this.links = options.links ?? seeded?.links ?? [];
    this.profiles = options.profiles ?? seedProfiles(this.now());
    this.jobRuns = options.jobRuns ?? seedJobRuns(this.now());
    if (!options.memories) this.seedRetrievals();
  }

  private get isAdmin(): boolean {
    return (this.options.role ?? 'admin') === 'admin';
  }

  private async enter(name: string, callOptions?: CallOptions): Promise<void> {
    this.calls[name] = (this.calls[name] ?? 0) + 1;
    if (this.options.latencyMs) await new Promise((r) => setTimeout(r, this.options.latencyMs));
    if (callOptions?.signal?.aborted) throw new ApiError('cancelled', 'The request was cancelled.');
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
  }

  private requireAdmin(part?: UnservedPart): void {
    if (!this.isAdmin) throw forbidden();
    if (part && this.options.unserved?.includes(part)) throw notServed();
  }

  private requireStatuses(filter: MemoryFilter | undefined): void {
    if (!this.isAdmin && filter?.statuses?.some((s) => s !== 'active')) throw forbidden();
  }

  async getSession(options?: CallOptions): Promise<ApiSession> {
    await this.enter('getSession', options);
    return { subject: 'memory-subject', email: this.options.email ?? 'amelia.frost@northwind.example', role: this.options.role ?? 'admin', workspaceId: WORKSPACE_ID };
  }

  async listMemories(query: MemoryListQuery, options?: CallOptions): Promise<MemoryPage> {
    await this.enter('listMemories', options);
    this.requireStatuses(query);
    const limit = query.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new ApiError('invalid_request', 'Some of the values you entered were not accepted.', { status: 400, code: 'invalid_query', issues: [{ path: 'limit', message: 'between 1 and 200' }] });
    }
    const offset = query.cursor ? decodeCursor(query.cursor) : 0;
    const all = this.memories
      .filter((m) => matches(m, query))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : -1));
    const memories = all.slice(offset, offset + limit);
    return structuredClone({ memories, nextCursor: offset + limit < all.length ? encodeCursor(offset + limit) : null });
  }

  async getMemory(id: string, options?: CallOptions): Promise<MemoryDetail> {
    await this.enter('getMemory', options);
    const memory = this.memories.find((m) => m.id === id);
    if (!memory) throw new ApiError('not_found', "We couldn't find what you were looking for.", { status: 404, code: 'not_found' });
    // Viewers read active memories only.
    if (!this.isAdmin && memory.status !== 'active') throw forbidden();
    const links = this.links.filter((l) => l.fromId === id || l.toId === id);
    return structuredClone({ memory, links });
  }

  async searchMemories(request: MemorySearchRequest, options?: CallOptions): Promise<SearchResponse> {
    await this.enter('searchMemories', options);
    if (request.includeCandidates && !this.isAdmin) throw forbidden();
    this.requireStatuses(request.filter);
    const query = request.query.trim();
    if (!query) {
      throw new ApiError('invalid_request', 'Some of the values you entered were not accepted.', { status: 400, code: 'invalid_body', issues: [{ path: 'query', message: 'must not be empty' }] });
    }
    const limit = request.limit ?? 10;
    const { response, record } = this.rank(query, request.filter ?? {}, limit, request.tokenBudget);
    this.retrievals.unshift(record);
    return structuredClone({ ...response, ...(request.includeCandidates ? { candidates: record.candidates } : {}) });
  }

  private rank(query: string, filter: MemoryFilter, limit: number, tokenBudget?: number, at?: number) {
    const config = DEFAULT_CONFIG;
    const started = at ?? this.now();
    const q = new Set(tokens(query));
    const pool = this.memories.filter((m) => matches(m, filter));
    const scored = pool
      .map((m) => {
        const words = new Set(tokens(`${m.summary ?? ''} ${m.content}`));
        const hits = [...q].filter((t) => words.has(t)).length;
        const relevance = q.size === 0 ? 0 : hits / q.size;
        const ageDays = Math.max((started - Date.parse(m.lastReinforcedAt)) / DAY, 0);
        const recency = Math.pow(0.5, ageDays / config.halfLifeDays[m.category]!);
        const features = { relevance, recency, importance: m.importance, confidence: m.confidence, usefulness: m.usefulness };
        const sum = Object.values(config.weights).reduce((a, b) => a + b, 0);
        const components = Object.fromEntries(FEATURE_NAMES.map((f) => [f, (features[f] * (config.weights[f] ?? 0)) / sum]));
        const score = Object.values(components).reduce((a, b) => a + b, 0);
        return { memory: m, hits, relevance, features, components, score };
      })
      .filter((s) => s.hits > 0)
      .sort((a, b) => b.score - a.score);

    const byRelevance = [...scored].sort((a, b) => b.relevance - a.relevance);
    const budget = tokenBudget ?? config.packing.tokenBudget;
    let used = 0;
    let position = 0;
    const results: SearchResponse['results'] = [];
    const candidates: Candidate[] = scored.map((s) => {
      const vectorRank = byRelevance.indexOf(s) + 1;
      const ftsRank = vectorRank;
      const fusedScore = (config.fusion.vectorWeight + config.fusion.ftsWeight) / (config.fusion.k + vectorRank);
      const text = s.memory.summary ?? s.memory.content;
      const tokensNeeded = Math.ceil(text.length / 4);
      let droppedReason: string | undefined;
      if (s.score < config.minScore) droppedReason = 'below_min_score';
      else if (results.length >= limit) droppedReason = 'over_limit';
      else if (used + tokensNeeded > budget) droppedReason = 'over_budget';
      const selected = droppedReason === undefined;
      if (selected) {
        position += 1;
        used += tokensNeeded;
        results.push({
          id: s.memory.id, category: s.memory.category, content: s.memory.content, summary: s.memory.summary,
          score: s.score, importance: s.memory.importance, confidence: s.memory.confidence, usefulness: s.memory.usefulness,
          createdAt: s.memory.createdAt, lastReinforcedAt: s.memory.lastReinforcedAt, sourceRefs: s.memory.sourceRefs,
          trust: 'untrusted_data', tokens: tokensNeeded, truncated: false,
        });
      }
      return {
        id: s.memory.id, category: s.memory.category, vectorRank, vectorSimilarity: 0.2 + 0.75 * s.relevance, ftsRank, ftsScore: s.hits,
        fusedScore, score: s.score, features: s.features, components: s.components, selected,
        ...(droppedReason ? { droppedReason } : {}), ...(selected ? { position } : {}),
      };
    });

    this.counter += 1;
    const id = `b3a10000-0000-4000-8000-${String(1000 + this.counter).padStart(12, '0')}`;
    const traceId = `d4e20000-0000-4000-8000-${String(1000 + this.counter).padStart(12, '0')}`;
    const stats = {
      vectorCandidates: scored.length, textCandidates: scored.length, fused: scored.length, scored: scored.length,
      returned: results.length, tokensUsed: used, tokenBudget: budget, degraded: [] as string[], durationMs: 12 + this.counter,
    };
    const profile = this.profiles.find((p) => p.status === 'active')!;
    const response: SearchResponse = {
      retrievalId: id, traceId, query: { length: query.length },
      profile: { name: profile.name, version: profile.version, status: profile.status, served: 'active' },
      results, stats,
    };
    const record: RetrievalRecord = {
      id, traceId, createdAt: new Date(started).toISOString(), queryText: query, filter: { ...filter },
      profile: { name: profile.name, version: profile.version, served: 'active', shadowVersion: null },
      results: results.map((r, i) => ({ id: r.id, score: r.score, position: i + 1 })), candidates, stats, outcome: null,
    };
    return { response, record };
  }

  private seedRetrievals(): void {
    const start = this.now();
    const queries: Array<[string, number, 'approved' | 'rejected' | 'none' | null]> = [
      ['when does a campaign budget need administrator approval', 3, 'approved'],
      ['resume a paused campaign', 26, 'none'],
      ['weekly summary schedule for the team', 52, null],
    ];
    for (const [text, hoursAgo, verdict] of queries.reverse()) {
      const { record } = this.rank(text, {}, 10, undefined, start - hoursAgo * 3_600_000);
      this.retrievals.unshift({ ...record, outcome: verdict ? { verdict, resolvedAt: new Date(start - (hoursAgo - 1) * 3_600_000).toISOString() } : null });
    }
    this.retrievals.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async listProfiles(options?: CallOptions): Promise<ScoringProfile[]> {
    await this.enter('listProfiles', options);
    // Only administrators receive a profile's full configuration.
    return structuredClone(this.profiles.map((p) => (this.isAdmin ? p : { ...p, config: undefined })));
  }

  async getRetrieval(id: string, options?: CallOptions): Promise<RetrievalRecord> {
    await this.enter('getRetrieval', options);
    this.requireAdmin('retrievals');
    const found = this.retrievals.find((r) => r.id === id);
    if (!found) throw new ApiError('not_found', "We couldn't find what you were looking for.", { status: 404, code: 'not_found' });
    return structuredClone(found);
  }

  async listMemoryRetrievals(memoryId: string, options?: CallOptions): Promise<MemoryRetrieval[]> {
    await this.enter('listMemoryRetrievals', options);
    this.requireAdmin('history');
    return this.retrievals
      .filter((r) => r.results.some((x) => x.id === memoryId))
      .map((r): MemoryRetrieval => {
        const hit = r.results.find((x) => x.id === memoryId)!;
        return { retrievalId: r.id, traceId: r.traceId, createdAt: r.createdAt, position: hit.position, score: hit.score, profile: { name: r.profile.name, version: r.profile.version }, outcome: r.outcome?.verdict ?? null };
      });
  }

  async listJobRuns(query: JobRunsQuery = {}, options?: CallOptions): Promise<JobRun[]> {
    await this.enter('listJobRuns', options);
    this.requireAdmin('jobs');
    return structuredClone(
      this.jobRuns.filter((r) => (!query.job || r.jobName === query.job) && (!query.status || r.status === query.status)).slice(0, query.limit ?? 50)
    );
  }
}
