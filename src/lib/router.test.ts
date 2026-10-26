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

  it('parses the memory screens and their ids', () => {
    expect(parseHash('#/memory/7a1c0000-0000-4000-8000-000000000003')).toMatchObject({ section: 'memory', id: '7a1c0000-0000-4000-8000-000000000003' });
    expect(parseHash('#/retrievals/abc').section).toBe('retrievals');
    expect(parseHash('#/profiles').section).toBe('profiles');
    expect(parseHash('#/jobs?status=failed').query.get('status')).toBe('failed');
    expect(routeHref({ section: 'memory', query: { q: 'budget approval', category: 'semantic', status: undefined } })).toBe('#/memory?q=budget+approval&category=semantic');
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
