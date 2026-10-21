import { en, type Dictionary } from './en';
import { ur } from './ur';

export type Lang = 'en' | 'ur';

type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];

export type TKey = Paths<Dictionary>;
export type TFunction = (key: TKey, vars?: Record<string, string | number>) => string;

const dictionaries: Record<Lang, Dictionary> = { en, ur };

function lookup(dict: Dictionary, key: string): string | undefined {
  let node: unknown = dict;
  for (const part of key.split('.')) {
    if (node && typeof node === 'object' && part in node) node = (node as Record<string, unknown>)[part];
    else return undefined;
  }
  return typeof node === 'string' ? node : undefined;
}

export function makeT(lang: Lang): TFunction {
  const dict = dictionaries[lang];
  return (key, vars) => {
    const template = lookup(dict, key) ?? lookup(en, key) ?? key;
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (_, name: string) => (name in vars ? String(vars[name]) : `{${name}}`));
  };
}

/** For keys built at runtime, like `cat.${category.key}`. Returns null when the key does not exist. */
export function hasKey(key: string): key is TKey {
  return lookup(en, key) !== undefined;
}

const MONTHS: Record<Lang, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  ur: ['جنوری', 'فروری', 'مارچ', 'اپریل', 'مئی', 'جون', 'جولائی', 'اگست', 'ستمبر', 'اکتوبر', 'نومبر', 'دسمبر'],
};

/** "21 Oct" or "21 Oct 2025" when not in the current year. */
export function formatDate(iso: string, lang: Lang, withYear?: boolean): string {
  const [y, m, d] = iso.split('-').map(Number);
  const showYear = withYear ?? y !== new Date().getFullYear();
  return `${d} ${MONTHS[lang][m - 1]}${showYear ? ` ${y}` : ''}`;
}

export function monthName(monthIndex: number, lang: Lang): string {
  return MONTHS[lang][monthIndex];
}
