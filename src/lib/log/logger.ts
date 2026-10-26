/**
 * Structured logging for the browser. Every entry is one JSON object with a timestamp, level,
 * service, event name and a traceId (the audit API's trace id when the entry is about a request to
 * it, otherwise the id of this browser session), so a support request can be matched with the
 * server's logs. Where entries go is a port: the sink is chosen by configuration (LOG_SINK).
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogLevelSetting = LogLevel | 'silent';

export interface LogEntry {
  ts: string;
  level: LogLevel;
  service: 'proba-portal';
  event: string;
  traceId: string;
  sessionId: string;
  [field: string]: unknown;
}

export interface LogSink {
  write(entry: LogEntry): void;
}

export interface Logger {
  debug(event: string, fields?: Record<string, unknown>): void;
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

const ORDER: Record<LogLevelSetting, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

/** Field names whose values are never written, at any depth. */
const SENSITIVE = /token|authorization|password|secret|api[-_]?key|cookie|credential|email|content/i;

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object') return typeof value === 'string' && value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (depth > 4) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) out[key] = SENSITIVE.test(key) ? '[redacted]' : redact(v, depth + 1);
  return out;
}

/** Writes each entry as a single JSON line to the browser console (collected by whatever ships console output). */
export class ConsoleJsonSink implements LogSink {
  write(entry: LogEntry): void {
    const line = JSON.stringify(entry);
    if (entry.level === 'error') console.error(line);
    else if (entry.level === 'warn') console.warn(line);
    else console.info(line);
  }
}

export class NullSink implements LogSink {
  write(): void {
    /* logging is switched off */
  }
}

export function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

export interface LoggerOptions {
  level?: LogLevelSetting;
  sink?: LogSink;
  sessionId?: string;
  now?: () => Date;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const threshold = ORDER[options.level ?? 'info'];
  const sink = options.sink ?? new ConsoleJsonSink();
  const sessionId = options.sessionId ?? newId();
  const now = options.now ?? (() => new Date());

  const write = (level: LogLevel, event: string, fields: Record<string, unknown> = {}) => {
    if (ORDER[level] < threshold) return;
    const safe = redact(fields) as Record<string, unknown>;
    try {
      sink.write({
        ts: now().toISOString(),
        level,
        service: 'proba-portal',
        event,
        ...safe,
        traceId: typeof fields.traceId === 'string' && fields.traceId ? fields.traceId : sessionId,
        sessionId,
      });
    } catch {
      /* logging must never break the page */
    }
  };

  return {
    debug: (event, fields) => write('debug', event, fields),
    info: (event, fields) => write('info', event, fields),
    warn: (event, fields) => write('warn', event, fields),
    error: (event, fields) => write('error', event, fields),
  };
}

const LEVELS = new Set<string>(['debug', 'info', 'warn', 'error', 'silent']);

export function parseLevel(value: string | undefined): LogLevelSetting {
  const v = (value ?? '').trim().toLowerCase();
  return LEVELS.has(v) ? (v as LogLevelSetting) : 'info';
}

/** LOG_SINK=none switches logging off; anything else (or nothing) writes JSON to the console. */
export function sinkFor(name: string | undefined): LogSink {
  return (name ?? '').trim().toLowerCase() === 'none' ? new NullSink() : new ConsoleJsonSink();
}

let current: Logger = createLogger();

/** The logger the rest of the app uses. Replaced once at start-up from configuration. */
export function getLogger(): Logger {
  return current;
}

export function setLogger(logger: Logger): void {
  current = logger;
}
