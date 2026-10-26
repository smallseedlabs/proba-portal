import { ApiError } from '../errors';
import type {
  AuditApi,
  CallOptions,
  CampaignsQuery,
  CompareQuery,
  EventQuery,
  SummaryQuery,
  TimeRange,
} from '../port';
import type {
  ApiSession,
  AuditContent,
  AuditEventRecord,
  AuditOutcome,
  AuditRiskLevel,
  CampaignTotals,
  CampaignsResponse,
  ChainVerification,
  EventContent,
  EventsPage,
  Facets,
  Granularity,
  MetricsSummary,
  MetricsTotals,
  PeriodComparison,
  SpanNode,
  TraceContent,
  TraceSummary,
  TraceTree,
  TracesPage,
} from '../schemas';
import { PROBA_IN_MEMORY_ADAPTER_MARKER, SEED_CAMPAIGNS, WORKSPACE_ID, seedEvents, seedMetrics, type SeedMetricRow } from './seed';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface InMemoryAuditApiOptions {
  now?: () => number;
  role?: ApiSession['role'];
  email?: string;
  /** Artificial latency per call, to exercise loading states. */
  latencyMs?: number;
  events?: AuditEventRecord[];
  tamperedEventId?: string;
  metrics?: SeedMetricRow[];
  /** Raw text by event id. Defaults to the fixture texts when the fixture events are used. */
  contents?: Map<string, AuditContent>;
  /** Whether the deployment serves raw text (AUDIT_CONTENT_ENABLED). Default true. */
  contentEnabled?: boolean;
  /** Events whose stored text no longer matches the digest the chain covers. */
  unverifiedContentEventIds?: Set<string>;
}

const OUTCOME_SEVERITY: Record<AuditOutcome, number> = { success: 0, partial: 1, denied: 2, failure: 3 };
const RISK_SEVERITY: Record<AuditRiskLevel, number> = { low: 0, medium: 1, high: 2 };

function worst(a: AuditOutcome, b: AuditOutcome): AuditOutcome {
  return OUTCOME_SEVERITY[b] > OUTCOME_SEVERITY[a] ? b : a;
}

function invalid(message: string, path: string): ApiError {
  return new ApiError('invalid_request', message, { status: 400, code: 'invalid_query', issues: [{ path, message }] });
}

function parseTime(value: string | undefined, path: string): number | undefined {
  if (value === undefined) return undefined;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw invalid('must be an ISO 8601 date and time', path);
  return ms;
}

function encodeCursor(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/=+$/, '');
}

function decodeCursor<T>(cursor: string): T {
  try {
    return JSON.parse(atob(cursor)) as T;
  } catch {
    throw new ApiError('invalid_request', 'The cursor is not valid. Start again from the first page.', {
      status: 400,
      code: 'invalid_cursor',
    });
  }
}

function safeDiv(a: number, b: number): number | null {
  return b === 0 ? null : a / b;
}

function totalsOf(rows: SeedMetricRow[], currency: string): MetricsTotals {
  const sum = (key: 'impressions' | 'clicks' | 'spend' | 'conversions' | 'revenue') =>
    rows.reduce((acc, row) => acc + (row[key] ?? 0), 0);
  const impressions = sum('impressions');
  const clicks = sum('clicks');
  const spend = Math.round(sum('spend') * 100) / 100;
  const conversions = sum('conversions');
  const revenue = Math.round(sum('revenue') * 100) / 100;
  return {
    currency,
    impressions,
    clicks,
    spend,
    conversions,
    revenue,
    ctr: safeDiv(clicks, impressions),
    cpc: safeDiv(spend, clicks),
    cpm: safeDiv(spend * 1000, impressions),
    cpa: safeDiv(spend, conversions),
    roas: safeDiv(revenue, spend),
    observationCount: rows.length,
  };
}

