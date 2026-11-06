/**
 * Arabic counts by CLDR plural rules: «مشروع واحد», «مشروعان», «3 مشاريع»,
 * «11 مشروعًا», «100 مشروع», never «1 مشاريع» or «0 مشروع».
 */
type Forms = Record<Intl.LDMLPluralRule, string>;

const rules = new Intl.PluralRules('ar');

const NOUNS = {
  project: { zero: 'لا مشاريع', one: 'مشروع واحد', two: 'مشروعان', few: '{n} مشاريع', many: '{n} مشروعًا', other: '{n} مشروع' },
  portfolio: { zero: 'لا محافظ', one: 'محفظة واحدة', two: 'محفظتان', few: '{n} محافظ', many: '{n} محفظةً', other: '{n} محفظة' },
  company: { zero: 'لا شركات', one: 'شركة واحدة', two: 'شركتان', few: '{n} شركات', many: '{n} شركةً', other: '{n} شركة' },
  person: { zero: 'لا أحد', one: 'شخص واحد', two: 'شخصان', few: '{n} أشخاص', many: '{n} شخصًا', other: '{n} شخص' },
  time: { zero: 'لا مرات', one: 'مرة واحدة', two: 'مرتان', few: '{n} مرات', many: '{n} مرةً', other: '{n} مرة' },
  expense: { zero: 'لا مصروفات', one: 'مصروف واحد', two: 'مصروفان', few: '{n} مصروفات', many: '{n} مصروفًا', other: '{n} مصروف' },
  risk: { zero: 'لا مخاطر', one: 'خطر واحد', two: 'خطران', few: '{n} مخاطر', many: '{n} خطرًا', other: '{n} خطر' },
  invoice: { zero: 'لا فواتير', one: 'فاتورة واحدة', two: 'فاتورتان', few: '{n} فواتير', many: '{n} فاتورةً', other: '{n} فاتورة' },
  fund: { zero: 'لا دفعات', one: 'دفعة واحدة', two: 'دفعتان', few: '{n} دفعات', many: '{n} دفعةً', other: '{n} دفعة' },
  item: { zero: 'لا عناصر', one: 'عنصر واحد', two: 'عنصران', few: '{n} عناصر', many: '{n} عنصرًا', other: '{n} عنصر' },
} satisfies Record<string, Forms>;

export type CountNoun = keyof typeof NOUNS;

export function countAr(n: number, noun: CountNoun): string {
  return NOUNS[noun][rules.select(n)].replace('{n}', n.toLocaleString('en-US'));
}
