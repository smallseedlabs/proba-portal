import type { JobRun, LinkRelation, MemoryLinkRecord, MemoryRecord, ProfileConfig, ScoringProfile } from '../schemas';

/**
 * Deterministic data for the in-memory memory source, which is used only by the automated checks (unit and browser).
 * It is compiled into the browser-check build alone: production builds exclude it.
 */
export const PROBA_IN_MEMORY_MEMORY_MARKER = 'proba-in-memory-memory-adapter';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const memoryId = (n: number) => `7a1c0000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const DEFAULT_CONFIG: Required<ProfileConfig> = {
  weights: { relevance: 0.5, recency: 0.15, importance: 0.15, confidence: 0.1, usefulness: 0.1 },
  halfLifeDays: { working: 1, episodic: 14, semantic: 180, procedural: 365, super: 730 },
  fusion: { k: 60, vectorWeight: 1, ftsWeight: 1 },
  candidates: { vectorK: 50, ftsK: 50, minVectorSimilarity: 0.05, poolSize: 30 },
  mmr: { enabled: true, lambda: 0.7 },
  rerank: { enabled: false, topN: 20 },
  packing: { tokenBudget: 1500, maxItemTokens: 400 },
  minScore: 0.05,
};

interface SeedMemory {
  n: number;
  category: MemoryRecord['category'];
  status?: MemoryRecord['status'];
  content: string;
  summary?: string;
  ageDays: number;
  reinforcedDaysAgo?: number;
  importance: number;
  confidence: number;
  usefulness?: number;
  supersedes?: number;
  goalId?: string;
  threadId?: string;
  sources: Array<{ kind: string; ref: string }>;
  stance?: string;
  signals?: string[];
  createdBy?: string;
  evidence?: number;
  accessCount?: number;
}

const SEEDS: SeedMemory[] = [
  {
    n: 1, category: 'semantic', status: 'superseded', ageDays: 140,
    content: 'Daily spend above 2,000 USD on a single campaign needs approval from a workspace administrator.',
    importance: 0.7, confidence: 0.8, sources: [{ kind: 'approval', ref: 'approval:apr_0841' }], stance: 'neutral', signals: ['approval.granted'], evidence: 2, accessCount: 14,
  },
  {
    n: 2, category: 'semantic', status: 'superseded', ageDays: 70, supersedes: 1,
    content: 'Daily spend above 3,000 USD on a single campaign needs approval from a workspace administrator.',
    importance: 0.75, confidence: 0.85, sources: [{ kind: 'approval', ref: 'approval:apr_1102' }, { kind: 'audit', ref: 'audit:evt_6f2a' }], stance: 'positive', signals: ['approval.granted', 'approval.rejected'], evidence: 4, accessCount: 31,
  },
  {
    n: 3, category: 'semantic', ageDays: 12, supersedes: 2, reinforcedDaysAgo: 1,
    content: 'Daily spend above 5,000 USD on a single campaign needs approval from a workspace administrator. Smaller changes can go ahead without it.',
    summary: 'Spend above 5,000 USD per day on one campaign needs administrator approval.',
    importance: 0.9, confidence: 0.93, usefulness: 0.74, goalId: 'goal_budget_guardrails',
    sources: [{ kind: 'approval', ref: 'approval:apr_1377' }, { kind: 'goal', ref: 'goal:goal_budget_guardrails' }, { kind: 'audit', ref: 'audit:evt_91c4' }],
    stance: 'positive', signals: ['approval.granted', 'goal.updated'], evidence: 6, accessCount: 58,
  },
  {
    n: 4, category: 'procedural', ageDays: 45, reinforcedDaysAgo: 6,
    content: 'Before resuming a paused campaign, notify the channel lead who owns it and wait for their acknowledgement.',
    importance: 0.8, confidence: 0.88, usefulness: 0.66, threadId: 'thr_paused_campaigns',
    sources: [{ kind: 'thread', ref: 'thread:thr_paused_campaigns' }], stance: 'positive', signals: ['thread.message'], evidence: 3, accessCount: 22,
  },
  {
    n: 5, category: 'episodic', ageDays: 14,
    content: 'On 12 October the retargeting campaign was paused after click-through fell below 0.4 percent for two days.',
    importance: 0.55, confidence: 0.9, usefulness: 0.5, goalId: 'goal_retargeting',
    sources: [{ kind: 'audit', ref: 'audit:evt_2b77' }, { kind: 'analytics', ref: 'analytics:cmp_retargeting_q4' }], stance: 'neutral', signals: ['campaign.paused'], evidence: 2, accessCount: 9,
  },
  {
    n: 6, category: 'semantic', ageDays: 30, reinforcedDaysAgo: 3,
    content: 'The team prefers weekly performance summaries on Monday mornings, in UTC.',
    importance: 0.6, confidence: 0.82, usefulness: 0.58,
    sources: [{ kind: 'thread', ref: 'thread:thr_reporting' }], stance: 'positive', signals: ['thread.message'], evidence: 3, accessCount: 17,
  },
  {
    n: 7, category: 'semantic', status: 'tombstoned', ageDays: 90,
    content: 'Performance summaries should be sent every Friday afternoon.',
    importance: 0.4, confidence: 0.35, usefulness: 0.3,
    sources: [{ kind: 'thread', ref: 'thread:thr_reporting' }], stance: 'negative', signals: ['thread.message'], evidence: 1, accessCount: 4,
  },
  {
    n: 8, category: 'working', ageDays: 0.2,
    content: 'Currently reviewing how the spring launch budget is split between search and social.',
    importance: 0.5, confidence: 0.7, usefulness: 0.5, goalId: 'goal_spring_launch',
    sources: [{ kind: 'goal', ref: 'goal:goal_spring_launch' }], stance: 'neutral', signals: ['goal.updated'], evidence: 1, accessCount: 2,
  },
  {
    n: 9, category: 'super', ageDays: 20, reinforcedDaysAgo: 2,
    content: 'Budget changes are judged on channel-level return first, and anything that moves a large share of spend is approved by an administrator.',
    summary: 'Budget changes are judged on channel return; large moves need administrator approval.',
    importance: 0.88, confidence: 0.91, usefulness: 0.7, createdBy: 'job:promote',
    sources: [{ kind: 'approval', ref: 'approval:apr_1377' }, { kind: 'analytics', ref: 'analytics:cmp_spring_launch' }], stance: 'positive', signals: ['promotion'], evidence: 8, accessCount: 26,
  },
  {
    n: 10, category: 'procedural', ageDays: 60,
    content: 'Creative changes to an approved campaign are submitted as a new revision, never edited in place.',
    importance: 0.65, confidence: 0.84, usefulness: 0.52,
    sources: [{ kind: 'approval', ref: 'approval:apr_0977' }], stance: 'positive', signals: ['approval.granted'], evidence: 2, accessCount: 11,
  },
  {
    n: 11, category: 'semantic', ageDays: 25, reinforcedDaysAgo: 4,
    content: 'Brand voice for customer emails is plain, warm and free of exclamation marks.',
    importance: 0.5, confidence: 0.86, usefulness: 0.55,
    sources: [{ kind: 'other', ref: 'other:brand_guidelines_2026' }], stance: 'positive', signals: ['document.read'], evidence: 2, accessCount: 7,
  },
  {
    n: 12, category: 'episodic', ageDays: 6,
    content: 'The weekend spend alert for the search campaign was raised twice and resolved by lowering the daily cap.',
    importance: 0.45, confidence: 0.8, usefulness: 0.5, goalId: 'goal_budget_guardrails',
    sources: [{ kind: 'audit', ref: 'audit:evt_c013' }], stance: 'neutral', signals: ['alert.resolved'], evidence: 2, accessCount: 5,
  },
];

const LINKS: Array<[number, number, LinkRelation, number]> = [
  [2, 1, 'supersedes', 0.91],
  [3, 2, 'supersedes', 0.94],
  [6, 7, 'contradicts', 0.82],
  [9, 3, 'supports', 0.77],
  [9, 5, 'supports', 0.52],
  [12, 3, 'supports', 0.61],
];

export function seedMemories(now: number): { memories: MemoryRecord[]; links: MemoryLinkRecord[] } {
  const at = (daysAgo: number) => new Date(now - daysAgo * DAY).toISOString();
  const memories = SEEDS.map((s): MemoryRecord => {
    const status = s.status ?? 'active';
    const created = at(s.ageDays);
    const createdBy = s.createdBy ?? 'extractor';
    return {
      id: memoryId(s.n),
      category: s.category,
      content: s.content,
      summary: s.summary ?? null,
      status,
      importance: s.importance,
      confidence: s.confidence,
      usefulness: s.usefulness ?? 0.5,
      supersedesId: s.supersedes ? memoryId(s.supersedes) : null,
      validFrom: created,
      validTo: status === 'active' ? null : at(Math.max(s.ageDays - 20, 0.5)),
      lastReinforcedAt: at(s.reinforcedDaysAgo ?? s.ageDays),
      lastAccessedAt: s.accessCount ? at(Math.min(s.ageDays, 1 + (s.n % 5))) : null,
      accessCount: s.accessCount ?? 0,
      evidenceCount: s.evidence ?? 1,
      goalId: s.goalId ?? null,
      threadId: s.threadId ?? null,
      sourceRefs: s.sources,
      embedding: { model: 'text-embedding-3-small', version: '2026-09' },
      provenance: {
        stance: s.stance ?? 'neutral',
        signals: s.signals ?? [],
        createdBy,
        extractor: createdBy === 'extractor' ? { provider: 'deepseek', model: 'deepseek-chat', promptVersion: 'extract-v3' } : null,
      },
      createdAt: created,
      updatedAt: at(s.reinforcedDaysAgo ?? s.ageDays),
      trust: 'untrusted_data',
    };
  });
  const links = LINKS.map(([from, to, relation, weight]): MemoryLinkRecord => {
    const newer = memories.find((m) => m.id === memoryId(from))!;
    return { fromId: memoryId(from), toId: memoryId(to), relation, weight, createdAt: newer.createdAt };
  });
  return { memories, links };
}

export function seedProfiles(now: number): ScoringProfile[] {
  const at = (daysAgo: number) => new Date(now - daysAgo * DAY).toISOString();
  return [
    { name: 'default', version: 2, status: 'active', scope: 'global', canaryPercent: 0, description: 'Balanced ranking for general retrieval, with a stronger weight on usefulness learned from outcomes.', createdAt: at(21),
      config: { ...DEFAULT_CONFIG, weights: { relevance: 0.45, recency: 0.15, importance: 0.15, confidence: 0.1, usefulness: 0.15 } } },
    { name: 'default', version: 3, status: 'shadow', scope: 'global', canaryPercent: 0, description: 'Candidate that favours recent evidence. Scored beside the active profile and logged, never served.', createdAt: at(4),
      config: { ...DEFAULT_CONFIG, weights: { relevance: 0.4, recency: 0.25, importance: 0.15, confidence: 0.1, usefulness: 0.1 }, halfLifeDays: { working: 1, episodic: 10, semantic: 120, procedural: 300, super: 600 } } },
    { name: 'default', version: 1, status: 'retired', scope: 'global', canaryPercent: 0, description: 'First version of the default ranking.', createdAt: at(120), config: DEFAULT_CONFIG },
    { name: 'approvals', version: 1, status: 'canary', scope: 'workspace', canaryPercent: 10, description: 'Ranks approval rules and past decisions higher for planning requests.', createdAt: at(9),
      config: { ...DEFAULT_CONFIG, weights: { relevance: 0.4, recency: 0.1, importance: 0.25, confidence: 0.15, usefulness: 0.1 }, mmr: { enabled: true, lambda: 0.8 } } },
  ];
}

const JOBS = ['decay', 'consolidate', 'promote', 'collapse', 'contradictions', 'reembed', 'usage-feedback', 'cleanup'] as const;

export function seedJobRuns(now: number): JobRun[] {
  const runs: JobRun[] = [];
  let seq = 1;
  const make = (jobName: string, hoursAgo: number, over: Partial<JobRun> & { processed: number; changed: number }): JobRun => {
    const startedAt = new Date(now - hoursAgo * HOUR).toISOString();
    const id = `9c5d0000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
    const run: JobRun = {
      id,
      jobName,
      traceId: `5e1f0000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
      trigger: 'schedule',
      status: 'succeeded',
      startedAt,
      finishedAt: new Date(now - hoursAgo * HOUR + 4_200 + seq * 311).toISOString(),
      durationMs: 4_200 + seq * 311,
      error: null,
      details: { dryRun: false },
      ...over,
    };
    seq += 1;
    return run;
  };
  JOBS.forEach((job, i) => {
    runs.push(make(job, 1 + i * 0.5, { processed: 40 + i * 13, changed: i * 3 + 1 }));
    runs.push(make(job, 25 + i * 0.5, { processed: 38 + i * 11, changed: i * 2 }));
  });
  runs.push(make('reembed', 3, {
    status: 'failed', processed: 12, changed: 0, error: 'The embedding provider did not answer in time. The run stopped before any vector was replaced.', details: { dryRun: false, stage: 'staging' },
  }));
  runs.push(make('promote', 0.1, { status: 'running', processed: 0, changed: 0, finishedAt: null, durationMs: null, trigger: 'manual', details: { dryRun: false } }));
  runs.push(make('cleanup', 50, { processed: 120, changed: 0, trigger: 'manual', details: { dryRun: true } }));
  return runs.sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));
}
