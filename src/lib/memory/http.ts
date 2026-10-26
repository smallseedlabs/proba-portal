import { sessionSchema } from '../api/schemas';
import type { CallOptions } from '../api/port';
import { HttpTransport, type Query, type TokenSource } from '../api/transport';
import type { ApiError } from '../api/errors';
import type { JobRunsQuery, MemoryApi, MemoryFilter, MemoryListQuery, MemorySearchRequest } from './port';
import {
  jobRunsResponseSchema,
  memoryDetailSchema,
  memoryPageSchema,
  memoryRetrievalsSchema,
  profilesResponseSchema,
  retrievalRecordSchema,
  searchResponseSchema,
} from './schemas';

export interface HttpMemoryApiOptions {
  baseUrl: string;
  getToken: TokenSource;
  fetchImpl?: typeof fetch;
  onError?: (error: ApiError) => void;
}

function filterQuery(filter: MemoryFilter): Query {
  return {
    category: filter.categories?.join(','),
    status: filter.statuses?.join(','),
    sourceKind: filter.sourceKind,
    minConfidence: filter.minConfidence,
    minImportance: filter.minImportance,
    goalId: filter.goalId,
    threadId: filter.threadId,
    createdFrom: filter.createdFrom,
    createdTo: filter.createdTo,
  };
}

/** The filter object of a search body: only what is set (the service rejects unknown and empty fields). */
function filterBody(filter: MemoryFilter): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (filter.categories?.length) body.categories = filter.categories;
  if (filter.statuses?.length) body.statuses = filter.statuses;
  for (const key of ['sourceKind', 'minConfidence', 'minImportance', 'goalId', 'threadId', 'createdFrom', 'createdTo'] as const) {
    if (filter[key] !== undefined && filter[key] !== '') body[key] = filter[key];
  }
  return body;
}

/**
 * Reads the memory API (proba-memory /v1) with the signed-in person's Firebase ID token: the same token the audit
 * API accepts. The workspace is decided by the service from that token; there is no workspace parameter anywhere.
 */
export class HttpMemoryApi implements MemoryApi {
  private readonly transport: HttpTransport;

  constructor(options: HttpMemoryApiOptions) {
    this.transport = new HttpTransport(options);
  }

  getSession(options?: CallOptions) {
    return this.transport.get('/v1/session', sessionSchema, undefined, options?.signal);
  }

  listMemories(query: MemoryListQuery, options?: CallOptions) {
    return this.transport.get('/v1/memories', memoryPageSchema, { ...filterQuery(query), limit: query.limit, cursor: query.cursor }, options?.signal);
  }

  searchMemories(request: MemorySearchRequest, options?: CallOptions) {
    const filter = request.filter ? filterBody(request.filter) : {};
    const body: Record<string, unknown> = { query: request.query };
    if (Object.keys(filter).length > 0) body.filter = filter;
    if (request.limit !== undefined) body.limit = request.limit;
    if (request.tokenBudget !== undefined) body.tokenBudget = request.tokenBudget;
    if (request.includeCandidates) body.includeCandidates = true;
    return this.transport.post('/v1/memories/search', searchResponseSchema, body, options?.signal);
  }

  getMemory(id: string, options?: CallOptions) {
    return this.transport.get(`/v1/memories/${encodeURIComponent(id)}`, memoryDetailSchema, undefined, options?.signal);
  }

  async listProfiles(options?: CallOptions) {
    return (await this.transport.get('/v1/profiles', profilesResponseSchema, undefined, options?.signal)).profiles;
  }

  getRetrieval(id: string, options?: CallOptions) {
    return this.transport.get(`/v1/retrievals/${encodeURIComponent(id)}`, retrievalRecordSchema, undefined, options?.signal);
  }

  async listMemoryRetrievals(memoryId: string, options?: CallOptions) {
    const page = await this.transport.get(`/v1/memories/${encodeURIComponent(memoryId)}/retrievals`, memoryRetrievalsSchema, undefined, options?.signal);
    return page.retrievals;
  }

  async listJobRuns(query: JobRunsQuery = {}, options?: CallOptions) {
    const page = await this.transport.get('/v1/jobs/runs', jobRunsResponseSchema, { job: query.job, status: query.status, limit: query.limit }, options?.signal);
    return page.runs;
  }
}
