import { logger, type LogEvent } from '@/lib/logger';
import { reportClientError, type ClientErrorReport } from '@/services/errorReportService';

/**
 * Forwards the errors the logger sees to the server's log, so a crash on
 * someone's phone reaches the owner instead of dying with the tab.
 *
 * Only errors, never info or warnings. Each distinct error is sent once per
 * page load (the server counts later repeats by the same person), at most
 * 20 per load, and nothing is sent while signed out. Messages are trimmed and
 * long digit runs masked, so an amount or an IBAN in an error text does not
 * travel with it.
 */
const MAX_PER_LOAD = 20;

export function fingerprintOf(scope: string, message: string): string {
  // Ids and numbers vary between occurrences of one bug; leave them out.
  const shape = `${scope}|${message.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '#').replace(/\d+/g, '#')}`;
  let h = 5381;
  for (let i = 0; i < shape.length; i += 1) h = ((h << 5) + h + shape.charCodeAt(i)) | 0;
  return `${scope.slice(0, 40)}:${(h >>> 0).toString(36)}`;
}

export const maskDigits = (text: string) => text.replace(/\d{6,}/g, (m) => `${m.slice(0, 2)}…${m.slice(-2)}`);

export function toReport(event: LogEvent, path: string, release: string, userAgent: string): ClientErrorReport {
  const ctx = event.context ?? {};
  const keep: Record<string, unknown> = {};
  for (const k of ['stack', 'componentStack', 'source', 'line', 'label', 'code']) {
    if (ctx[k] != null) keep[k] = typeof ctx[k] === 'string' ? maskDigits(String(ctx[k])).slice(0, 1200) : ctx[k];
  }
  return {
    fingerprint: fingerprintOf(event.scope, event.message),
    scope: event.scope.slice(0, 80),
    message: maskDigits(event.message).slice(0, 1000),
    context: keep,
    path: path.slice(0, 300),
    release: release.slice(0, 40),
    userAgent: userAgent.slice(0, 300),
  };
}

export function createErrorSink(opts: {
  isSignedIn: () => boolean;
  send?: (r: ClientErrorReport) => Promise<boolean>;
  path?: () => string;
  release?: string;
  userAgent?: string;
}) {
  const seen = new Set<string>();
  const send = opts.send ?? reportClientError;
  return (event: LogEvent) => {
    if (event.level !== 'error' || !opts.isSignedIn()) return;
    const report = toReport(event, opts.path?.() ?? '', opts.release ?? '', opts.userAgent ?? '');
    if (seen.has(report.fingerprint) || seen.size >= MAX_PER_LOAD) return;
    seen.add(report.fingerprint);
    void send(report);
  };
}

/**
 * Wires the logger to the server's log. Signed out, the server refuses the
 * call (it is granted to signed-in users only) and the refusal is swallowed.
 */
export function installErrorReporting(isSignedIn: () => boolean = () => true) {
  return logger.addSink(createErrorSink({
    isSignedIn,
    path: () => window.location.pathname,
    release: typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev',
    userAgent: navigator.userAgent,
  }));
}
