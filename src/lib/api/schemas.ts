import { z } from 'zod';
import type {
  AuditActorType,
  AuditContent,
  AuditCategory,
  AuditOutcome,
  AuditRiskLevel,
  StoredAuditEvent,
} from '@smallseedlabs/proba-protocol/audit';

/**
 * Response shapes of the audit API (proba-audit, docs/openapi.yaml). Event types come from the
 * pinned protocol package (types only: no protocol runtime code is bundled). Every response is
 * validated at the edge, so a reply that does not match what the screens rely on is reported as
 * such instead of rendering as broken UI.
 */

export const ACTOR_TYPES = ['user', 'brain', 'system', 'service'] as const satisfies readonly AuditActorType[];
export const CATEGORIES = [
  'command', 'brain', 'tool', 'policy', 'approval', 'data_access', 'memory', 'metrics', 'auth', 'config', 'system',
] as const satisfies readonly AuditCategory[];
export const OUTCOMES = ['success', 'failure', 'denied', 'partial'] as const satisfies readonly AuditOutcome[];
export const RISK_LEVELS = ['low', 'medium', 'high'] as const satisfies readonly AuditRiskLevel[];

export type { AuditActorType, AuditCategory, AuditOutcome, AuditRiskLevel };

const isoDate = z.string().min(1);
const nullableIso = isoDate.nullable();

export const outcomeSchema = z.enum(OUTCOMES);
export const categorySchema = z.enum(CATEGORIES);
export const riskSchema = z.enum(RISK_LEVELS);
export const actorTypeSchema = z.enum(ACTOR_TYPES);

const targetSchema = z.object({ type: z.string(), id: z.string() });

export const storedAuditEventSchema = z.object({
  version: z.literal(1),
  eventId: z.string(),
  traceId: z.string(),
  spanId: z.string(),
  parentSpanId: z.string().optional(),
  workspaceId: z.string(),
  userId: z.string().optional(),
  goalId: z.string().optional(),
  threadId: z.string().optional(),
  campaignId: z.string().optional(),
  actor: z.object({ type: actorTypeSchema, id: z.string() }),
  service: z.string(),
  action: z.string(),
  category: categorySchema,
  target: targetSchema.optional(),
  outcome: outcomeSchema,
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  riskLevel: riskSchema.optional(),
  cost: z
    .object({
      tokensIn: z.number().optional(),
      tokensOut: z.number().optional(),
      currency: z.string().optional(),
      amount: z.number().optional(),
    })
    .optional(),
  durationMs: z.number().optional(),
  occurredAt: isoDate,
  details: z.record(z.unknown()),
  tags: z.array(z.string()).optional(),
  prevHash: z.string().nullable(),
  hash: z.string().nullable(),
  ingestedAt: isoDate,
  schemaVersion: z.number(),
  // Protocol 0.3.3. The API never returns the text itself on these routes: `hasContent` says it exists
  // (administrators read it from the content routes) and `contentDigest` (administrators only) is the
  // SHA-256 of the text, which the hash chain covers.
  hasContent: z.literal(true).optional(),
  contentDigest: z.string().optional(),
});

/**
 * An audit event as the API returns it: the protocol's StoredAuditEvent without the raw text (`content` and
 * `contentDigest` are replaced by `hasContent` and, for administrators, the digest), and the hash may be
 * absent on legacy records.
 */
export type AuditEventRecord = Omit<StoredAuditEvent, 'hash' | 'content' | 'contentDigest'> & {
  hash: string | null;
  hasContent?: true;
  contentDigest?: string;
};

/**
 * The raw text of one event (protocol AuditContent) as the administrator-only content routes return it.
 * `kind` is an open set, so it is a plain string; the length bound is the protocol's 16384.
 */
export const auditContentSchema = z.object({
  kind: z.string(),
  text: z.string(),
  truncated: z.boolean(),
  originalLength: z.number(),
  redactions: z.number(),
});
export type { AuditContent };

export const eventContentSchema = z.object({
  eventId: z.string(),
  traceId: z.string(),
  spanId: z.string(),
  action: z.string(),
  occurredAt: isoDate,
  content: auditContentSchema,
  contentDigest: z.string(),
  /** False when the stored text no longer matches the digest the hash chain covers. */
  verified: z.boolean(),
});
export type EventContent = z.infer<typeof eventContentSchema>;

