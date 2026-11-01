/** Search helpers for BAGA's own catalog (never Kaspi). Pure functions. */

const MAX_TOKENS = 6;

/** Splits typed text into lowercase search words (letters/digits, ≥ 2 chars, at most 6). */
export function searchTokens(q: string): string[] {
  const words = q.toLowerCase().normalize("NFC").match(/[\p{L}\p{N}]+/gu) ?? [];
  const out: string[] = [];
  for (const w of words) if (w.length >= 2 && !out.includes(w)) out.push(w);
  return out.slice(0, MAX_TOKENS);
}

/** Kaspi product slugs are lowercase Latin words joined by hyphens (e.g. "apple-iphone-18-pro-256gb"). */
export function isValidSlug(slug: string | null | undefined): slug is string {
  return typeof slug === "string" && slug.length > 0 && slug.length <= 200 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}

/**
 * The words of a product slug, as typed by Kaspi, for showing "from your link" and for finding similar tracked
 * products. Not a product title: it is shown labelled as coming from the visitor's link.
 */
export function slugWords(slug: string): string[] {
  return isValidSlug(slug) ? slug.split("-") : [];
}

/** Search words from a slug: words of ≥ 2 characters, duplicates removed, at most 8. */
export function slugTokens(slug: string): string[] {
  const out: string[] = [];
  for (const w of slugWords(slug)) if (w.length >= 2 && !out.includes(w)) out.push(w);
  return out.slice(0, 8);
}
