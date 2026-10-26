import { z } from 'zod';

/**
 * Response shapes of the memory API (proba-memory, docs/openapi.yaml). Every response is validated at the edge,
 * like the audit API's: a reply that does not match what the screens rely on is reported as such instead of
 * rendering as broken UI.
 *
 * Text of a memory was written by people and models: it is always rendered as plain text and never followed as
 * an instruction (every record carries `trust: "untrusted_data"`).
 */

export const MEMORY_CATEGORIES = ['working', 'episodic', 'semantic', 'procedural', 'super'] as const;
export const MEMORY_STATUSES = ['active', 'superseded', 'tombstoned'] as const;
export const SOURCE_KINDS = ['audit', 'goal', 'approval', 'thread', 'analytics', 'other'] as const;
export const LINK_RELATIONS = ['supports', 'contradicts', 'supersedes'] as const;
export const PROFILE_STATUSES = ['draft', 'shadow', 'canary', 'active', 'retired'] as const;
export const JOB_STATUSES = ['running', 'succeeded', 'failed'] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];
export type SourceKind = (typeof SOURCE_KINDS)[number];
export type LinkRelation = (typeof LINK_RELATIONS)[number];
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];
export type JobStatus = (typeof JOB_STATUSES)[number];

export const memoryCategorySchema = z.enum(MEMORY_CATEGORIES);
export const memoryStatusSchema = z.enum(MEMORY_STATUSES);

const iso = z.string().min(1);
const sourceRefSchema = z.object({ kind: z.string(), ref: z.string() });

export const memorySchema = z.object({
  id: z.string(),
  category: memoryCategorySchema,
  content: z.string(),
  summary: z.string().nullable(),
  status: memoryStatusSchema,
  importance: z.number(),
  confidence: z.number(),
  usefulness: z.number(),
  supersedesId: z.string().nullable(),
  validFrom: iso,
  validTo: iso.nullable(),
  lastReinforcedAt: iso,
  lastAccessedAt: iso.nullable(),
  accessCount: z.number(),
  evidenceCount: z.number(),
  goalId: z.string().nullable(),
  threadId: z.string().nullable(),
  sourceRefs: z.array(sourceRefSchema),
  embedding: z.object({ model: z.string().nullable(), version: z.string().nullable() }),
  provenance: z.object({
    stance: z.string(),
    signals: z.array(z.string()),
    createdBy: z.string(),
    extractor: z.object({ provider: z.string(), model: z.string(), promptVersion: z.string() }).nullable(),
  }),
  createdAt: iso,
  updatedAt: iso,
  trust: z.literal('untrusted_data'),
});
export type MemoryRecord = z.infer<typeof memorySchema>;

export const linkSchema = z.object({
  fromId: z.string(),
  toId: z.string(),
  relation: z.string(),
  weight: z.number(),
  createdAt: iso,
});
export type MemoryLinkRecord = z.infer<typeof linkSchema>;

export const memoryPageSchema = z.object({ memories: z.array(memorySchema), nextCursor: z.string().nullable() });
export type MemoryPage = z.infer<typeof memoryPageSchema>;

export const memoryDetailSchema = z.object({ memory: memorySchema, links: z.array(linkSchema) });
export type MemoryDetail = z.infer<typeof memoryDetailSchema>;

// -- Retrieval --------------------------------------------------------------------------------------

export const FEATURE_NAMES = ['relevance', 'recency', 'importance', 'confidence', 'usefulness'] as const;
export type FeatureName = (typeof FEATURE_NAMES)[number];

export const retrievedMemorySchema = z.object({
  id: z.string(),
  category: memoryCategorySchema,
  content: z.string(),
  summary: z.string().nullable().optional(),
  score: z.number(),
  importance: z.number(),
  confidence: z.number(),
  usefulness: z.number(),
  createdAt: iso,
  lastReinforcedAt: iso,
  sourceRefs: z.array(sourceRefSchema),
  trust: z.literal('untrusted_data'),
  tokens: z.number(),
  truncated: z.boolean(),
});
export type RetrievedMemory = z.infer<typeof retrievedMemorySchema>;

export const candidateSchema = z.object({
  id: z.string(),
  category: memoryCategorySchema,
  vectorRank: z.number().nullable(),
  vectorSimilarity: z.number().nullable(),
  ftsRank: z.number().nullable(),
  ftsScore: z.number().nullable(),
  fusedScore: z.number(),
  score: z.number(),
  features: z.object({
    relevance: z.number(),
    recency: z.number(),
    importance: z.number(),
    confidence: z.number(),
    usefulness: z.number(),
  }),
  components: z.record(z.number()),
  selected: z.boolean(),
  droppedReason: z.string().optional(),
  mmrScore: z.number().optional(),
  maxSimilarity: z.number().optional(),
  position: z.number().optional(),
});
export type Candidate = z.infer<typeof candidateSchema>;

