import { describe, it, expect } from 'vitest';
import { createLogger, parseLevel, redact, sinkFor, NullSink, ConsoleJsonSink, type LogEntry } from './logger';

function capture(level?: Parameters<typeof createLogger>[0] extends infer O ? (O extends { level?: infer L } ? L : never) : never) {
  const entries: LogEntry[] = [];
  const logger = createLogger({ level, sink: { write: (e) => entries.push(e) }, sessionId: 'session-1', now: () => new Date('2026-10-26T12:00:00.000Z') });
  return { entries, logger };
}

describe('logger', () => {
  it('writes structured entries with a traceId, falling back to the session id', () => {
    const { entries, logger } = capture('info');
    logger.info('api.request', { path: '/v1/events', status: 200, traceId: 'api-trace-1' });
    logger.warn('ui.notice');
    expect(entries[0]).toEqual({
      ts: '2026-10-26T12:00:00.000Z',
      level: 'info',
      service: 'proba-portal',
      event: 'api.request',
      path: '/v1/events',
      status: 200,
      traceId: 'api-trace-1',
      sessionId: 'session-1',
    });
    expect(entries[1]).toMatchObject({ event: 'ui.notice', traceId: 'session-1' });
  });

  it('respects the level', () => {
    const { entries, logger } = capture('warn');
    logger.debug('a');
    logger.info('b');
    logger.warn('c');
    logger.error('d');
    expect(entries.map((e) => e.event)).toEqual(['c', 'd']);
    const silent = capture('silent');
    silent.logger.error('x');
    expect(silent.entries).toEqual([]);
  });

  it('never writes tokens, emails, passwords or raw content', () => {
    const { entries, logger } = capture('info');
    logger.info('x', { token: 'abc', nested: { Authorization: 'Bearer abc', email: 'a@b.co', content: 'secret text', keep: 'ok' }, list: [{ password: 'p' }] });
    const line = JSON.stringify(entries[0]);
    expect(line).not.toMatch(/abc|a@b\.co|secret text|"p"/);
    expect(entries[0]).toMatchObject({ nested: { keep: 'ok' } });
  });

  it('survives a failing sink', () => {
    const logger = createLogger({ sink: { write: () => { throw new Error('boom'); } } });
    expect(() => logger.error('x')).not.toThrow();
  });

  it('is configured by name', () => {
    expect(parseLevel('DEBUG')).toBe('debug');
    expect(parseLevel('nonsense')).toBe('info');
    expect(parseLevel(undefined)).toBe('info');
    expect(sinkFor('none')).toBeInstanceOf(NullSink);
    expect(sinkFor('console')).toBeInstanceOf(ConsoleJsonSink);
    expect(redact('x'.repeat(600))).toHaveLength(501);
  });
});
