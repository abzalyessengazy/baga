/**
 * A product name for tight lists: drops Kaspi's leading category word ("Смартфон", "Планшет") when a Latin brand
 * follows it, so the line starts with the brand. Brand and model stay exactly as Kaspi writes them.
 */
export function shortTitle(title: string): string {
  const t = title.trim();
  const m = t.match(/^[А-ЯЁӘІҢҒҮҰҚӨҺа-яёәіңғүұқөһ-]+\s+(?=[A-Za-z0-9])/);
  return m && t.length > m[0].length ? t.slice(m[0].length) : t;
}
