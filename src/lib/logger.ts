/**
 * Central client-side error / event logger.
 * ---------------------------------------------------------------
 * Single funnel for: React error boundaries, data-access failures,
 * offline queue events and unhandled rejections.
 *
 * Keeps the last N events in memory (readable by the diagnostics UI)
 * and forwards them to `console` in dev. A remote sink can be plugged
 * in later via `setRemoteSink` without touching call sites.
 */

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEvent {
  id: string;
  level: LogLevel;
  scope: string;
  message: string;
  context?: Record<string, unknown>;
  at: string;
}

type Sink = (event: LogEvent) => void;

const MAX_EVENTS = 200;
const buffer: LogEvent[] = [];
let remoteSink: Sink | null = null;
const listeners = new Set<(events: LogEvent[]) => void>();

const isDev = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV);

function push(event: LogEvent) {
  buffer.unshift(event);
  if (buffer.length > MAX_EVENTS) buffer.length = MAX_EVENTS;
  listeners.forEach((l) => l([...buffer]));
  if (remoteSink) {
    try {
      remoteSink(event);
    } catch {
      /* never let the sink break the app */
    }
  }
}

function emit(level: LogLevel, scope: string, message: string, context?: Record<string, unknown>) {
  const event: LogEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    level,
    scope,
    message,
    context,
    at: new Date().toISOString(),
  };
  push(event);
  if (isDev) {
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
    fn(`[${scope}] ${message}`, context ?? '');
  }
}

export const logger = {
  info: (scope: string, message: string, context?: Record<string, unknown>) => emit('info', scope, message, context),
  warn: (scope: string, message: string, context?: Record<string, unknown>) => emit('warn', scope, message, context),
  error: (scope: string, message: string, context?: Record<string, unknown>) => emit('error', scope, message, context),
  /** Normalizes unknown throwables into a logged error and returns the message. */
  capture: (scope: string, err: unknown, context?: Record<string, unknown>) => {
    const message = err instanceof Error ? err.message : String(err);
    emit('error', scope, message, {
      ...context,
      stack: err instanceof Error ? err.stack?.split('\n').slice(0, 6).join('\n') : undefined,
    });
    return message;
  },
  events: () => [...buffer],
  subscribe: (listener: (events: LogEvent[]) => void) => {
    listeners.add(listener);
    listener([...buffer]);
    return () => listeners.delete(listener);
  },
  setRemoteSink: (sink: Sink | null) => {
    remoteSink = sink;
  },
  clear: () => {
    buffer.length = 0;
    listeners.forEach((l) => l([]));
  },
};

/** Registers global handlers once (called from main.tsx). */
export function installGlobalErrorHandlers() {
  if (typeof window === 'undefined') return;
  if (window.__rouyaLoggerInstalled) return;
  window.__rouyaLoggerInstalled = true;

  window.addEventListener('error', (e) => {
    logger.error('window.error', e.message, { source: e.filename, line: e.lineno });
  });
  window.addEventListener('unhandledrejection', (e) => {
    logger.capture('unhandledrejection', e.reason);
  });
}
