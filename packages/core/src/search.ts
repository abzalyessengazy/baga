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

// Kaspi slugs transliterate Russian; colours are the common Russian words left in them.
const COLOURS: Record<string, string> = {
  chernyi: "черный", belyi: "белый", seryi: "серый", serebristyi: "серебристый", sinii: "синий", goluboi: "голубой",
  zolotistyi: "золотистый", krasnyi: "красный", zelenyi: "зеленый", rozovyi: "розовый", fioletovyi: "фиолетовый",
  bezhevyi: "бежевый", korichnevyi: "коричневый", oranzhevyi: "оранжевый", zheltyi: "желтый", mnogotsvetnyi: "многоцветный",
};

/**
 * A readable name from a slug until Kaspi's real title is collected: brands capitalised, model codes and short
 * letter groups upper-cased, colours back in Russian. "27-xiaomi-redmi-g27q-rg-chernyi" → "27 Xiaomi Redmi G27Q RG черный".
 */
export function slugName(slug: string): string {
  return slugWords(slug)
    .map((w) => COLOURS[w] ?? (/\d/.test(w) && /[a-z]/.test(w) ? w.toUpperCase() : /^[a-z]{1,2}$/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** Search words from a slug: words of ≥ 2 characters, duplicates removed, at most 8. */
export function slugTokens(slug: string): string[] {
  const out: string[] = [];
  for (const w of slugWords(slug)) if (w.length >= 2 && !out.includes(w)) out.push(w);
  return out.slice(0, 8);
}
