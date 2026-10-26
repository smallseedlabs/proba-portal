import type { EventQuery } from './api/port';
import { ACTOR_TYPES, CATEGORIES, OUTCOMES, RISK_LEVELS } from './api/schemas';
import type { AuditActorType, AuditCategory, AuditOutcome, AuditRiskLevel } from './api/schemas';

export const RANGE_PRESETS = [
  { value: '1h', label: 'Last hour', ms: 3_600_000 },
  { value: '24h', label: 'Last 24 hours', ms: 86_400_000 },
  { value: '7d', label: 'Last 7 days', ms: 7 * 86_400_000 },
  { value: '30d', label: 'Last 30 days', ms: 30 * 86_400_000 },
] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number]['value'] | 'any' | 'custom';

export const MAX_EVENT_RANGE_MS = 90 * 86_400_000;
export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 50;

export interface EventFilters {
  range: RangePreset;
  /** ISO 8601 UTC; only for the custom range. */
  from?: string;
  to?: string;
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
  order: 'asc' | 'desc';
}

export const DEFAULT_FILTERS: EventFilters = { range: '24h', order: 'desc' };

const TEXT_KEYS = ['traceId', 'actor', 'service', 'action', 'goalId', 'threadId', 'campaignId', 'q'] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function oneOf<T extends string>(values: readonly T[], value: string | null): T | undefined {
  return values.find((v) => v === value);
}

export function filtersFromParams(params: URLSearchParams): EventFilters {
  const rangeValue = params.get('range');
  const range: RangePreset =
    RANGE_PRESETS.find((p) => p.value === rangeValue)?.value ??
    (rangeValue === 'any' || rangeValue === 'custom' ? rangeValue : DEFAULT_FILTERS.range);
  const filters: EventFilters = {
    range,
    order: params.get('order') === 'asc' ? 'asc' : 'desc',
    actorType: oneOf(ACTOR_TYPES, params.get('actorType')),
    category: oneOf(CATEGORIES, params.get('category')),
    outcome: oneOf(OUTCOMES, params.get('outcome')),
    riskLevel: oneOf(RISK_LEVELS, params.get('riskLevel')),
  };
  if (range === 'custom') {
    const from = params.get('from');
    const to = params.get('to');
    if (from && !Number.isNaN(Date.parse(from))) filters.from = new Date(from).toISOString();
    if (to && !Number.isNaN(Date.parse(to))) filters.to = new Date(to).toISOString();
  }
  for (const key of TEXT_KEYS) {
    const value = params.get(key)?.trim();
    if (value) filters[key] = value;
  }
  // Drop unset enum keys so equality and URLs stay tidy.
  for (const key of ['actorType', 'category', 'outcome', 'riskLevel'] as const) {
    if (!filters[key]) delete filters[key];
  }
  return filters;
}

export function filtersToParams(filters: EventFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.range !== DEFAULT_FILTERS.range) params.set('range', filters.range);
  if (filters.range === 'custom') {
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
  }
  for (const key of ['traceId', 'actor', 'actorType', 'service', 'action', 'category', 'outcome', 'riskLevel', 'goalId', 'threadId', 'campaignId', 'q'] as const) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  if (filters.order !== 'desc') params.set('order', filters.order);
  return params;
}

export function isAnchored(filters: EventFilters): boolean {
  return Boolean(filters.traceId || filters.goalId || filters.threadId);
}

/** Number of filters narrowing the results (the range and order are not counted). */
export function countActiveFilters(filters: EventFilters): number {
  return (
    TEXT_KEYS.filter((k) => filters[k]).length +
    (['actorType', 'category', 'outcome', 'riskLevel'] as const).filter((k) => filters[k]).length
  );
}

export type FilterErrors = Partial<Record<keyof EventFilters | 'range', string>>;

export function validateFilters(filters: EventFilters): FilterErrors {
  const errors: FilterErrors = {};
  for (const key of ['traceId', 'goalId', 'threadId'] as const) {
    const value = filters[key];
    if (value && !UUID.test(value)) errors[key] = 'Enter a full ID, like 3f2b8c1e-5a7d-4e90-b1c2-6d8f0a9e4b73.';
  }
  if (filters.action && !/^[a-z0-9_.-]+$/.test(filters.action)) errors.action = 'Use lowercase letters, numbers, dots, dashes and underscores.';
  if (filters.campaignId && !/^[A-Za-z0-9_.:-]+$/.test(filters.campaignId)) errors.campaignId = 'Use letters, numbers and . _ : - only.';
  if (filters.q && (filters.q.length < 2 || filters.q.length > 100)) errors.q = 'Enter between 2 and 100 characters.';
  if (filters.range === 'any' && !isAnchored(filters)) {
    errors.range = 'Any time needs a trace, goal or thread ID. Choose a time range instead.';
  }
  if (filters.range === 'custom') {
    if (!filters.from || !filters.to) errors.range = 'Choose both a start and an end.';
    else if (Date.parse(filters.from) >= Date.parse(filters.to)) errors.range = 'The start must be before the end.';
    else if (Date.parse(filters.to) - Date.parse(filters.from) > MAX_EVENT_RANGE_MS) errors.range = 'The range can be at most 90 days.';
  }
  return errors;
}

export function buildEventQuery(filters: EventFilters, now: number, limit: number, cursor?: string): EventQuery {
  const query: EventQuery = { order: filters.order, limit };
  if (filters.range === 'custom') {
    query.from = filters.from;
    query.to = filters.to;
  } else if (filters.range !== 'any') {
    const preset = RANGE_PRESETS.find((p) => p.value === filters.range) ?? RANGE_PRESETS[1];
    query.from = new Date(now - preset.ms).toISOString();
  }
  for (const key of ['traceId', 'actor', 'actorType', 'service', 'action', 'category', 'outcome', 'riskLevel', 'goalId', 'threadId', 'campaignId', 'q'] as const) {
    const value = filters[key];
    if (value) (query as Record<string, unknown>)[key] = value;
  }
  if (cursor) query.cursor = cursor;
  return query;
}

export function rangeLabel(filters: EventFilters): string {
  if (filters.range === 'any') return 'Any time';
  if (filters.range === 'custom') return 'Custom range';
  return RANGE_PRESETS.find((p) => p.value === filters.range)?.label ?? 'Last 24 hours';
}
