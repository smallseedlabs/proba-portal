import { HttpTransport, type Query, type TokenSource } from './transport';
import type {
  AuditApi,
  CallOptions,
  CampaignsQuery,
  CompareQuery,
  EventQuery,
  SummaryQuery,
  TimeRange,
} from './port';
import {
  chainVerificationSchema,
  campaignsResponseSchema,
  eventContentSchema,
  eventsPageSchema,
  facetsSchema,
  metricsSummarySchema,
  periodComparisonSchema,
  sessionSchema,
  storedAuditEventSchema,
  traceContentSchema,
  traceTreeSchema,
  tracesPageSchema,
  type AuditEventRecord,
} from './schemas';
import type { z } from 'zod';
import type { ApiError } from './errors';

export type { TokenSource };

export interface HttpAuditApiOptions {
  baseUrl: string;
  getToken: TokenSource;
  fetchImpl?: typeof fetch;
  /** Called with the failed request's trace id for diagnostics. Optional. */
  onError?: (error: ApiError) => void;
}

/** Reads the audit API (proba-audit /v1) with the signed-in person's Firebase ID token. */
export class HttpAuditApi implements AuditApi {
  private readonly transport: HttpTransport;

  constructor(options: HttpAuditApiOptions) {
    this.transport = new HttpTransport(options);
  }

  private get<S extends z.ZodTypeAny>(path: string, schema: S, query?: Query, callOptions?: CallOptions): Promise<z.infer<S>> {
    return this.transport.get(path, schema, query, callOptions?.signal);
  }

  getSession(options?: CallOptions) {
    return this.get('/v1/session', sessionSchema, undefined, options);
  }

  searchEvents(query: EventQuery, options?: CallOptions) {
    return this.get('/v1/events', eventsPageSchema, { ...query }, options);
  }

  getEvent(eventId: string, options?: CallOptions): Promise<AuditEventRecord> {
    return this.get(`/v1/events/${encodeURIComponent(eventId)}`, storedAuditEventSchema, undefined, options);
  }

  getEventContent(eventId: string, options?: CallOptions) {
    return this.get(`/v1/events/${encodeURIComponent(eventId)}/content`, eventContentSchema, undefined, options);
  }

  getTraceContent(traceId: string, options?: CallOptions) {
    return this.get(`/v1/traces/${encodeURIComponent(traceId)}/content`, traceContentSchema, undefined, options);
  }

  listTraces(query: TimeRange & { limit?: number; cursor?: string }, options?: CallOptions) {
    return this.get('/v1/traces', tracesPageSchema, { ...query }, options);
  }

  getTrace(traceId: string, options?: CallOptions) {
    return this.get(`/v1/traces/${encodeURIComponent(traceId)}`, traceTreeSchema, undefined, options);
  }

  getFacets(query: TimeRange & { limit?: number } = {}, options?: CallOptions) {
    return this.get('/v1/facets', facetsSchema, { ...query }, options);
  }

  verifyChain(query: { from: string; to: string }, options?: CallOptions) {
    return this.get('/v1/chain/verify', chainVerificationSchema, { ...query }, options);
  }

  getAnalyticsSummary(query: SummaryQuery, options?: CallOptions) {
    return this.get('/v1/analytics/summary', metricsSummarySchema, { ...query }, options);
  }

  compareAnalytics(query: CompareQuery, options?: CallOptions) {
    return this.get('/v1/analytics/compare', periodComparisonSchema, { ...query }, options);
  }

  getTopCampaigns(query: CampaignsQuery, options?: CallOptions) {
    return this.get('/v1/analytics/campaigns', campaignsResponseSchema, { ...query }, options);
  }
}
