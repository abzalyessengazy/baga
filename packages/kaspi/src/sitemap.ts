/**
 * Kaspi's sitemap (listed in kaspi.kz/robots.txt). Standard sitemaps.org XML: either an index of other
 * sitemaps or a list of page URLs. Only <loc> values are read.
 */
export const KASPI_SITEMAP_URL = "https://kaspi.kz/shop/sitemap.xml";

export interface Sitemap {
  kind: "index" | "urlset";
  locs: string[];
}

const decode = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

export function parseSitemap(xml: string): Sitemap {
  const kind = /<sitemapindex[\s>]/i.test(xml) ? "index" : /<urlset[\s>]/i.test(xml) ? "urlset" : null;
  if (!kind) throw new Error("not a sitemap");
  const locs = [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) => decode(m[1]!));
  return { kind, locs };
}

/** Only sitemap files on kaspi.kz/shop/ are ever fetched — never a URL from anywhere else. */
export function isKaspiSitemapUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "kaspi.kz" && u.pathname.startsWith("/shop/") && /\.xml(\.gz)?$/i.test(u.pathname);
  } catch {
    return false;
  }
}
