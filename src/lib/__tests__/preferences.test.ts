import { describe, it, expect } from 'vitest';
import { parsePreferences, writePreferences, readPreferences, applyTextSize, DEFAULT_PREFERENCES } from '../preferences';

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
}

describe('display preferences', () => {
  it('falls back to the defaults when nothing or garbage is saved', () => {
    expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences('not json')).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences('{"textSize":"huge","sidebarCollapsed":"yes"}')).toEqual(DEFAULT_PREFERENCES);
  });

  it('keeps one setting when another changes', () => {
    const s = memory();
    writePreferences({ textSize: 'large' }, s);
    writePreferences({ sidebarCollapsed: true }, s);
    expect(readPreferences(s)).toEqual({ textSize: 'large', sidebarCollapsed: true });
  });

  it('marks the page for larger text, and clears the mark for normal', () => {
    const root = document.createElement('html');
    applyTextSize('large', root);
    expect(root.dataset.textSize).toBe('large');
    applyTextSize('normal', root);
    expect(root.dataset.textSize).toBeUndefined();
  });
});
