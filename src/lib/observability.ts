/**
 * Remote log shipping.
 * ---------------------------------------------------------------
 * `logger` has always had a `setRemoteSink` hook and nothing ever called it,
 * so every error a user hit lived in a 200-event in-memory ring and died on
 * refresh (P0-04). This connects that hook to an HTTP endpoint.
 *
 * Deliberately vendor-neutral: it posts plain JSON to whatever URL
 * `VITE_LOG_ENDPOINT` names — a Sentry tunnel, a Supabase edge function, an
 * in-house collector. Choosing the vendor stays your decision, and picking one
 * later costs a URL, not a dependency or a rewrite.
 *
 * Inert unless configured. With `VITE_LOG_ENDPOINT` unset — which is every
 * environment today — `installRemoteLogging()` installs nothing at all, so
 * runtime behaviour is byte-for-byte what it was before.
 */

import { logger, type LogEvent } from './logger';

/** Only these levels are shipped. `info` is high-volume and low-signal. */
const FORWARDED_LEVELS: ReadonlySet<LogEvent['level']> = new Set(['warn', 'error']);

/** Batch window. Long enough to coalesce an error storm into one request. */
const FLUSH_AFTER_MS = 5_000;

/** Ship immediately once this many events are queued, ignoring the timer. */
const MAX_BATCH = 20;

let endpoint = '';
let queue: LogEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Fire-and-forget POST. Never throws and never rejects: a collector being
 * down must never surface as an error in the app it is meant to be watching.
 */
function ship(events: LogEvent[]): void {
  if (!endpoint || events.length === 0) return;

  const body = JSON.stringify({
    sentAt: new Date().toISOString(),
    url: typeof location === 'undefined' ? undefined : location.href,
    userAgent: typeof navigator === 'undefined' ? undefined : navigator.userAgent,
    events,
  });

  // sendBeacon survives page unload, which is exactly when the last and most
  // interesting error tends to be logged. It returns false when its queue is
  // full, so fall through to fetch rather than dropping the batch.
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      if (navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }))) return;
    }
  } catch {
    /* fall through to fetch */
  }

  try {
    void fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      /* the collector is unreachable; there is nowhere left to report that */
    });
  } catch {
    /* transport unavailable — drop the batch rather than break the app */
  }
}

function flush(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  if (queue.length === 0) return;
  const batch = queue;
  queue = [];
  ship(batch);
}

/**
 * The sink itself. Must never call back into `logger` — the logger invokes
 * this from inside its own emit path, so logging here would recurse.
 */
function sink(event: LogEvent): void {
  if (!FORWARDED_LEVELS.has(event.level)) return;
  queue.push(event);
  if (queue.length >= MAX_BATCH) {
    flush();
    return;
  }
  if (timer === null) timer = setTimeout(flush, FLUSH_AFTER_MS);
}

function flushOnHide(): void {
  if (typeof document === 'undefined' || document.visibilityState === 'hidden') flush();
}

/**
 * Wires the logger to `target`, defaulting to `VITE_LOG_ENDPOINT`.
 *
 * @returns whether shipping was installed — false means no endpoint was
 *          configured, which is the normal, silent case.
 */
export function installRemoteLogging(target: string | undefined = import.meta.env.VITE_LOG_ENDPOINT): boolean {
  if (!target) return false;

  endpoint = target;
  logger.setRemoteSink(sink);

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flush);
    window.addEventListener('visibilitychange', flushOnHide);
  }
  return true;
}

/** Detaches the sink and drops anything queued. Used by tests. */
export function uninstallRemoteLogging(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  queue = [];
  endpoint = '';
  logger.setRemoteSink(null);
  if (typeof window !== 'undefined') {
    window.removeEventListener('pagehide', flush);
    window.removeEventListener('visibilitychange', flushOnHide);
  }
}

/** Ships whatever is queued right now. Exposed for tests and manual flushes. */
export const flushRemoteLogging = flush;
