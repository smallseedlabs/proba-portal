import type { ApiSession } from '../api/schemas';
import type { CallOptions } from '../api/port';
import type {
  JobRun,
  JobStatus,
  MemoryCategory,
  MemoryDetail,
  MemoryPage,
  MemoryRetrieval,
  MemoryStatus,
  RetrievalRecord,
  ScoringProfile,
  SearchResponse,
  SourceKind,
} from './schemas';

export interface MemoryFilter {
  categories?: MemoryCategory[];
  /** Anything but active needs an administrator. */
  statuses?: MemoryStatus[];
  sourceKind?: SourceKind;
  minConfidence?: number;
  minImportance?: number;
  goalId?: string;
  threadId?: string;
  /** ISO 8601 UTC. */
  createdFrom?: string;
  createdTo?: string;
}

export interface MemoryListQuery extends MemoryFilter {
  limit?: number;
  cursor?: string;
}

export interface MemorySearchRequest {
  query: string;
  filter?: MemoryFilter;
  limit?: number;
  tokenBudget?: number;
  /** Administrators only: returns every candidate with its features. */
  includeCandidates?: boolean;
}

export interface JobRunsQuery {
  job?: string;
  status?: JobStatus;
  limit?: number;
}

/**
 * The portal's only way to read the memory service. Screens depend on this interface; the adapter behind it is
 * chosen by configuration (see factory.ts). All methods reject with ApiError. Nothing here writes, edits or
 * deletes a memory.
 */
export interface MemoryApi {
  getSession(options?: CallOptions): Promise<ApiSession>;
  /** Memories, newest first. */
  listMemories(query: MemoryListQuery, options?: CallOptions): Promise<MemoryPage>;
  /** Ranked retrieval for a query. Every search is itself recorded by the service as a retrieval. */
  searchMemories(request: MemorySearchRequest, options?: CallOptions): Promise<SearchResponse>;
  getMemory(id: string, options?: CallOptions): Promise<MemoryDetail>;
  listProfiles(options?: CallOptions): Promise<ScoringProfile[]>;
  /** A logged retrieval with every candidate and feature score. Administrators only. */
  getRetrieval(id: string, options?: CallOptions): Promise<RetrievalRecord>;
  /** Retrievals that returned a memory, newest first. Administrators only. */
  listMemoryRetrievals(memoryId: string, options?: CallOptions): Promise<MemoryRetrieval[]>;
  /** Recent background job runs, newest first. Administrators only. */
  listJobRuns(query?: JobRunsQuery, options?: CallOptions): Promise<JobRun[]>;
}
