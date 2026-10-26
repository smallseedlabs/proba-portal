import { describe, it, expect } from 'vitest';
import { formatBucketLabel, formatDuration, formatTimestamp, fromInputValue, toInputValue } from './time';

describe('time formatting', () => {
  it('formats an instant in UTC with its zone', () => {
    expect(formatTimestamp('2026-10-26T14:03:07.000Z', 'utc')).toBe('26 Oct 2026, 14:03:07 UTC');
    expect(formatTimestamp('2026-10-26T14:03:07.000Z', 'utc', false)).toBe('26 Oct 2026, 14:03 UTC');
  });

  it('shows a dash for a missing time and returns unparseable values as they are', () => {
    expect(formatTimestamp(null, 'utc')).toBe('—');
    expect(formatTimestamp('not a date', 'utc')).toBe('not a date');
  });

  it('labels chart buckets', () => {
    expect(formatBucketLabel('2026-10-26', 'day', 'utc')).toBe('26 Oct');
    expect(formatBucketLabel('2026-10-26T09:00:00.000Z', 'hour', 'utc')).toBe('26 Oct, 09:00');
  });

  it('converts to and from datetime-local values in the chosen mode', () => {
    expect(toInputValue('2026-10-26T14:03:00.000Z', 'utc')).toBe('2026-10-26T14:03');
    expect(fromInputValue('2026-10-26T14:03', 'utc')).toBe('2026-10-26T14:03:00.000Z');
    expect(fromInputValue('', 'utc')).toBeUndefined();
    expect(fromInputValue('garbage', 'utc')).toBeUndefined();
    expect(toInputValue(undefined, 'utc')).toBe('');
  });

  it('reads local wall-clock values in the local zone', () => {
    const iso = fromInputValue('2026-10-26T14:03', 'local')!;
    expect(toInputValue(iso, 'local')).toBe('2026-10-26T14:03');
  });

  it('formats durations', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(0.2)).toBe('<1 ms');
    expect(formatDuration(18)).toBe('18 ms');
    expect(formatDuration(1260)).toBe('1.26 s');
    expect(formatDuration(24_000)).toBe('24.0 s');
    expect(formatDuration(244_000)).toBe('4 min 4 s');
    expect(formatDuration(3_900_000)).toBe('1 h 5 min');
  });
});
