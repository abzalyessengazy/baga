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

/**
 * Only Kaspi's own sitemap files are ever fetched: the index on kaspi.kz/shop/ and the files it lists, which Kaspi
 * hosts in one dated folder on its CDN (seen 2 Nov 2026: resources.cdn-kaspi.kz/img/cnt/s/m/20261102070000/
 * Product-ru-KZT-<uuid>.xml). Never a URL from anywhere else.
 */
export function isKaspiSitemapUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.search || !/\.xml(\.gz)?$/i.test(u.pathname)) return false;
    if (u.hostname === "kaspi.kz") return u.pathname.startsWith("/shop/");
    if (u.hostname === "resources.cdn-kaspi.kz") return /^\/img\/cnt\/s\/m\/\d{8,14}\/[A-Za-z0-9-]+\.xml(\.gz)?$/.test(u.pathname);
    return false;
  } catch {
    return false;
  }
}
