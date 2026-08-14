import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logger } from '../logger';
import { installRemoteLogging, uninstallRemoteLogging, flushRemoteLogging } from '../observability';

const ENDPOINT = 'https://collector.test/logs';

/** Reads the JSON body out of whichever transport was used. */
function bodiesFrom(fetchMock: ReturnType<typeof vi.fn>): Array<Record<string, unknown>> {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));
}

describe('remote log shipping', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 202 })));
    vi.stubGlobal('fetch', fetchMock);
    // Force the fetch path: sendBeacon is the preferred transport in a real
    // browser, but asserting on a Blob body is far less legible than on JSON.
    vi.stubGlobal('navigator', { ...globalThis.navigator, sendBeacon: undefined });
    logger.clear();
  });

  afterEach(() => {
    uninstallRemoteLogging();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('installs nothing when no endpoint is configured', () => {
    expect(installRemoteLogging(undefined)).toBe(false);
    expect(installRemoteLogging('')).toBe(false);

    logger.error('scope', 'boom');
    vi.advanceTimersByTime(60_000);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ships warn and error after the batch window, and drops info', () => {
    expect(installRemoteLogging(ENDPOINT)).toBe(true);

    logger.info('scope', 'noise');
    logger.warn('scope', 'careful');
    logger.error('scope', 'boom');

    // Nothing leaves before the window closes — the batch is the point.
    expect(fetchMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [payload] = bodiesFrom(fetchMock);
    const events = payload.events as Array<{ level: string; message: string }>;
    expect(events.map((e) => e.level)).toEqual(['warn', 'error']);
    expect(events.map((e) => e.message)).toEqual(['careful', 'boom']);
  });

  it('ships immediately once the batch is full rather than waiting', () => {
    installRemoteLogging(ENDPOINT);

    for (let i = 0; i < 20; i++) logger.error('scope', `err-${i}`);

    // No timer has fired yet; the size threshold alone triggered the send.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const events = bodiesFrom(fetchMock)[0].events as unknown[];
    expect(events).toHaveLength(20);
  });

  it('never lets a failing collector surface as an app error', () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error('collector down')));
    installRemoteLogging(ENDPOINT);

    expect(() => {
      logger.error('scope', 'boom');
      vi.advanceTimersByTime(5_000);
    }).not.toThrow();
  });

  it('stops shipping once uninstalled', () => {
    installRemoteLogging(ENDPOINT);
    uninstallRemoteLogging();

    logger.error('scope', 'boom');
    flushRemoteLogging();
    vi.advanceTimersByTime(60_000);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