function totalsPerCurrency(rows: SeedMetricRow[]): MetricsTotals[] {
  const currencies = [...new Set(rows.map((r) => r.currency))].sort();
  return currencies.map((currency) => totalsOf(rows.filter((r) => r.currency === currency), currency));
}

/**
 * The audit API's behaviour over fixture data held in memory, including its validation rules, paging
 * and error answers. Used only by the automated tests: it is compiled into the browser-check build and
 * left out of production builds (see factory.ts and scripts/check-production-bundle.mjs).
 */
export class InMemoryAuditApi implements AuditApi {
  readonly marker = PROBA_IN_MEMORY_ADAPTER_MARKER;
  private readonly now: () => number;
  private readonly events: AuditEventRecord[];
  private readonly metrics: SeedMetricRow[];
  /** Exposed so tests can verify the integrity screen against a known broken record. */
  readonly tamperedEventId: string;
  private readonly contents: Map<string, AuditContent>;
  /** Total calls per operation, for assertions. */
  readonly calls: Record<string, number> = {};
  failNext: ApiError | null = null;

  constructor(private readonly options: InMemoryAuditApiOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    const seeded = options.events ? null : seedEvents(this.now());
    this.events = options.events ?? seeded!.events;
    this.tamperedEventId = options.tamperedEventId ?? seeded?.tamperedEventId ?? '';
    this.metrics = options.metrics ?? seedMetrics(this.now());
    this.contents = options.contents ?? seeded?.contents ?? new Map();
  }

  private get isAdmin(): boolean {
    return (this.options.role ?? 'admin') === 'admin';
  }

  /** An event as the API returns it: never the text; `hasContent` only when the deployment serves it; the digest to administrators only. */
  private expose(event: AuditEventRecord): AuditEventRecord {
    const { hasContent, contentDigest, ...rest } = event;
    const serves = this.options.contentEnabled !== false && hasContent === true;
    return { ...rest, ...(serves ? { hasContent: true as const } : {}), ...(serves && this.isAdmin && contentDigest ? { contentDigest } : {}) };
  }

  private requireContentAccess(): void {
    if (!this.isAdmin) {
      throw new ApiError('forbidden', "Your account doesn't have access to this.", { status: 403, code: 'insufficient_role' });
    }
    if (this.options.contentEnabled === false) {
      throw new ApiError('not_found', 'Raw text is not enabled on this deployment.', { status: 404, code: 'content_disabled' });
    }
  }

  private toEventContent(event: AuditEventRecord, content: AuditContent): EventContent {
    return {
      eventId: event.eventId,
      traceId: event.traceId,
      spanId: event.spanId,
      action: event.action,
      occurredAt: event.occurredAt,
      content: { ...content },
      contentDigest: event.contentDigest ?? '0'.repeat(64),
      verified: !this.options.unverifiedContentEventIds?.has(event.eventId),
    };
  }

  async getEventContent(eventId: string, options?: CallOptions): Promise<EventContent> {
    await this.enter('getEventContent', options);
    this.requireContentAccess();
    const event = this.events.find((e) => e.eventId === eventId);
    const content = event ? this.contents.get(eventId) : undefined;
    if (!event || !content) throw new ApiError('not_found', 'There is no raw text for this event.', { status: 404, code: 'not_found' });
    return this.toEventContent(event, content);
  }