export const traceContentSchema = z.object({
  traceId: z.string(),
  items: z.array(eventContentSchema),
  /** True when the trace has more events than were loaded. */
  truncated: z.boolean(),
});
export type TraceContent = z.infer<typeof traceContentSchema>;

// Compile-time guard: if the pinned protocol type and this schema drift apart, the build fails.
type Assert<T extends true> = T;
export type _SchemaMatchesProtocol = Assert<
  Omit<z.infer<typeof storedAuditEventSchema>, 'hash'> extends Omit<StoredAuditEvent, 'hash'> ? true : false
>;

export const eventsPageSchema = z.object({
  events: z.array(storedAuditEventSchema),
  nextCursor: z.string().nullable(),
  from: nullableIso,
  to: nullableIso,
  order: z.enum(['asc', 'desc']),
  limit: z.number(),
});
export type EventsPage = z.infer<typeof eventsPageSchema>;

export const traceSummarySchema = z.object({
  traceId: z.string(),
  rootAction: z.string(),
  rootService: z.string(),
  startedAt: isoDate,
  lastEventAt: isoDate,
  eventCount: z.number(),
  outcome: outcomeSchema,
  riskLevel: riskSchema.optional(),
  durationMs: z.number(),
});
export type TraceSummary = z.infer<typeof traceSummarySchema>;

export const tracesPageSchema = z.object({
  traces: z.array(traceSummarySchema),
  nextCursor: z.string().nullable(),
  from: nullableIso,
  to: nullableIso,
  limit: z.number(),
});
export type TracesPage = z.infer<typeof tracesPageSchema>;

export interface SpanNode {
  eventId: string;
  spanId: string;
  parentSpanId?: string;
  action: string;
  service: string;
  category: AuditCategory;
  outcome: AuditOutcome;
  riskLevel?: AuditRiskLevel;
  actor: { type: AuditActorType; id: string };
  target?: { type: string; id: string };
  errorCode?: string;
  goalId?: string;
  threadId?: string;
  campaignId?: string;
  startedAt: string;
  offsetMs: number;
  durationMs: number | null;
  subtreeOutcome: AuditOutcome;
  orphan?: boolean;
  children: SpanNode[];
}

export const spanNodeSchema: z.ZodType<SpanNode> = z.lazy(() =>
  z.object({
    eventId: z.string(),
    spanId: z.string(),
    parentSpanId: z.string().optional(),
    action: z.string(),
    service: z.string(),
    category: categorySchema,
    outcome: outcomeSchema,
    riskLevel: riskSchema.optional(),
    actor: z.object({ type: actorTypeSchema, id: z.string() }),
    target: targetSchema.optional(),
    errorCode: z.string().optional(),
    goalId: z.string().optional(),
    threadId: z.string().optional(),
    campaignId: z.string().optional(),
    startedAt: isoDate,
    offsetMs: z.number(),
    durationMs: z.number().nullable(),
    subtreeOutcome: outcomeSchema,
    orphan: z.boolean().optional(),
    children: z.array(spanNodeSchema),
  })
);

export const traceTreeSchema = z.object({
  traceId: z.string(),
  startedAt: isoDate,
  endedAt: isoDate,
  durationMs: z.number(),
  eventCount: z.number(),
  outcome: outcomeSchema,
  riskLevel: riskSchema.optional(),
  truncated: z.boolean(),
  roots: z.array(spanNodeSchema),
  related: z.object({
    goalIds: z.array(z.string()),
    threadIds: z.array(z.string()),
    campaignIds: z.array(z.string()),
  }),
});
export type TraceTree = z.infer<typeof traceTreeSchema>;

export const CHAIN_PROBLEM_TYPES = [
  'invalid_event', 'workspace_mismatch', 'hash_mismatch', 'broken_link', 'bad_genesis', 'non_monotonic_ingested_at',
] as const;
export type ChainProblemType = (typeof CHAIN_PROBLEM_TYPES)[number];

export const chainVerificationSchema = z.object({
  workspaceId: z.string(),
  range: z.object({ from: isoDate, to: isoDate }),
  ok: z.boolean(),
  checked: z.number(),
  firstEventId: z.string().nullable(),
  lastEventId: z.string().nullable(),
  lastHash: z.string().nullable(),
  problems: z.array(
    z.object({
      // Tolerate problem types added by a newer API.
      type: z.string(),
      eventId: z.string(),
      detail: z.string(),
    })
  ),
  complete: z.boolean(),
  truncated: z.boolean().optional(),
});
export type ChainVerification = z.infer<typeof chainVerificationSchema>;

