import { describe, it, expect } from 'vitest';
import { parseHash, routeHref } from './router';

describe('router', () => {
  it('parses sections, ids and filters', () => {
    const route = parseHash('#/traces/3f2b8c1e?event=abc');
    expect(route.section).toBe('traces');
    expect(route.id).toBe('3f2b8c1e');
    expect(route.query.get('event')).toBe('abc');
  });

  it('falls back to the Audit Explorer for unknown or empty addresses', () => {
    expect(parseHash('').section).toBe('explorer');
    expect(parseHash('#/settings').section).toBe('explorer');
  });

  it('survives a malformed id', () => {
    expect(parseHash('#/traces/%E0%A4%A').id).toBeUndefined();
  });

  it('builds addresses, omitting empty values', () => {
    expect(routeHref({ section: 'explorer' })).toBe('#/explorer');
    expect(routeHref({ section: 'traces', id: 'a b' })).toBe('#/traces/a%20b');
    expect(routeHref({ section: 'explorer', query: { goalId: 'g', range: undefined, q: '' } })).toBe('#/explorer?goalId=g');
  });
});
