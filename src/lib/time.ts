import type { TimeMode } from './time-context';

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  let f = formatterCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', options);
    formatterCache.set(key, f);
  }
  return f;
}

/** "26 Oct 2026, 14:03:07 UTC" (or the viewer's zone, e.g. "GMT+1"). */
export function formatTimestamp(iso: string | null | undefined, mode: TimeMode, withSeconds = true): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const tz = mode === 'utc' ? 'UTC' : undefined;
  return formatter(`ts:${mode}:${withSeconds}`, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
    hourCycle: 'h23',
    timeZone: tz,
    timeZoneName: 'short',
  }).format(date);
}

/** Axis and bucket labels. */
export function formatBucketLabel(bucket: string, granularity: 'hour' | 'day', mode: TimeMode): string {
  if (granularity === 'day') {
    // Daily buckets are calendar dates (YYYY-MM-DD) and have no zone.
    const date = new Date(`${bucket}T00:00:00Z`);
    return formatter('day', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date);
  }
  return formatter(`hr:${mode}`, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: mode === 'utc' ? 'UTC' : undefined,
  }).format(new Date(bucket));
}

/** The wall-clock value of an instant for a `datetime-local` input ("2026-10-26T14:03"). */
export function toInputValue(iso: string | undefined, mode: TimeMode): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  if (mode === 'utc') {
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The instant (ISO, UTC) a `datetime-local` value means in the chosen mode; undefined if blank or invalid. */
export function fromInputValue(value: string, mode: TimeMode): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) return undefined;
  const date = new Date(mode === 'utc' ? `${value}${value.length === 16 ? ':00' : ''}Z` : value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function zoneLabel(mode: TimeMode): string {
  if (mode === 'utc') return 'UTC';
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZoneName: 'short' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? 'local time';
  } catch {
    return 'local time';
  }
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  if (ms < 1) return '<1 ms';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  if (minutes < 60) return `${minutes} min ${seconds} s`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
