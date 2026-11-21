import { useCallback, useEffect, useState } from 'react';
import { getOrgSettings, saveOrgSettings } from '@/services/orgSettingsService';
import { ORG_SETTINGS_DEFAULTS, type OrgSettings, type OrgSettingsInput } from '@/lib/org-settings';

/*
 * One shared copy for every screen in the tab, without needing a query
 * provider (pages are also rendered alone in tests). Until the server
 * answers, or if it cannot, the app's historic defaults apply.
 */
let current: OrgSettings | null = null;
let inflight: Promise<OrgSettings | null> | null = null;
const listeners = new Set<(s: OrgSettings) => void>();

function publish(s: OrgSettings) {
  current = s;
  listeners.forEach((l) => l(s));
}

/** Resolves null when the server could not answer: callers keep their defaults and nothing is saved over unknown values. */
function load(): Promise<OrgSettings | null> {
  if (!inflight) {
    inflight = getOrgSettings()
      .then((s) => { publish(s); return s; })
      .catch(() => { inflight = null; return current; });
  }
  return inflight;
}

/** Test hook: forget the shared copy. */
export function resetOrgSettingsCache() {
  current = null;
  inflight = null;
}

export function useOrgSettings() {
  const [settings, setSettings] = useState<OrgSettings>(current ?? ORG_SETTINGS_DEFAULTS);
  const [loaded, setLoaded] = useState(current !== null);

  useEffect(() => {
    let alive = true;
    const onChange = (s: OrgSettings) => { if (alive) { setSettings(s); setLoaded(true); } };
    listeners.add(onChange);
    load().then((s) => { if (s && alive) { setSettings(s); setLoaded(true); } });
    return () => { alive = false; listeners.delete(onChange); };
  }, []);

  const save = useCallback(async (v: OrgSettingsInput) => {
    const saved = await saveOrgSettings(v);
    publish(saved);
    return saved;
  }, []);

  return { settings, loaded, save };
}