export const retrievalStatsSchema = z.object({
  vectorCandidates: z.number(),
  textCandidates: z.number(),
  fused: z.number(),
  scored: z.number(),
  returned: z.number(),
  tokensUsed: z.number(),
  tokenBudget: z.number(),
  degraded: z.array(z.string()),
  durationMs: z.number(),
});
export type RetrievalStats = z.infer<typeof retrievalStatsSchema>;

export const searchResponseSchema = z.object({
  retrievalId: z.string(),
  traceId: z.string(),
  query: z.object({ length: z.number() }),
  profile: z.object({
    name: z.string(),
    version: z.number(),
    status: z.string(),
    served: z.enum(['active', 'canary']),
    shadow: z.object({ name: z.string(), version: z.number() }).optional(),
  }),
  results: z.array(retrievedMemorySchema),
  stats: retrievalStatsSchema,
  candidates: z.array(candidateSchema).optional(),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;

/**
 * One retrieval as the memory service logged it (administrators only). The query text in the log is redacted by
 * the service before it is stored.
 */
export const retrievalRecordSchema = z.object({
  id: z.string(),
  traceId: z.string(),
  createdAt: iso,
  queryText: z.string(),
  filter: z.record(z.unknown()),
  profile: z.object({
    name: z.string(),
    version: z.number(),
    served: z.enum(['active', 'canary']),
    shadowVersion: z.number().nullable(),
  }),
  results: z.array(z.object({ id: z.string(), score: z.number(), position: z.number() })),
  candidates: z.array(candidateSchema),
  stats: retrievalStatsSchema,
  outcome: z.object({ verdict: z.enum(['approved', 'rejected', 'none']), resolvedAt: iso }).nullable(),
});
export type RetrievalRecord = z.infer<typeof retrievalRecordSchema>;

/** A retrieval that returned one memory (administrators only). */
export const memoryRetrievalSchema = z.object({
  retrievalId: z.string(),
  traceId: z.string(),
  createdAt: iso,
  position: z.number(),
  score: z.number(),
  profile: z.object({ name: z.string(), version: z.number() }),
  outcome: z.enum(['approved', 'rejected', 'none']).nullable(),
});
export type MemoryRetrieval = z.infer<typeof memoryRetrievalSchema>;
export const memoryRetrievalsSchema = z.object({ retrievals: z.array(memoryRetrievalSchema) });

// -- Scoring profiles -------------------------------------------------------------------------------

const numberRecord = z.record(z.number());

export const profileConfigSchema = z
  .object({
    weights: numberRecord,
    halfLifeDays: numberRecord,
    fusion: z.object({ k: z.number(), vectorWeight: z.number(), ftsWeight: z.number() }),
    candidates: z.object({ vectorK: z.number(), ftsK: z.number(), minVectorSimilarity: z.number(), poolSize: z.number() }),
    mmr: z.object({ enabled: z.boolean(), lambda: z.number() }),
    rerank: z.object({ enabled: z.boolean(), topN: z.number() }),
    packing: z.object({ tokenBudget: z.number(), maxItemTokens: z.number() }),
    minScore: z.number(),
  })
  .partial();
export type ProfileConfig = z.infer<typeof profileConfigSchema>;

export const profileSchema = z.object({
  name: z.string(),
  version: z.number(),
  status: z.enum(PROFILE_STATUSES),
  scope: z.enum(['workspace', 'global']),
  canaryPercent: z.number(),
  description: z.string(),
  createdAt: iso,
  config: profileConfigSchema.optional(),
});
export type ScoringProfile = z.infer<typeof profileSchema>;
export const profilesResponseSchema = z.object({ profiles: z.array(profileSchema) });

// -- Jobs -------------------------------------------------------------------------------------------

export const jobRunSchema = z.object({
  id: z.string(),
  jobName: z.string(),
  traceId: z.string(),
  trigger: z.enum(['schedule', 'manual']),
  status: z.enum(JOB_STATUSES),
  startedAt: iso,
  finishedAt: iso.nullable(),
  durationMs: z.number().nullable(),
  processed: z.number(),
  changed: z.number(),
  error: z.string().nullable(),
  details: z.record(z.unknown()),
});
export type JobRun = z.infer<typeof jobRunSchema>;
export const jobRunsResponseSchema = z.object({ runs: z.array(jobRunSchema) });
