/**
 * One person, many spellings. Expenses name who was paid in free text, so
 * «د أيمن», «دأيمن» and «د. أيمن أصلان» are three people to a computer and
 * one to everyone else. These rules read them as one, for matching only:
 * the registry keeps each name as the owner wrote it.
 */

const TITLES = /^(?:دكتور|الدكتور|د\s*[./]\s*|د\s+|م\s*[./]\s*|أ\s*[./]\s*|ا\s*[./]\s*)/;
// «دأيمن», «دعمر»: a title stuck to a name the registry knows begins with a
// letter other than «د». Only stripped when what follows is a common first
// letter of a name and the word is long enough not to be a name itself.
const STUCK_TITLE = /^د(?=[اأإآعمحيسخصطفكلنهو])(?=\S{4,})/;

export function normalizeName(raw: string): string {
  let s = (raw ?? '').normalize('NFKC').trim();
  s = s.replace(/[ً-ٰٟـ]/g, ''); // diacritics and tatweel
  s = s.replace(TITLES, '');
  s = s.replace(STUCK_TITLE, '');
  s = s.replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي');
  s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  s = s.replace(/(^|\s)عبد\s+/g, '$1عبد'); // عبد الله = عبدالله (\b does not see Arabic letters)
  return s.replace(/\s+/g, ' ').trim();
}

/** The two letters shown in a person's circle: the first letters of their first two words, title left out. */
export function initialsOf(raw: string): string {
  const words = (raw ?? '').replace(/\([^)]*\)/g, ' ').trim().replace(TITLES, '').replace(STUCK_TITLE, '').split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w.charAt(0)).join('') || '؟';
}

/** Every name a person goes by: the whole name, and any name in brackets. */
export function nameKeys(raw: string): string[] {
  const keys = new Set<string>();
  const whole = normalizeName(raw.replace(/\(([^)]*)\)/g, ' '));
  if (whole) keys.add(whole);
  for (const m of raw.matchAll(/\(([^)]*)\)/g)) {
    const k = normalizeName(m[1]);
    if (k) keys.add(k);
  }
  const all = normalizeName(raw);
  if (all) keys.add(all);
  return [...keys];
}

export interface NamedParty { id: string; name: string; aliases?: string[] }

/**
 * Who a written name most likely is. Sure when the name, a bracketed name or
 * an alias matches whole; a suggestion when it is one word of exactly one
 * person's name; nothing when it could be two people or none.
 */
export function suggestParty(text: string, parties: NamedParty[]): { partyId: string; sure: boolean } | null {
  const key = normalizeName(text);
  if (!key) return null;
  const keysOf = (p: NamedParty) => [p.name, ...(p.aliases ?? [])].flatMap(nameKeys);
  const sure = parties.filter((p) => keysOf(p).includes(key));
  if (sure.length === 1) return { partyId: sure[0].id, sure: true };
  if (sure.length > 1) return null;
  const words = key.split(' ');
  const partial = parties.filter((p) => keysOf(p).some((k) => {
    const pw = k.split(' ');
    return words.every((w) => pw.includes(w));
  }));
  return partial.length === 1 ? { partyId: partial[0].id, sure: false } : null;
}

export interface UnlinkedGroup {
  /** The spelling used most, to propose as the name. */
  name: string;
  spellings: string[];
  count: number;
  total: number;
  suggestion: { partyId: string; sure: boolean } | null;
  /** Another group whose name contains every word of this one, when exactly one does: «أيمن» → «أيمن أصلان». */
  mergeInto: string | null;
}

/** Names written on expenses but not linked to the registry, one group per person. */
export function groupUnlinked(rows: { text: string | null | undefined; amount: number }[], parties: NamedParty[]): UnlinkedGroup[] {
  const groups = new Map<string, { spellings: Map<string, number>; count: number; total: number }>();
  for (const r of rows) {
    const text = (r.text ?? '').trim();
    const key = normalizeName(text);
    if (!key) continue;
    const g = groups.get(key) ?? { spellings: new Map(), count: 0, total: 0 };
    g.spellings.set(text, (g.spellings.get(text) ?? 0) + 1);
    g.count += 1;
    g.total += r.amount;
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => {
      const spellings = [...g.spellings.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
      return { name: spellings[0], spellings, count: g.count, total: Math.round(g.total * 100) / 100, suggestion: suggestParty(spellings[0], parties), mergeInto: null as string | null };
    })
    .sort((a, b) => b.total - a.total)
    .map((g, _, all) => {
      const words = normalizeName(g.name).split(' ');
      const wider = all.filter((o) => o !== g && words.length < normalizeName(o.name).split(' ').length
        && words.every((w) => normalizeName(o.name).split(' ').includes(w)));
      return wider.length === 1 ? { ...g, mergeInto: wider[0].name } : g;
    });
}

/**
 * Registry entries for what is being typed, best first: a whole match on a
 * name or alias, then a name that starts with it, then one that contains it
 * anywhere, then one containing every word typed. Archived entries are left out.
 */
export function searchParties<T extends NamedParty & { archived?: boolean }>(query: string, parties: T[], limit = 8): T[] {
  const q = normalizeName(query);
  const live = parties.filter((p) => !p.archived);
  if (!q) return live.slice(0, limit);
  const words = q.split(' ');
  const rank = (p: T) => {
    const keys = [p.name, ...(p.aliases ?? [])].flatMap(nameKeys);
    if (keys.includes(q)) return 0;
    if (keys.some((k) => k.startsWith(q))) return 1;
    if (keys.some((k) => k.includes(q))) return 2;
    if (keys.some((k) => words.every((w) => k.includes(w)))) return 3;
    return -1;
  };
  return live.map((p) => ({ p, r: rank(p) })).filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.p.name.localeCompare(b.p.name, 'ar')).slice(0, limit).map((x) => x.p);
}
