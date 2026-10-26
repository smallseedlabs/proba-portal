import type {
  ApiSession,
  AuditActorType,
  AuditCategory,
  AuditEventRecord,
  AuditOutcome,
  AuditRiskLevel,
  CampaignsResponse,
  ChainVerification,
  EventContent,
  EventsPage,
  Facets,
  Granularity,
  MetricsSummary,
  PeriodComparison,
  TraceContent,
  TraceTree,
  TracesPage,
} from './schemas';

export interface TimeRange {
  /** ISO 8601 UTC, inclusive. */
  from?: string;
  /** ISO 8601 UTC, exclusive. */
  to?: string;
}

export interface EventQuery extends TimeRange {
  traceId?: string;
  actor?: string;
  actorType?: AuditActorType;
  service?: string;
  action?: string;
  category?: AuditCategory;
  outcome?: AuditOutcome;
  riskLevel?: AuditRiskLevel;
  goalId?: string;
  threadId?: string;
  campaignId?: string;
  q?: string;
  order?: 'asc' | 'desc';
  limit?: number;
  cursor?: string;
}

export interface AnalyticsRange {
  from: string;
  to: string;
  granularity: Granularity;
}

export interface SummaryQuery extends AnalyticsRange {
  campaignId?: string;
}

export interface CompareQuery {
  granularity: Granularity;
  currentFrom: string;
  currentTo: string;
  previousFrom?: string;
  previousTo?: string;
  campaignId?: string;
}

export interface CampaignsQuery extends AnalyticsRange {
  limit?: number;
}

export interface CallOptions {
  signal?: AbortSignal;
}

/**
 * The portal's only way to read data. Screens depend on this interface; the adapter behind it is
 * chosen by configuration (see factory.ts). All methods reject with ApiError.
 */
export interface AuditApi {
  getSession(options?: CallOptions): Promise<ApiSession>;
  searchEvents(query: EventQuery, options?: CallOptions): Promise<EventsPage>;
  getEvent(eventId: string, options?: CallOptions): Promise<AuditEventRecord>;
  /** Raw text of one event. Administrators only; rejects with 403 for viewers and 404 when there is no text or the deployment does not serve it. */
  getEventContent(eventId: string, options?: CallOptions): Promise<EventContent>;
  listTraces(query: TimeRange & { limit?: number; cursor?: string }, options?: CallOptions): Promise<TracesPage>;
  getTrace(traceId: string, options?: CallOptions): Promise<TraceTree>;
  /** Raw text of every event of a trace that has some. Same rules as getEventContent. */
  getTraceContent(traceId: string, options?: CallOptions): Promise<TraceContent>;
  getFacets(query?: TimeRange & { limit?: number }, options?: CallOptions): Promise<Facets>;
  verifyChain(query: { from: string; to: string }, options?: CallOptions): Promise<ChainVerification>;
  getAnalyticsSummary(query: SummaryQuery, options?: CallOptions): Promise<MetricsSummary>;
  compareAnalytics(query: CompareQuery, options?: CallOptions): Promise<PeriodComparison>;
  getTopCampaigns(query: CampaignsQuery, options?: CallOptions): Promise<CampaignsResponse>;
}
