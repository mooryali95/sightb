import { describe, it, expect, vi } from 'vitest';
vi.mock('@/services/errorReportService', () => ({ reportClientError: vi.fn(async () => true) }));
import { createErrorSink, fingerprintOf, maskDigits, toReport } from '../error-reporting';
import { logger, type LogEvent } from '../logger';

const ev = (over: Partial<LogEvent> = {}): LogEvent => ({ id: '1', level: 'error', scope: 'ErrorBoundary', message: 'boom', at: '2026-11-06T00:00:00Z', ...over });

describe('error reporting', () => {
  it('sends errors only, each distinct one once per load', () => {
    const send = vi.fn(async () => true);
    const sink = createErrorSink({ isSignedIn: () => true, send });
    sink(ev({ level: 'info' }));
    sink(ev({ level: 'warn' }));
    sink(ev());
    sink(ev({ id: '2' }));
    sink(ev({ message: 'another' }));
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('counts one bug once whatever id or number it names', () => {
    expect(fingerprintOf('db', 'row 123 failed for 0b8f2c1e-1111-4222-8333-444455556666'))
      .toBe(fingerprintOf('db', 'row 98 failed for 7a8f2c1e-1111-4222-8333-999955556666'));
    expect(fingerprintOf('db', 'row 1 failed')).not.toBe(fingerprintOf('db', 'column 1 failed'));
  });

  it('sends nothing while signed out, and at most twenty per load', () => {
    const send = vi.fn(async () => true);
    createErrorSink({ isSignedIn: () => false, send })(ev());
    expect(send).not.toHaveBeenCalled();
    const sink = createErrorSink({ isSignedIn: () => true, send });
    for (let i = 0; i < 30; i += 1) sink(ev({ message: `e ${'x'.repeat(i)}` }));
    expect(send).toHaveBeenCalledTimes(20);
  });

  it('masks long digit runs and keeps only the known context fields', () => {
    expect(maskDigits('IBAN SA0380000000608010167519 amount 1500')).toBe('IBAN SA03…19 amount 1500');
    const r = toReport(ev({ message: 'paid 123456789', context: { stack: 'at x (a.js:1)', token: 'secret' } }), '/p', 'b1', 'ua');
    expect(r.message).toBe('paid 12…89');
    expect(r.context).toEqual({ stack: 'at x (a.js:1)' });
    expect(r).toMatchObject({ path: '/p', release: 'b1', userAgent: 'ua', scope: 'ErrorBoundary' });
  });

  it('runs beside the optional collector instead of replacing it', () => {
    const collector = vi.fn();
    const extra = vi.fn();
    logger.setRemoteSink(collector);
    const remove = logger.addSink(extra);
    logger.error('t', 'both');
    expect(collector).toHaveBeenCalledTimes(1);
    expect(extra).toHaveBeenCalledTimes(1);
    remove();
    logger.setRemoteSink(null);
    logger.error('t', 'after');
    expect(extra).toHaveBeenCalledTimes(1);
  });
});
