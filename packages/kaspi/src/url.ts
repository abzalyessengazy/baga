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

/**
 * The code of an l.kaspi.kz short link ("https://l.kaspi.kz/shop/D5zGA9hPyp8zi3w?sessionId=…" → path
 * "/shop/D5zGA9hPyp8zi3w", code "D5zGA9hPyp8zi3w"). Query and fragment are dropped. We only ever request
 * https://l.kaspi.kz + this validated path, never the pasted text.
 */
export function shortLinkCode(input: string): { code: string; path: string } | null {
  const m = input.match(/https?:\/\/l\.kaspi\.kz(\/[^\s?#]*)/i);
  const path = m?.[1]?.replace(/\/+$/, "");
  const ok = path?.match(/^\/(?:shop\/)?([A-Za-z0-9_-]{4,64})$/);
  return ok ? { code: ok[1]!, path: path! } : null;
}

export const shortLinkUrl = (path: string) => `https://l.kaspi.kz${path}`;

/**
 * A link to a product with variants (clothes, shoes: size and colour) ends in a group code, not a product id:
 * ".../polubotinki-...-46-15956323b/". Kaspi redirects it to the product: ".../polubotinki-...-46-134007098/"
 * (seen 3 Nov 2026). The code is queued like a short link and the collector resolves it with one non-following
 * GET of https://kaspi.kz/shop/p/-<code>/, a URL we build ourselves.
 */
export function variantLinkCode(input: string): { code: string; path: string } | null {
  const raw = extractUrl(input);
  if (!raw) return null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (!(KASPI_HOSTS as readonly string[]).includes(url.hostname.toLowerCase())) return null;
  const m = url.pathname.match(/\/shop\/p\/[a-z0-9-]*?-?(\d{5,12}[a-z]{1,3})\/?$/i);
  return m ? { code: m[1]!.toLowerCase(), path: `/shop/p/-${m[1]!.toLowerCase()}/` } : null;
}

/** The URL the collector requests for a queued link: an l.kaspi.kz short link, or a variant link on kaspi.kz. */
export const queuedLinkUrl = (path: string) => (path.startsWith("/shop/p/") ? `https://kaspi.kz${path}` : shortLinkUrl(path));
