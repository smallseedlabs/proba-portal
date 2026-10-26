import { describe, it, expect } from 'vitest';
import { niceTicks } from './chart';
import { formatCurrency, formatRelativeTime, initials, parseSortableNumber } from './format';

describe('format utilities', () => {
  it.each([
    ['$1,204.50', 1204.5],
    ['4.2%', 4.2],
    ['1.5k', 1500],
    ['£-3', -3],
    [42, 42],
    ['Meta', null],
  ])('parses %s for sorting', (input, expected) => {
    expect(parseSortableNumber(input)).toBe(expected);
  });

  it('formats currencies, including symbols as codes', () => {
    expect(formatCurrency(3050, 'USD')).toBe('$3,050');
    expect(formatCurrency(12.5, '£')).toBe('£12.50');
    expect(formatCurrency(1500000, 'USD', { compact: true })).toBe('$1.5M');
  });

  it('formats relative times', () => {
    const now = new Date('2026-10-19T12:00:00Z');
    expect(formatRelativeTime('2026-10-19T11:59:50Z', now)).toBe('just now');
    expect(formatRelativeTime('2026-10-19T11:48:00Z', now)).toBe('12 minutes ago');
    expect(formatRelativeTime('2026-10-19T09:00:00Z', now)).toBe('3 hours ago');
  });

  it('builds initials', () => {
    expect(initials('Alex Morgan')).toBe('AM');
    expect(initials('alex')).toBe('AL');
  });

  it('produces nice chart ticks that cover the maximum', () => {
    expect(niceTicks(28)).toEqual([0, 10, 20, 30]);
    expect(niceTicks(3000)).toEqual([0, 1000, 2000, 3000]);
    expect(niceTicks(0)).toEqual([0, 1]);
  });
});
