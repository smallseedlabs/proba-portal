import type { FeatureName, JobStatus, LinkRelation, MemoryCategory, MemoryStatus, ProfileStatus, SourceKind } from './schemas';

export const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  working: 'Working',
  episodic: 'Episodic',
  semantic: 'Semantic',
  procedural: 'Procedural',
  super: 'Distilled',
};

export const CATEGORY_HELP: Record<MemoryCategory, string> = {
  working: 'Short-lived context for what is happening now',
  episodic: 'Something that happened, with its circumstances',
  semantic: 'A lasting fact or preference',
  procedural: 'How something is done',
  super: 'Distilled from many related memories',
};

export const STATUS_LABELS: Record<MemoryStatus, string> = { active: 'Active', superseded: 'Replaced', tombstoned: 'Retired' };

export const SOURCE_LABELS: Record<SourceKind, string> = {
  audit: 'Audit trail',
  goal: 'Goal',
  approval: 'Approval',
  thread: 'Conversation',
  analytics: 'Analytics',
  other: 'Other',
};

export const RELATION_LABELS: Record<LinkRelation, string> = {
  supports: 'Supports',
  contradicts: 'Contradicts',
  supersedes: 'Replaces',
};

export const PROFILE_STATUS_LABELS: Record<ProfileStatus, string> = {
  draft: 'Draft',
  shadow: 'Shadow',
  canary: 'Canary',
  active: 'Active',
  retired: 'Retired',
};

export const PROFILE_STATUS_HELP: Record<ProfileStatus, string> = {
  draft: 'Not used for retrieval',
  shadow: 'Scored and logged beside the active profile, never served',
  canary: 'Serves a share of requests',
  active: 'Serves retrieval',
  retired: 'Replaced by a newer version',
};

export const FEATURE_LABELS: Record<FeatureName, string> = {
  relevance: 'Relevance',
  recency: 'Recency',
  importance: 'Importance',
  confidence: 'Confidence',
  usefulness: 'Usefulness',
};

export const JOB_STATUS_LABELS: Record<JobStatus, string> = { running: 'Running', succeeded: 'Succeeded', failed: 'Failed' };

/** Plain names of the background jobs. Unknown jobs are shown as readable words. */
export const JOB_LABELS: Record<string, string> = {
  decay: 'Decay',
  consolidate: 'Consolidation',
  promote: 'Promotion',
  collapse: 'Collapse of duplicates',
  contradictions: 'Contradiction review',
  reembed: 'Re-embedding',
  'usage-feedback': 'Usage feedback',
  cleanup: 'Cleanup',
};

export const JOB_HELP: Record<string, string> = {
  decay: 'Lowers the importance and confidence of memories that are not reinforced.',
  consolidate: 'Merges related memories into one.',
  promote: 'Distils many related memories into a broader one.',
  collapse: 'Folds near-duplicate memories together and adjusts confidence from supporting and conflicting evidence.',
  contradictions: 'Finds memories that disagree and marks which one replaces the other.',
  reembed: 'Moves memories to a new embedding model without interrupting retrieval.',
  'usage-feedback': 'Updates how useful a memory is from what happened after it was retrieved.',
  cleanup: 'Retires memories that are no longer worth keeping.',
};

export function jobLabel(name: string): string {
  const known = JOB_LABELS[name];
  if (known) return known;
  const words = name.replace(/[-_]/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Job';
}

export const DROPPED_REASON_LABELS: Record<string, string> = {
  below_min_score: 'Scored below the minimum',
  outside_pool: 'Outside the shortlist',
  diversity: 'Too similar to a higher-ranked memory',
  over_limit: 'Over the result limit',
  over_budget: 'Did not fit the token budget',
  reranked_out: 'Ranked lower after re-ranking',
};

export function droppedReasonLabel(reason: string | undefined): string {
  if (!reason) return 'Not returned';
  return DROPPED_REASON_LABELS[reason] ?? reason.replace(/_/g, ' ');
}

export const DEGRADED_LABELS: Record<string, string> = {
  rerank: 'Re-ranking was skipped',
  vector: 'Meaning-based search was unavailable',
  text: 'Keyword search was unavailable',
};

export function degradedLabel(step: string): string {
  return DEGRADED_LABELS[step] ?? `${step.replace(/_/g, ' ')} was skipped`;
}

export const OUTCOME_VERDICT_LABELS: Record<string, string> = { approved: 'Approved', rejected: 'Rejected', none: 'No outcome' };

export function sourceKindLabel(kind: string): string {
  return (SOURCE_LABELS as Record<string, string>)[kind] ?? kind;
}

/** The text to show for a memory in a list: the summary when there is one. */
export function memoryHeadline(memory: { summary?: string | null; content: string }): string {
  return memory.summary?.trim() || memory.content;
}

/** A label from a table, or the raw value when the service sends one this version of the portal does not know. */
export function labelOr(labels: Record<string, string>, value: string): string {
  return labels[value] ?? value;
}
