/**
 * Kaspi product links come in several shapes:
 *   https://kaspi.kz/shop/p/apple-iphone-18-pro-256gb-...-177318181/
 *   https://kaspi.kz/shop/p/apple-...-177318181/?c=750000000&ref=shared_link
 *   kaspi.kz/shop/p/...-177318181          (no scheme, no trailing slash)
 *   https://m.kaspi.kz/shop/p/...-177318181/
 *   https://kaspi.kz/shop/p/-177318181/    (slug stripped by some share sheets)
 * Short links (l.kaspi.kz/...) are redirects and must be resolved server-side first.
 */
export const KASPI_HOSTS = ["kaspi.kz", "www.kaspi.kz", "m.kaspi.kz"] as const;
export const KASPI_SHORT_HOSTS = ["l.kaspi.kz"] as const;

export type ParsedKaspiUrl =
  | { ok: true; productId: string; slug: string | null }
  | { ok: false; reason: "not_a_url" | "not_kaspi" | "short_link" | "not_a_product" };

/** Finds the first URL-looking substring, so pasted share text ("Смотри: https://...") works. */
export function extractUrl(input: string): string | null {
  const m = input.trim().match(/(https?:\/\/)?((?:[a-z0-9-]+\.)*kaspi\.kz)(\/[^\s]*)?/i);
  if (!m) return null;
  return `https://${m[2]}${m[3] ?? "/"}`;
}

export function parseKaspiUrl(input: string): ParsedKaspiUrl {
  const raw = extractUrl(input);
  if (!raw) {
    return /^\s*(https?:\/\/)?[^\s/]+\.[^\s/]+/.test(input) ? { ok: false, reason: "not_kaspi" } : { ok: false, reason: "not_a_url" };
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "not_a_url" };
  }
  const host = url.hostname.toLowerCase();
  if ((KASPI_SHORT_HOSTS as readonly string[]).includes(host)) return { ok: false, reason: "short_link" };
  if (!(KASPI_HOSTS as readonly string[]).includes(host)) return { ok: false, reason: "not_kaspi" };
  const m = url.pathname.match(/\/shop\/p\/([a-z0-9-]*?)-?(\d{5,12})\/?$/i);
  if (!m) return { ok: false, reason: "not_a_product" };
  return { ok: true, productId: m[2]!, slug: m[1] ? m[1] : null };
}

export function canonicalProductUrl(productId: string, slug?: string | null): string {
  return `https://kaspi.kz/shop/p/${slug ? `${slug}-` : "-"}${productId}/`;
}
