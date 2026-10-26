import type { z } from 'zod';
import { ApiError, type ApiErrorKind } from './errors';
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
  errorBodySchema,
  eventsPageSchema,
  facetsSchema,
  metricsSummarySchema,
  periodComparisonSchema,
  sessionSchema,
  storedAuditEventSchema,
  traceTreeSchema,
  tracesPageSchema,
  type AuditEventRecord,
} from './schemas';

/** Provides the current Firebase ID token; `forceRefresh` after a 401. */
export type TokenSource = (forceRefresh?: boolean) => Promise<string>;

export interface HttpAuditApiOptions {
  baseUrl: string;
  getToken: TokenSource;
  fetchImpl?: typeof fetch;
  /** Called with the failed request's trace id for diagnostics. Optional. */
  onError?: (error: ApiError) => void;
}

type Query = Record<string, string | number | undefined>;

function kindFor(status: number): ApiErrorKind {
  if (status === 401) return 'unauthenticated';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status >= 400 && status < 500) return 'invalid_request';
  return 'unavailable';
}

const MESSAGES: Record<ApiErrorKind, string> = {
  unauthenticated: 'Your session is no longer valid. Please sign in again.',
  forbidden: "Your account doesn't have access to this.",
  not_found: "We couldn't find what you were looking for.",
  invalid_request: 'Some of the values you entered were not accepted.',
  rate_limited: 'Too many requests. Please wait a moment and try again.',
  unavailable: 'Proba is temporarily unavailable. Please try again shortly.',
  bad_response: 'Proba returned a response we could not read. Please try again.',
  network: "We couldn't reach Proba. Check your connection and try again.",
  cancelled: 'The request was cancelled.',
};

/** Reads the audit API (proba-audit /v1) with the signed-in person's Firebase ID token. */
export class HttpAuditApi implements AuditApi {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: HttpAuditApiOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
  }

  private url(path: string, query?: Query): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    const qs = params.toString();
    return `${this.baseUrl}${path}${qs ? `?${qs}` : ''}`;
  }

  private async send(url: string, token: string, signal?: AbortSignal): Promise<Response> {
    try {
      return await this.fetchImpl(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal,
      });
    } catch (error) {
      if ((error as { name?: string } | null)?.name === 'AbortError') {
        throw new ApiError('cancelled', MESSAGES.cancelled);
      }
      throw new ApiError('network', MESSAGES.network);
    }
  }

  private async fail(response: Response): Promise<never> {
    let body: z.infer<typeof errorBodySchema> | undefined;
    try {
      const parsed = errorBodySchema.safeParse(await response.json());
      if (parsed.success) body = parsed.data;
    } catch {
      /* not JSON (e.g. a proxy error page) */
    }
    const kind = kindFor(response.status);
    const retryAfter = Number(response.headers.get('Retry-After'));
    const error = new ApiError(kind, kind === 'invalid_request' && body?.message ? body.message : MESSAGES[kind], {
      status: response.status,
      code: body?.error,
      traceId: body?.traceId ?? response.headers.get('X-Trace-Id') ?? undefined,
      issues: body?.issues,
      retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    });
    this.options.onError?.(error);
    throw error;
  }

  private async get<S extends z.ZodTypeAny>(
    path: string,
    schema: S,
    query?: Query,
    callOptions?: CallOptions
  ): Promise<z.infer<S>> {
    const url = this.url(path, query);
    let token: string;
    try {
      token = await this.options.getToken();
    } catch {
      throw new ApiError('unauthenticated', MESSAGES.unauthenticated);
    }
    let response = await this.send(url, token, callOptions?.signal);
    if (response.status === 401) {
      // The token may simply have expired: refresh it once and retry.
      try {
        token = await this.options.getToken(true);
      } catch {
        throw new ApiError('unauthenticated', MESSAGES.unauthenticated, { status: 401 });
      }
      response = await this.send(url, token, callOptions?.signal);
    }
    if (!response.ok) return this.fail(response);

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new ApiError('bad_response', MESSAGES.bad_response, { status: response.status });
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      const error = new ApiError('bad_response', MESSAGES.bad_response, {
        status: response.status,
        traceId: response.headers.get('X-Trace-Id') ?? undefined,
      });
      console.error('Unexpected response shape', path, parsed.error.issues.slice(0, 3));
      this.options.onError?.(error);
      throw error;
    }
    return parsed.data;
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
