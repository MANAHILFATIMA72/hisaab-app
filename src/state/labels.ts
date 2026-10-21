import { hasKey, type TFunction } from '@/i18n';
import type { Category } from '@/lib/types';

/** Default categories are translated by key; user-created ones show the name they typed. */
export function categoryName(c: Pick<Category, 'key' | 'name'> | undefined | null, t: TFunction): string {
  if (!c) return t('categories.uncategorized');
  const key = c.key ? `cat.${c.key}` : '';
  // A renamed default category keeps its key but stores the new name, so prefer that.
  if (key && hasKey(key) && c.name === c.key) return t(key);
  return c.name;
}

export function categoryMap(list: Category[] | undefined): Map<string, Category> {
  return new Map((list ?? []).map((c) => [c.id, c]));
}
