export type ApiErrorKind =
  /** The caller's token is missing, invalid or expired. */
  | 'unauthenticated'
  /** Authenticated but not allowed (not on the allow-list, or not an administrator). */
  | 'forbidden'
  | 'not_found'
  /** A parameter was rejected (the screens validate first, so this is rare). */
  | 'invalid_request'
  | 'rate_limited'
  | 'unavailable'
  /** The server answered with something the portal cannot read. */
  | 'bad_response'
  | 'network'
  | 'cancelled';

export interface ApiIssue {
  path: string;
  message: string;
}

/** Everything that can go wrong talking to the audit API, in terms the screens can act on. */
export class ApiError extends Error {
  constructor(
    public readonly kind: ApiErrorKind,
    message: string,
    public readonly options: {
      status?: number;
      /** The API's machine-readable code, e.g. insufficient_role. */
      code?: string;
      /** The API's trace id for the failed request: quote it when asking for support. */
      traceId?: string;
      issues?: ApiIssue[];
      retryAfterSeconds?: number;
    } = {}
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get status(): number | undefined {
    return this.options.status;
  }
  get code(): string | undefined {
    return this.options.code;
  }
  get traceId(): string | undefined {
    return this.options.traceId;
  }
  get issues(): ApiIssue[] {
    return this.options.issues ?? [];
  }
  get retryAfterSeconds(): number | undefined {
    return this.options.retryAfterSeconds;
  }

  /** Worth offering "Try again". */
  get retryable(): boolean {
    return this.kind === 'unavailable' || this.kind === 'network' || this.kind === 'rate_limited' || this.kind === 'bad_response';
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