const nullableNumber = z.number().nullable();

export const metricsTotalsSchema = z.object({
  currency: z.string(),
  impressions: z.number(),
  clicks: z.number(),
  spend: z.number(),
  conversions: z.number(),
  videoViews: z.number().optional(),
  revenue: z.number().optional(),
  ctr: nullableNumber,
  cpc: nullableNumber,
  cpm: nullableNumber,
  cpa: nullableNumber,
  roas: nullableNumber,
  observationCount: z.number(),
});
export type MetricsTotals = z.infer<typeof metricsTotalsSchema>;

export const freshnessSchema = z.object({
  asOf: nullableIso,
  rollupsComputedAt: nullableIso,
  observationsFetchedAt: nullableIso,
});
export type Freshness = z.infer<typeof freshnessSchema>;

export const seriesPointSchema = metricsTotalsSchema.extend({ bucket: z.string() });
export type SeriesPoint = z.infer<typeof seriesPointSchema>;

export const campaignTotalsSchema = metricsTotalsSchema.extend({
  platform: z.string(),
  accountId: z.string(),
  campaignId: z.string(),
});
export type CampaignTotals = z.infer<typeof campaignTotalsSchema>;

export const GRANULARITIES = ['hour', 'day'] as const;
export type Granularity = (typeof GRANULARITIES)[number];

export const metricsSummarySchema = z.object({
  workspaceId: z.string(),
  from: isoDate,
  to: isoDate,
  granularity: z.enum(GRANULARITIES),
  campaignId: z.string().optional(),
  totals: z.array(metricsTotalsSchema),
  series: z.array(seriesPointSchema),
  campaigns: z.array(campaignTotalsSchema).optional(),
  campaignsTruncated: z.boolean().optional(),
  freshness: freshnessSchema,
});
export type MetricsSummary = z.infer<typeof metricsSummarySchema>;

const changeSchema = z.object({
  current: z.number(),
  previous: z.number(),
  change: z.number(),
  changePct: z.number().nullable(),
});
export type Change = z.infer<typeof changeSchema>;

const periodSchema = z.object({ from: isoDate, to: isoDate, totals: z.array(metricsTotalsSchema) });

export const periodComparisonSchema = z.object({
  workspaceId: z.string(),
  granularity: z.enum(GRANULARITIES),
  campaignId: z.string().optional(),
  current: periodSchema,
  previous: periodSchema,
  comparison: z.array(
    z.object({
      currency: z.string(),
      impressions: changeSchema,
      clicks: changeSchema,
      spend: changeSchema,
      conversions: changeSchema,
    })
  ),
  freshness: freshnessSchema,
});
export type PeriodComparison = z.infer<typeof periodComparisonSchema>;

export const campaignsResponseSchema = z.object({
  workspaceId: z.string(),
  from: isoDate,
  to: isoDate,
  granularity: z.enum(GRANULARITIES),
  campaigns: z.array(campaignTotalsSchema),
  truncated: z.boolean(),
  freshness: freshnessSchema,
});
export type CampaignsResponse = z.infer<typeof campaignsResponseSchema>;

const facetValues = z.array(z.object({ value: z.string(), count: z.number() }));
export const FACET_NAMES = [
  'service', 'action', 'category', 'outcome', 'riskLevel', 'actorType', 'actorId', 'campaignId',
] as const;
export type FacetName = (typeof FACET_NAMES)[number];

export const facetsSchema = z.object({
  facets: z.object({
    service: facetValues,
    action: facetValues,
    category: facetValues,
    outcome: facetValues,
    riskLevel: facetValues,
    actorType: facetValues,
    actorId: facetValues,
    campaignId: facetValues,
  }),
  truncated: z.array(z.string()),
  from: nullableIso,
  to: nullableIso,
  limit: z.number(),
});
export type Facets = z.infer<typeof facetsSchema>;

export const sessionSchema = z.object({
  subject: z.string(),
  email: z.string(),
  role: z.enum(['viewer', 'admin']),
  workspaceId: z.string(),
});
export type ApiSession = z.infer<typeof sessionSchema>;

export const errorBodySchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  traceId: z.string().optional(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
