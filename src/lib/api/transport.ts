import type { z } from 'zod';
import { getLogger } from '../log/logger';
import { ApiError, type ApiErrorKind } from './errors';
import { errorBodySchema } from './schemas';

/** Provides the current Firebase ID token; `forceRefresh` after a 401. */
export type TokenSource = (forceRefresh?: boolean) => Promise<string>;

export interface HttpTransportOptions {
  baseUrl: string;
  getToken: TokenSource;
  fetchImpl?: typeof fetch;
  /** Called with the failed request's trace id for diagnostics. Optional. */
  onError?: (error: ApiError) => void;
}

export type Query = Record<string, string | number | undefined>;

export interface RequestOptions {
  query?: Query;
  /** JSON body (sent with POST). Its contents are never logged: only the names of its fields. */
  body?: unknown;
  signal?: AbortSignal;
}

export function kindFor(status: number): ApiErrorKind {
  if (status === 401) return 'unauthenticated';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status >= 400 && status < 500) return 'invalid_request';
  return 'unavailable';
}

export const ERROR_MESSAGES: Record<ApiErrorKind, string> = {
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

/**
 * One authenticated JSON conversation with a Proba service (audit API, memory API): bearer token from the
 * identity provider, one shared token refresh after a 401, errors mapped to ApiError, every response
 * validated against a schema before a screen sees it, and logging that never contains tokens, query
 * values or request bodies.
 */
export class HttpTransport {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private refreshing: Promise<string> | null = null;

  constructor(private readonly options: HttpTransportOptions) {
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

  private async send(method: 'GET' | 'POST', url: string, token: string, body: unknown, signal?: AbortSignal): Promise<Response> {
    const started = Date.now();
    const parsed = new URL(url);
    const where = {
      method,
      path: parsed.pathname,
      queryKeys: [...parsed.searchParams.keys()],
      ...(body && typeof body === 'object' ? { bodyKeys: Object.keys(body) } : {}),
    };
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    try {
      const response = await this.fetchImpl(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal });
      getLogger().info('api.request', {
        ...where,
        status: response.status,
        durationMs: Date.now() - started,
        traceId: response.headers.get('X-Trace-Id') ?? undefined,
      });
      return response;
    } catch (error) {
      if ((error as { name?: string } | null)?.name === 'AbortError') {
        getLogger().debug('api.cancelled', { ...where, durationMs: Date.now() - started });
        throw new ApiError('cancelled', ERROR_MESSAGES.cancelled);
      }
      getLogger().warn('api.network_error', { ...where, durationMs: Date.now() - started });
      throw new ApiError('network', ERROR_MESSAGES.network);
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
    const error = new ApiError(kind, kind === 'invalid_request' && body?.message ? body.message : ERROR_MESSAGES[kind], {
      status: response.status,
      code: body?.error,
      traceId: body?.traceId ?? response.headers.get('X-Trace-Id') ?? undefined,
      issues: body?.issues,
      retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    });
    getLogger()[response.status >= 500 ? 'error' : 'warn']('api.error', {
      path: new URL(response.url || this.baseUrl).pathname,
      status: response.status,
      kind,
      code: body?.error,
      traceId: error.traceId,
    });
    this.options.onError?.(error);
    throw error;
  }

  /** Several requests rejected at once share one refresh instead of each asking for a new token. */
  private refreshToken(): Promise<string> {
    if (!this.refreshing) getLogger().info('api.token_refresh');
    this.refreshing ??= this.options.getToken(true).finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  async request<S extends z.ZodTypeAny>(method: 'GET' | 'POST', path: string, schema: S, options: RequestOptions = {}): Promise<z.infer<S>> {
    const url = this.url(path, options.query);
    let token: string;
    try {
      token = await this.options.getToken();
    } catch {
      throw new ApiError('unauthenticated', ERROR_MESSAGES.unauthenticated);
    }
    let response = await this.send(method, url, token, options.body, options.signal);
    if (response.status === 401) {
      // The token may simply have expired: refresh it once and retry.
      try {
        token = await this.refreshToken();
      } catch {
        throw new ApiError('unauthenticated', ERROR_MESSAGES.unauthenticated, { status: 401 });
      }
      response = await this.send(method, url, token, options.body, options.signal);
    }
    if (!response.ok) return this.fail(response);

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new ApiError('bad_response', ERROR_MESSAGES.bad_response, { status: response.status });
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      const error = new ApiError('bad_response', ERROR_MESSAGES.bad_response, {
        status: response.status,
        traceId: response.headers.get('X-Trace-Id') ?? undefined,
      });
      getLogger().error('api.bad_response', {
        path,
        status: response.status,
        traceId: response.headers.get('X-Trace-Id') ?? undefined,
        issues: parsed.error.issues.slice(0, 3).map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
      this.options.onError?.(error);
      throw error;
    }
    return parsed.data;
  }

  get<S extends z.ZodTypeAny>(path: string, schema: S, query?: Query, signal?: AbortSignal): Promise<z.infer<S>> {
    return this.request('GET', path, schema, { query, signal });
  }

  post<S extends z.ZodTypeAny>(path: string, schema: S, body: unknown, signal?: AbortSignal): Promise<z.infer<S>> {
    return this.request('POST', path, schema, { body, signal });
  }
}
