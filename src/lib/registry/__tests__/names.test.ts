import { describe, it, expect } from 'vitest';
import { normalizeName, nameKeys, suggestParty, groupUnlinked, initialsOf, searchParties } from '../names';

const party = (id: string, name: string, aliases: string[] = []) => ({ id, name, aliases });

describe('normalizeName', () => {
  it('reads the spellings people actually type as one name', () => {
    const one = normalizeName('د أنور أسعد');
    for (const s of ['دأنور أسعد', 'د. أنور اسعد', 'دكتور أنور أسعد', 'د/ انور  أسعد', 'أنـــور أسعد']) {
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
    expect(nameKeys('أحمد سالم (أبو ليلى)')).toEqual(expect.arrayContaining([normalizeName('أحمد سالم'), normalizeName('أبو ليلى')]));
  });
});

describe('suggestParty', () => {
  const parties = [party('anwar', 'د أنور أسعد'), party('ahmad', 'أحمد سالم (أبو ليلى)'), party('omar', 'عمر عبدالكريم', ['عمر'])];

  it('is sure when the whole name, a bracketed name or an alias matches', () => {
    expect(suggestParty('دأنور أسعد', parties)).toEqual({ partyId: 'anwar', sure: true });
    expect(suggestParty('ابو ليلى', parties)).toEqual({ partyId: 'ahmad', sure: true });
    expect(suggestParty('عمر', parties)).toEqual({ partyId: 'omar', sure: true });
  });

  it('only suggests when part of the name matches one person, and stays silent when it could be two', () => {
    expect(suggestParty('أنور', parties)).toEqual({ partyId: 'anwar', sure: false });
    const two = [...parties, party('anwar2', 'أنور الصالح')];
    expect(suggestParty('أنور', two)).toBeNull();
    expect(suggestParty('التذاكر والتأشيرات', parties)).toBeNull();
  });
});

describe('groupUnlinked', () => {
  it('gathers the spellings of one name with their count and total, biggest first', () => {
    const rows = [
      { text: 'د أنور', amount: 10000 }, { text: 'دأنور', amount: 10000 }, { text: 'د. أنور', amount: 190 },
      { text: 'الضيافة', amount: 7000 }, { text: '', amount: 5 },
    ];
    const g = groupUnlinked(rows, []);
    expect(g.map((x) => [x.spellings.length, x.count, x.total])).toEqual([[3, 3, 20190], [1, 1, 7000]]);
    expect(g[0].name).toBe('د أنور');
    expect(g[0].suggestion).toBeNull();
  });

  it('proposes folding a short name into the one longer name it belongs to, and nothing when two could claim it', () => {
    const g = groupUnlinked([{ text: 'أنور', amount: 1 }, { text: 'د أنور أسعد', amount: 2 }, { text: 'عمر', amount: 3 }], []);
    expect(g.find((x) => x.name === 'أنور')?.mergeInto).toBe('د أنور أسعد');
    expect(g.find((x) => x.name === 'عمر')?.mergeInto).toBeNull();
    const two = groupUnlinked([{ text: 'أنور', amount: 1 }, { text: 'أنور أسعد', amount: 2 }, { text: 'أنور الصالح', amount: 3 }], []);
    expect(two.find((x) => x.name === 'أنور')?.mergeInto).toBeNull();
  });
});

describe('initialsOf', () => {
  it('shows the person, not their title', () => {
    expect(initialsOf('د أنور أسعد')).toBe('أأ');
    expect(initialsOf('أحمد سالم (أبو ليلى)')).toBe('أس');
    expect(initialsOf('مؤسسة')).toBe('م');
    expect(initialsOf('')).toBe('؟');
  });
});

describe('searchParties', () => {
  const ps = [party('anwar', 'د أنور أسعد', ['دأنور']), party('abd', 'عبدالله أسعد'), party('omar', 'عمر عبدالكريم'),
    { ...party('old', 'أنور القديم'), archived: true }];
  it('puts the exact match first, however it was typed', () => {
    expect(searchParties('دأنور', ps).map((p) => p.id)[0]).toBe('anwar');
    expect(searchParties('أسعد', ps).map((p) => p.id)).toEqual(['anwar', 'abd']);
  });
  it('finds by any word, leaves archived entries out, and lists everyone when nothing is typed', () => {
    expect(searchParties('عبد الكريم', ps).map((p) => p.id)).toEqual(['omar']);
    expect(searchParties('أنور', ps).map((p) => p.id)).toEqual(['anwar']);
    expect(searchParties('', ps)).toHaveLength(3);
    expect(searchParties('زيد', ps)).toEqual([]);
  });
});