  async getTraceContent(traceId: string, options?: CallOptions): Promise<TraceContent> {
    await this.enter('getTraceContent', options);
    this.requireContentAccess();
    const events = this.events
      .filter((e) => e.traceId === traceId)
      .sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : a.eventId < b.eventId ? -1 : 1));
    if (events.length === 0) throw new ApiError('not_found', "We couldn't find what you were looking for.", { status: 404, code: 'not_found' });
    const items = events.flatMap((e) => {
      const content = this.contents.get(e.eventId);
      return content ? [this.toEventContent(e, content)] : [];
    });
    return { traceId, items, truncated: false };
  }

  private async enter(name: string, callOptions?: CallOptions): Promise<void> {
    this.calls[name] = (this.calls[name] ?? 0) + 1;
    if (this.options.latencyMs) await new Promise((r) => setTimeout(r, this.options.latencyMs));
    if (callOptions?.signal?.aborted) throw new ApiError('cancelled', 'The request was cancelled.');
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
  }

  async getSession(options?: CallOptions): Promise<ApiSession> {
    await this.enter('getSession', options);
    return {
      subject: 'fixture-subject',
      email: this.options.email ?? 'amelia.frost@northwind.example',
      role: this.options.role ?? 'admin',
      workspaceId: WORKSPACE_ID,
    };
  }

  private range(query: TimeRange, defaultSpan: number, maxSpan: number, anchored = false): { from?: number; to?: number } {
    const to = parseTime(query.to, 'to');
    const from = parseTime(query.from, 'from');
    if (from === undefined && to === undefined && anchored) return {};
    const end = to ?? this.now();
    const start = from ?? end - defaultSpan;
    if (start >= end) throw invalid('"from" must be before "to"', 'from');
    if (end - start > maxSpan) throw invalid(`the range may be at most ${Math.round(maxSpan / DAY)} days`, 'from');
    return { from: start, to: end };
  }

  private inRange(event: AuditEventRecord, r: { from?: number; to?: number }): boolean {
    const t = Date.parse(event.occurredAt);
    return (r.from === undefined || t >= r.from) && (r.to === undefined || t < r.to);
  }

  async searchEvents(query: EventQuery, options?: CallOptions): Promise<EventsPage> {
    await this.enter('searchEvents', options);
    const anchored = Boolean(query.traceId || query.goalId || query.threadId);
    const r = this.range(query, DAY, 90 * DAY, anchored);
    const order = query.order ?? 'desc';
    const limit = query.limit ?? 50;
    if (limit < 1 || limit > 200) throw invalid('must be between 1 and 200', 'limit');
    if (query.q !== undefined && (query.q.length < 2 || query.q.length > 100)) throw invalid('must be 2 to 100 characters', 'q');
    const q = query.q?.toLowerCase();
    let matches = this.events.filter(
      (e) =>
        this.inRange(e, r) &&
        (!query.traceId || e.traceId === query.traceId) &&
        (!query.actor || e.actor.id === query.actor) &&
        (!query.actorType || e.actor.type === query.actorType) &&
        (!query.service || e.service === query.service) &&
        (!query.action || e.action === query.action) &&
        (!query.category || e.category === query.category) &&
        (!query.outcome || e.outcome === query.outcome) &&
        (!query.riskLevel || e.riskLevel === query.riskLevel) &&
        (!query.goalId || e.goalId === query.goalId) &&
        (!query.threadId || e.threadId === query.threadId) &&
        (!query.campaignId || e.campaignId === query.campaignId) &&
        (!q || e.action.toLowerCase().includes(q) || `${e.target?.type ?? ''} ${e.target?.id ?? ''}`.toLowerCase().includes(q))
    );
    const dir = order === 'asc' ? 1 : -1;
    matches = matches.sort((a, b) => dir * (a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : a.eventId < b.eventId ? -1 : 1));
    let start = 0;
    if (query.cursor) {
      const c = decodeCursor<{ o: string; t: string; id: string }>(query.cursor);
      if (c.o !== order) {
        throw new ApiError('invalid_request', 'The cursor belongs to a different sort order.', { status: 400, code: 'invalid_cursor' });
      }
      start = matches.findIndex((e) => e.occurredAt === c.t && e.eventId === c.id) + 1;
    }
    const page = matches.slice(start, start + limit);
    const last = page[page.length - 1];
    return {
      events: page.map((e) => this.expose(e)),
      nextCursor: last && start + limit < matches.length ? encodeCursor({ o: order, t: last.occurredAt, id: last.eventId }) : null,
      from: r.from === undefined ? null : new Date(r.from).toISOString(),
      to: r.to === undefined ? null : new Date(r.to).toISOString(),
      order,
      limit,
    };
  }

  async getEvent(eventId: string, options?: CallOptions): Promise<AuditEventRecord> {
    await this.enter('getEvent', options);
    const event = this.events.find((e) => e.eventId === eventId);
    if (!event) throw new ApiError('not_found', "We couldn't find what you were looking for.", { status: 404, code: 'not_found' });
    return this.expose(event);
  }

  async listTraces(query: TimeRange & { limit?: number; cursor?: string }, options?: CallOptions): Promise<TracesPage> {
    await this.enter('listTraces', options);
    const r = this.range(query, DAY, 7 * DAY);
    const limit = query.limit ?? 25;
    const groups = new Map<string, AuditEventRecord[]>();
    for (const e of this.events) {
      if (!this.inRange(e, r)) continue;
      const list = groups.get(e.traceId);
      if (list) list.push(e);
      else groups.set(e.traceId, [e]);
    }
    const summaries: TraceSummary[] = [...groups.entries()].map(([traceId, list]) => {
      const sorted = [...list].sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : 1));
      const first = sorted[0]!;
      const startedAt = Date.parse(first.occurredAt);
      const endedAt = Math.max(...sorted.map((e) => Date.parse(e.occurredAt) + (e.durationMs ?? 0)));
      const risk = sorted.reduce<AuditRiskLevel | undefined>(
        (acc, e) => (e.riskLevel && (!acc || RISK_SEVERITY[e.riskLevel] > RISK_SEVERITY[acc]) ? e.riskLevel : acc),
        undefined
      );
      return {
        traceId,
        rootAction: first.action,
        rootService: first.service,
        startedAt: first.occurredAt,
        lastEventAt: sorted[sorted.length - 1]!.occurredAt,
        eventCount: sorted.length,
        outcome: sorted.reduce<AuditOutcome>((acc, e) => worst(acc, e.outcome), 'success'),
        ...(risk ? { riskLevel: risk } : {}),
        durationMs: endedAt - startedAt,
      };
    });
    summaries.sort((a, b) => (a.lastEventAt === b.lastEventAt ? (a.traceId < b.traceId ? 1 : -1) : a.lastEventAt < b.lastEventAt ? 1 : -1));
    let start = 0;
    if (query.cursor) {
      const c = decodeCursor<{ t: string; id: string }>(query.cursor);
      start = summaries.findIndex((s) => s.lastEventAt === c.t && s.traceId === c.id) + 1;
    }
    const page = summaries.slice(start, start + limit);
    const last = page[page.length - 1];
    return {
      traces: page,
      nextCursor: last && start + limit < summaries.length ? encodeCursor({ t: last.lastEventAt, id: last.traceId }) : null,
      from: r.from === undefined ? null : new Date(r.from).toISOString(),
      to: r.to === undefined ? null : new Date(r.to).toISOString(),
      limit,
    };
  }

  async getTrace(traceId: string, options?: CallOptions): Promise<TraceTree> {
    await this.enter('getTrace', options);
    const events = this.events
      .filter((e) => e.traceId === traceId)
      .sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : a.eventId < b.eventId ? -1 : 1));
    if (events.length === 0) throw new ApiError('not_found', "We couldn't find what you were looking for.", { status: 404, code: 'not_found' });
    const t0 = Date.parse(events[0]!.occurredAt);
    const bySpan = new Map(events.map((e) => [e.spanId, e]));
    const nodes = new Map<string, SpanNode>();
    for (const e of events) {
      nodes.set(e.eventId, {
        eventId: e.eventId,
        spanId: e.spanId,
        ...(e.parentSpanId ? { parentSpanId: e.parentSpanId } : {}),
        action: e.action,
        service: e.service,
        category: e.category,
        outcome: e.outcome,
        ...(e.riskLevel ? { riskLevel: e.riskLevel } : {}),
        actor: e.actor,
        ...(e.target ? { target: e.target } : {}),
        ...(e.errorCode ? { errorCode: e.errorCode } : {}),
        ...(e.goalId ? { goalId: e.goalId } : {}),
        ...(e.threadId ? { threadId: e.threadId } : {}),
        ...(e.campaignId ? { campaignId: e.campaignId } : {}),
        startedAt: e.occurredAt,
        offsetMs: Date.parse(e.occurredAt) - t0,
        durationMs: e.durationMs ?? null,
        subtreeOutcome: e.outcome,
        children: [],
      });
    }
    const roots: SpanNode[] = [];
    for (const e of events) {
      const node = nodes.get(e.eventId)!;
      const parent = e.parentSpanId ? bySpan.get(e.parentSpanId) : undefined;
      if (parent) nodes.get(parent.eventId)!.children.push(node);
      else {
        if (e.parentSpanId) node.orphan = true;
        roots.push(node);
      }
    }
    const settle = (node: SpanNode): AuditOutcome => {
      for (const child of node.children) node.subtreeOutcome = worst(node.subtreeOutcome, settle(child));
      return node.subtreeOutcome;
    };
    roots.forEach(settle);
    const endedAt = Math.max(...events.map((e) => Date.parse(e.occurredAt) + (e.durationMs ?? 0)));
    const risk = events.reduce<AuditRiskLevel | undefined>(
      (acc, e) => (e.riskLevel && (!acc || RISK_SEVERITY[e.riskLevel] > RISK_SEVERITY[acc]) ? e.riskLevel : acc),
      undefined
    );
    const uniq = (values: Array<string | undefined>) => [...new Set(values.filter((v): v is string => Boolean(v)))];
    return {
      traceId,
      startedAt: events[0]!.occurredAt,
      endedAt: new Date(endedAt).toISOString(),
      durationMs: endedAt - t0,
      eventCount: events.length,
      outcome: roots.reduce<AuditOutcome>((acc, r) => worst(acc, r.subtreeOutcome), 'success'),
      ...(risk ? { riskLevel: risk } : {}),
      truncated: false,
      roots,
      related: {
        goalIds: uniq(events.map((e) => e.goalId)),
        threadIds: uniq(events.map((e) => e.threadId)),
        campaignIds: uniq(events.map((e) => e.campaignId)),
      },
    };
  }

  async getFacets(query: TimeRange & { limit?: number } = {}, options?: CallOptions): Promise<Facets> {
    await this.enter('getFacets', options);
    const r = this.range(query, 7 * DAY, 90 * DAY);
    const limit = query.limit ?? 50;
    const inRange = this.events.filter((e) => this.inRange(e, r));
    const count = (value: (e: AuditEventRecord) => string | undefined) => {
      const counts = new Map<string, number>();
      for (const e of inRange) {
        const v = value(e);
        if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      return [...counts.entries()].map(([value, c]) => ({ value, count: c })).sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : 1));
    };
    const truncated: string[] = [];
    const cap = (name: string, values: Array<{ value: string; count: number }>) => {
      if (values.length > limit) truncated.push(name);
      return values.slice(0, limit);
    };
    return {
      facets: {
        service: cap('service', count((e) => e.service)),
        action: cap('action', count((e) => e.action)),
        category: cap('category', count((e) => e.category)),
        outcome: cap('outcome', count((e) => e.outcome)),
        riskLevel: cap('riskLevel', count((e) => e.riskLevel)),
        actorType: cap('actorType', count((e) => e.actor.type)),
        actorId: cap('actorId', count((e) => e.actor.id)),
        campaignId: cap('campaignId', count((e) => e.campaignId)),
      },
      truncated,
      from: r.from === undefined ? null : new Date(r.from).toISOString(),
      to: r.to === undefined ? null : new Date(r.to).toISOString(),
      limit,
    };
  }

  async verifyChain(query: { from: string; to: string }, options?: CallOptions): Promise<ChainVerification> {
    await this.enter('verifyChain', options);
    if ((this.options.role ?? 'admin') !== 'admin') {
      throw new ApiError('forbidden', "Your account doesn't have access to this.", { status: 403, code: 'insufficient_role' });
    }
    const from = parseTime(query.from, 'from');
    const to = parseTime(query.to, 'to');
    if (from === undefined || to === undefined) throw invalid('is required', from === undefined ? 'from' : 'to');
    if (from >= to) throw invalid('"from" must be before "to"', 'from');
    if (to - from > DAY) throw invalid('the range to verify may be at most 24 hours', 'from');
    const inRange = this.events.filter((e) => {
      const t = Date.parse(e.ingestedAt);
      return t >= from && t < to;
    });
    const tampered = inRange.find((e) => e.eventId === this.tamperedEventId);
    return {
      workspaceId: WORKSPACE_ID,
      range: { from: new Date(from).toISOString(), to: new Date(to).toISOString() },
      ok: !tampered,
      checked: inRange.length,
      firstEventId: inRange[0]?.eventId ?? null,
      lastEventId: inRange[inRange.length - 1]?.eventId ?? null,
      lastHash: inRange[inRange.length - 1]?.hash ?? null,
      problems: tampered
        ? [{ type: 'hash_mismatch', eventId: tampered.eventId, detail: 'The stored hash does not match the recomputed hash of the event.' }]
        : [],
      complete: true,
    };
  }

  private analyticsRange(from: string, to: string, granularity: Granularity): { from: number; to: number } {
    const f = parseTime(from, 'from');
    const t = parseTime(to, 'to');
    if (f === undefined || t === undefined) throw invalid('is required', f === undefined ? 'from' : 'to');
    const unit = granularity === 'hour' ? HOUR : DAY;
    if (f % unit !== 0) throw invalid(granularity === 'hour' ? 'must start on the hour' : 'must start at midnight UTC', 'from');
    if (t % unit !== 0) throw invalid(granularity === 'hour' ? 'must end on the hour' : 'must end at midnight UTC', 'to');
    if (f >= t) throw invalid('"from" must be before "to"', 'from');
    const max = granularity === 'hour' ? 14 * DAY : 366 * DAY;
    if (t - f > max) throw invalid(`the range may be at most ${max / DAY} days for ${granularity} granularity`, 'to');
    return { from: f, to: t };
  }

  private rowsIn(from: number, to: number, campaignId?: string): SeedMetricRow[] {
    return this.metrics.filter((m) => m.hour >= from && m.hour < to && (!campaignId || m.campaignId === campaignId));
  }

  private freshness() {
    const hour = Math.floor(this.now() / HOUR) * HOUR;
    return {
      asOf: new Date(hour).toISOString(),
      rollupsComputedAt: new Date(hour + 4 * 60_000).toISOString(),
      observationsFetchedAt: new Date(hour + 2 * 60_000).toISOString(),
    };
  }

  private campaignRows(rows: SeedMetricRow[]): CampaignTotals[] {
    const keys = new Map<string, SeedMetricRow[]>();
    for (const row of rows) {
      const list = keys.get(row.campaignId);
      if (list) list.push(row);
      else keys.set(row.campaignId, [row]);
    }
    return [...keys.values()]
      .map((list) => {
        const first = list[0]!;
        return { ...totalsOf(list, first.currency), platform: first.platform, accountId: first.accountId, campaignId: first.campaignId };
      })
      .sort((a, b) => b.spend - a.spend);
  }

  async getAnalyticsSummary(query: SummaryQuery, options?: CallOptions): Promise<MetricsSummary> {
    await this.enter('getAnalyticsSummary', options);
    const r = this.analyticsRange(query.from, query.to, query.granularity);
    const rows = this.rowsIn(r.from, r.to, query.campaignId);
    const bucketOf = (hour: number) =>
      query.granularity === 'hour' ? new Date(hour).toISOString() : new Date(Math.floor(hour / DAY) * DAY).toISOString().slice(0, 10);
    const buckets = new Map<string, SeedMetricRow[]>();
    for (const row of rows) {
      const key = `${bucketOf(row.hour)}|${row.currency}`;
      const list = buckets.get(key);
      if (list) list.push(row);
      else buckets.set(key, [row]);
    }
    const series = [...buckets.entries()]
      .map(([key, list]) => ({ bucket: key.split('|')[0]!, ...totalsOf(list, list[0]!.currency) }))
      .sort((a, b) => (a.bucket === b.bucket ? (a.currency < b.currency ? -1 : 1) : a.bucket < b.bucket ? -1 : 1));
    const campaigns = this.campaignRows(rows);
    return {
      workspaceId: WORKSPACE_ID,
      from: new Date(r.from).toISOString(),
      to: new Date(r.to).toISOString(),
      granularity: query.granularity,
      ...(query.campaignId ? { campaignId: query.campaignId } : {}),
      totals: totalsPerCurrency(rows),
      series,
      campaigns: campaigns.slice(0, 200),
      campaignsTruncated: false,
      freshness: rows.length ? this.freshness() : { asOf: null, rollupsComputedAt: null, observationsFetchedAt: null },
    };
  }

  async compareAnalytics(query: CompareQuery, options?: CallOptions): Promise<PeriodComparison> {
    await this.enter('compareAnalytics', options);
    const cur = this.analyticsRange(query.currentFrom, query.currentTo, query.granularity);
    const span = cur.to - cur.from;
    const prev =
      query.previousFrom && query.previousTo
        ? this.analyticsRange(query.previousFrom, query.previousTo, query.granularity)
        : { from: cur.from - span, to: cur.from };
    const curTotals = totalsPerCurrency(this.rowsIn(cur.from, cur.to, query.campaignId));
    const prevTotals = totalsPerCurrency(this.rowsIn(prev.from, prev.to, query.campaignId));
    const change = (current: number, previous: number) => ({
      current,
      previous,
      change: Math.round((current - previous) * 100) / 100,
      changePct: previous === 0 ? null : Math.round(((current - previous) / previous) * 10000) / 100,
    });
    const currencies = [...new Set([...curTotals, ...prevTotals].map((t) => t.currency))].sort();
    return {
      workspaceId: WORKSPACE_ID,
      granularity: query.granularity,
      ...(query.campaignId ? { campaignId: query.campaignId } : {}),
      current: { from: new Date(cur.from).toISOString(), to: new Date(cur.to).toISOString(), totals: curTotals },
      previous: { from: new Date(prev.from).toISOString(), to: new Date(prev.to).toISOString(), totals: prevTotals },
      comparison: currencies.map((currency) => {
        const c = curTotals.find((t) => t.currency === currency);
        const p = prevTotals.find((t) => t.currency === currency);
        return {
          currency,
          impressions: change(c?.impressions ?? 0, p?.impressions ?? 0),
          clicks: change(c?.clicks ?? 0, p?.clicks ?? 0),
          spend: change(c?.spend ?? 0, p?.spend ?? 0),
          conversions: change(c?.conversions ?? 0, p?.conversions ?? 0),
        };
      }),
      freshness: this.freshness(),
    };
  }

  async getTopCampaigns(query: CampaignsQuery, options?: CallOptions): Promise<CampaignsResponse> {
    await this.enter('getTopCampaigns', options);
    const r = this.analyticsRange(query.from, query.to, query.granularity);
    const limit = query.limit ?? 20;
    const all = this.campaignRows(this.rowsIn(r.from, r.to));
    return {
      workspaceId: WORKSPACE_ID,
      from: new Date(r.from).toISOString(),
      to: new Date(r.to).toISOString(),
      granularity: query.granularity,
      campaigns: all.slice(0, limit),
      truncated: all.length > limit,
      freshness: this.freshness(),
    };
  }
}

export { SEED_CAMPAIGNS };
