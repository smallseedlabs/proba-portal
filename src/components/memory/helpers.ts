import { routeHref } from '../../lib/router';
import type { ApiError } from '../../lib/api/errors';

/** A score or feature value with the precision people compare it at. */
export function formatScore(value: number | null | undefined, digits = 3): string {
  return value === null || value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(digits);
}

export function memoryHref(id: string): string {
  return routeHref({ section: 'memory', id });
}

export function retrievalHref(id: string): string {
  return routeHref({ section: 'retrievals', id });
}

export const linkClass = 'rounded-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** True when the memory service answered "no such thing" to a list: a part of the service this deployment does not provide. */
export function isNotProvided(error: ApiError | undefined): boolean {
  return error?.kind === 'not_found';
}
