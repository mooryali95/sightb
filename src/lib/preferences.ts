/**
 * Personal display preferences kept on this device: text size and whether
 * the side menu opens folded. They change how the app looks for this person
 * only, never what anyone may see or do, so they stay out of the database.
 */
import { useSyncExternalStore } from 'react';

export type TextSize = 'normal' | 'large';

export interface Preferences {
  textSize: TextSize;
  sidebarCollapsed: boolean;
}

export const PREFERENCES_KEY = 'rouya.preferences';
export const DEFAULT_PREFERENCES: Preferences = { textSize: 'normal', sidebarCollapsed: false };

type Store = Pick<Storage, 'getItem' | 'setItem'>;
const storage = (): Store | null => (typeof window === 'undefined' ? null : window.localStorage);

/** Reads the saved preferences; anything unreadable falls back to the default. */
export function parsePreferences(raw: string | null): Preferences {
  if (!raw) return DEFAULT_PREFERENCES;
  try {
    const v = JSON.parse(raw) as Partial<Preferences>;
    return {
      textSize: v.textSize === 'large' ? 'large' : 'normal',
      sidebarCollapsed: v.sidebarCollapsed === true,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

let cache: { raw: string | null; value: Preferences } | null = null;
export function readPreferences(store: Store | null = storage()): Preferences {
  const raw = store?.getItem(PREFERENCES_KEY) ?? null;
  if (cache && cache.raw === raw) return cache.value;
  cache = { raw, value: parsePreferences(raw) };
  return cache.value;
}

const listeners = new Set<() => void>();
export function writePreferences(patch: Partial<Preferences>, store: Store | null = storage()): Preferences {
  const next = { ...readPreferences(store), ...patch };
  store?.setItem(PREFERENCES_KEY, JSON.stringify(next));
  applyTextSize(next.textSize);
  listeners.forEach((l) => l());
  return next;
}

/** The whole interface scales from the root font size. */
export function applyTextSize(size: TextSize, root: HTMLElement | null = typeof document === 'undefined' ? null : document.documentElement): void {
  if (!root) return;
  if (size === 'large') root.dataset.textSize = 'large';
  else delete root.dataset.textSize;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => { if (e.key === PREFERENCES_KEY) listener(); };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(listener); window.removeEventListener('storage', onStorage); };
}

export function usePreferences(): [Preferences, (patch: Partial<Preferences>) => void] {
  const prefs = useSyncExternalStore(subscribe, () => readPreferences(), () => DEFAULT_PREFERENCES);
  return [prefs, (patch) => { writePreferences(patch); }];
}
