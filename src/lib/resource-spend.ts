/**
 * Spend per resource, for the "ملخص الصرف حسب المورد" card.
 *
 * The card used to count only expenses carrying a `resourceId`. Most expenses
 * are recorded with the person's name in "المسؤول" or "المورد/الجهة" instead,
 * so they never reached a card: a project spending 195,544 showed four cards
 * summing 111,962, and a new expense typed with a name did not move anything.
 *
 * Attribution, in order:
 *   1. the expense's `resourceId`;
 *   2. otherwise a resource whose name matches the expense's vendor field
 *      (المورد / الجهة), compared after Arabic normalisation (hamza forms, ta
 *      marbuta, alef maqsura, diacritics, tatweel, spacing);
 *   3. otherwise a resource whose name appears as whole words in the
 *      description ("دفعة لعمر عن التصميم" → عمر), full name or a first name
 *      no other resource shares; when two resources are named, neither;
 *   4. otherwise the "غير مرتبط بمورد" bucket.
 *
 * Never by المسؤول. The responsible person is whoever recorded or handled
 * the expense — a different person from the resource being paid, as the
 * owner put it — so matching on it would credit one person's spend to
 * another.
 *
 * Every counted expense lands in exactly one bucket, so the buckets always
 * sum to the total shown above them.
 */
import type { Expense, Resource } from '@/types/project';

export const UNLINKED_KEY = '__unlinked__';
export const UNLINKED_LABEL = 'غير مرتبط بمورد';

export function normalizeArabicName(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFKC')
    .replace(/[ً-ٰٟـ]/g, '') // diacritics, superscript alef, tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
}

export interface ResourceSpend {
  key: string;
  name: string;
  role?: string;
  total: number;
  count: number;
  /** How many of those were matched by name rather than linked. */
  matchedByName: number;
}

export interface ResourceIndex {
  byId: Map<string, Resource>;
  byName: Map<string, Resource>;
  /** Names searched for in descriptions: full names, and first names only one resource has. */
  aliases: Map<string, Resource>;
}

export function indexResources(resources: Resource[]): ResourceIndex {
  const byId = new Map(resources.map((r) => [r.id, r]));
  const byName = new Map<string, Resource>();
  for (const r of resources) {
    const n = normalizeArabicName(r.name);
    if (n && !byName.has(n)) byName.set(n, r);
  }
  const aliases = new Map(byName);
  const firsts = new Map<string, Resource | null>();
  for (const [n, r] of byName) {
    const first = n.split(' ')[0];
    if (first.length < 3 || first === n) continue;
    firsts.set(first, firsts.has(first) && firsts.get(first)?.id !== r.id ? null : r);
  }
  for (const [first, r] of firsts) if (r && !aliases.has(first)) aliases.set(first, r);
  return { byId, byName, aliases };
}

/** The resource an expense belongs to, and whether that was decided by name. */
export function attributeExpense(e: Expense, idx: ResourceIndex): { resource?: Resource; byName: boolean } {
  const linked = e.resourceId ? idx.byId.get(e.resourceId) : undefined;
  if (linked) return { resource: linked, byName: false };
  const named = idx.byName.get(normalizeArabicName(e.vendor)) ?? inDescription(e.description, idx);
  return named ? { resource: named, byName: true } : { byName: false };
}

/**
 * A resource named in the description, on whole words: its full name, or its
 * first name when no other resource shares it ("دفعة لعمر" → عمر عبدالكريم).
 * Two different resources named in one description credit neither rather
 * than guess.
 */
function inDescription(description: string | null | undefined, idx: ResourceIndex): Resource | undefined {
  const words = normalizeArabicName(description).split(' ').filter(Boolean)
    // A name written with a leading ل/ب/و ("لعمر", "وأنور") counts too.
    .flatMap((w) => (w.length > 3 && 'لبو'.includes(w[0]) ? [w, w.slice(1)] : [w]));
  if (words.length === 0) return undefined;
  const text = ` ${words.join(' ')} `;
  const found = new Map<string, Resource>();
  for (const [alias, r] of idx.aliases) if (text.includes(` ${alias} `)) found.set(r.id, r);
  return found.size === 1 ? [...found.values()][0] : undefined;
}
export function resourceKeyOf(e: Expense, idx: ResourceIndex): string {
  return attributeExpense(e, idx).resource?.id ?? UNLINKED_KEY;
}

export function summarizeSpendByResource(expenses: Expense[], resources: Resource[] | ResourceIndex): ResourceSpend[] {
  const idx = Array.isArray(resources) ? indexResources(resources) : resources;
  const buckets = new Map<string, ResourceSpend>();
  for (const e of expenses) {
    const { resource, byName } = attributeExpense(e, idx);
    const key = resource?.id ?? UNLINKED_KEY;
    const b = buckets.get(key) ?? {
      key, name: resource?.name ?? UNLINKED_LABEL, role: resource?.role, total: 0, count: 0, matchedByName: 0,
    };
    b.total += e.amount;
    b.count += 1;
    if (byName) b.matchedByName += 1;
    buckets.set(key, b);
  }
  return [...buckets.values()].sort((a, b) => {
    if (a.key === UNLINKED_KEY) return 1;
    if (b.key === UNLINKED_KEY) return -1;
    return b.total - a.total;
  });
}

/** Search across the resource's name and role, Arabic-normalised. */
export function matchesResourceQuery(s: ResourceSpend, query: string): boolean {
  const q = normalizeArabicName(query);
  if (!q) return true;
  return normalizeArabicName(`${s.name} ${s.role ?? ''}`).includes(q);
}
