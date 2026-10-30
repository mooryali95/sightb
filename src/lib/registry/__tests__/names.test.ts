import { describe, it, expect } from 'vitest';
import { normalizeName, nameKeys, suggestParty, groupUnlinked, initialsOf, searchParties } from '../names';

const party = (id: string, name: string, aliases: string[] = []) => ({ id, name, aliases });

describe('normalizeName', () => {
  it('reads the spellings people actually type as one name', () => {
    const one = normalizeName('د أيمن أصلان');
    for (const s of ['دأيمن أصلان', 'د. أيمن اصلان', 'دكتور أيمن أصلان', 'د/ ايمن  أصلان', 'أيمـــن أصلان']) {
      expect(normalizeName(s)).toBe(one);
    }
    expect(normalizeName('عبدالله')).toBe(normalizeName('عبد الله'));
    expect(normalizeName('يحيى')).toBe(normalizeName('يحيي'));
    expect(normalizeName('مؤسسة الضيافة')).toBe(normalizeName('مؤسسه الضيافه'));
  });

  it('does not strip a letter that is part of the name', () => {
    expect(normalizeName('داود')).not.toBe(normalizeName('اود'));
    expect(normalizeName('دعاء')).toBe('دعاء');
  });
});

describe('nameKeys', () => {
  it('knows a person by the name in brackets too', () => {
    expect(nameKeys('أحمد صبري (أبو رؤى)')).toEqual(expect.arrayContaining([normalizeName('أحمد صبري'), normalizeName('أبو رؤى')]));
  });
});

describe('suggestParty', () => {
  const parties = [party('ayman', 'د أيمن أصلان'), party('ahmad', 'أحمد صبري (أبو رؤى)'), party('omar', 'عمر عبدالحميد', ['عمر'])];

  it('is sure when the whole name, a bracketed name or an alias matches', () => {
    expect(suggestParty('دأيمن أصلان', parties)).toEqual({ partyId: 'ayman', sure: true });
    expect(suggestParty('ابو رؤى', parties)).toEqual({ partyId: 'ahmad', sure: true });
    expect(suggestParty('عمر', parties)).toEqual({ partyId: 'omar', sure: true });
  });

  it('only suggests when part of the name matches one person, and stays silent when it could be two', () => {
    expect(suggestParty('أيمن', parties)).toEqual({ partyId: 'ayman', sure: false });
    const two = [...parties, party('ayman2', 'أيمن الصالح')];
    expect(suggestParty('أيمن', two)).toBeNull();
    expect(suggestParty('التذاكر والتأشيرات', parties)).toBeNull();
  });
});

describe('groupUnlinked', () => {
  it('gathers the spellings of one name with their count and total, biggest first', () => {
    const rows = [
      { text: 'د أيمن', amount: 10000 }, { text: 'دأيمن', amount: 10000 }, { text: 'د. أيمن', amount: 190 },
      { text: 'الضيافة', amount: 7000 }, { text: '', amount: 5 },
    ];
    const g = groupUnlinked(rows, []);
    expect(g.map((x) => [x.spellings.length, x.count, x.total])).toEqual([[3, 3, 20190], [1, 1, 7000]]);
    expect(g[0].name).toBe('د أيمن');
    expect(g[0].suggestion).toBeNull();
  });

  it('proposes folding a short name into the one longer name it belongs to, and nothing when two could claim it', () => {
    const g = groupUnlinked([{ text: 'أيمن', amount: 1 }, { text: 'د أيمن أصلان', amount: 2 }, { text: 'عمر', amount: 3 }], []);
    expect(g.find((x) => x.name === 'أيمن')?.mergeInto).toBe('د أيمن أصلان');
    expect(g.find((x) => x.name === 'عمر')?.mergeInto).toBeNull();
    const two = groupUnlinked([{ text: 'أيمن', amount: 1 }, { text: 'أيمن أصلان', amount: 2 }, { text: 'أيمن الصالح', amount: 3 }], []);
    expect(two.find((x) => x.name === 'أيمن')?.mergeInto).toBeNull();
  });
});

describe('initialsOf', () => {
  it('shows the person, not their title', () => {
    expect(initialsOf('د أيمن أصلان')).toBe('أأ');
    expect(initialsOf('أحمد صبري (أبو رؤى)')).toBe('أص');
    expect(initialsOf('مؤسسة')).toBe('م');
    expect(initialsOf('')).toBe('؟');
  });
});

describe('searchParties', () => {
  const ps = [party('ayman', 'د أيمن أصلان', ['دأيمن']), party('abd', 'عبدالله أصلان'), party('omar', 'عمر عبدالحميد'),
    { ...party('old', 'أيمن القديم'), archived: true }];
  it('puts the exact match first, however it was typed', () => {
    expect(searchParties('دأيمن', ps).map((p) => p.id)[0]).toBe('ayman');
    expect(searchParties('أصلان', ps).map((p) => p.id)).toEqual(['ayman', 'abd']);
  });
  it('finds by any word, leaves archived entries out, and lists everyone when nothing is typed', () => {
    expect(searchParties('عبد الحميد', ps).map((p) => p.id)).toEqual(['omar']);
    expect(searchParties('أيمن', ps).map((p) => p.id)).toEqual(['ayman']);
    expect(searchParties('', ps)).toHaveLength(3);
    expect(searchParties('زيد', ps)).toEqual([]);
  });
});
