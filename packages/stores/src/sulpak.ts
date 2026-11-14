import { StoreRequestRefused } from "./technodom";

/**
 * Sulpak (sulpak.kz), the third price source (DECISIONS.md, 2026-11-14 "Sulpak as a third price source"; CLAUDE.md
 * rule 6a). Its robots.txt allows product pages (/g/) and category listings (/f/); it has no product sitemap, so the
 * items come from the listings of the categories we hold (22 items a request, with name, Sulpak's code and price).
 * Unlike Technodom, Sulpak never links to Kaspi: pairs are made by the strict title rules only. Prices are Almaty's
 * (Sulpak's default city, id 1; we send no cookie). One request at a time, ≥10 s apart, the honest User-Agent.
 */
export const SULPAK = {
  code: "sulpak",
  base: "https://www.sulpak.kz",
  /** The Almaty sitemap: every category listing (/f/<category>) with its filter pages. */
  categorySitemap: "https://www.sulpak.kz/sitemap-almaty-ru.xml",
  listingUrl: (category: string, page: number) => `https://www.sulpak.kz/f/${category}${page > 1 ? `?page=${page}` : ""}`,
  productUrl: (slug: string) => `https://www.sulpak.kz/g/${slug}`,
} as const;

export class SulpakHttpError extends Error {
  constructor(public status: number, public url: string) {
    super(`Sulpak answered ${status} for ${url}`);
    this.name = "SulpakHttpError";
  }
  get isBlocked() { return this.status === 403 || this.status === 429; }
  get isGone() { return this.status === 404 || this.status === 410; }
}
export class SulpakParseError extends Error {
  constructor(message: string) { super(message); this.name = "SulpakParseError"; }
}

const tenge = (v: string | undefined | null) => {
  if (!v) return null;
  const n = Math.round(Number(v.replace(/[\s ]/g, "").replace(",", ".")));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const attr = (chunk: string, name: string) => chunk.match(new RegExp(`${name}="([^"]*)"`))?.[1];
const unescape = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** Category listings (/f/<category>, no filters) in the Almaty sitemap. */
export function parseCategorySitemap(xml: string): string[] {
  const out = new Set<string>();
  for (const m of xml.matchAll(/<loc>https:\/\/www\.sulpak\.kz\/f\/([a-z0-9_]+)<\/loc>/g)) out.add(m[1]!);
  return [...out];
}

export interface SulpakItem {
  /** Sulpak's product code (data-code), stable across renames. */
  sku: string; slug: string; title: string;
  price: number | null; oldPrice: number | null;
  /** «Под заказ»: listed but not in stock. */
  onOrder: boolean;
}

/** One listing page: its product cards and how many pages the category has. */
export function parseListing(html: string): { items: SulpakItem[]; pages: number } {
  const pages = Number(html.match(/data-pagesCount="(\d+)"/)?.[1] ?? 1) || 1;
  const items: SulpakItem[] = [];
  const seen = new Set<string>();
  for (const card of html.split('<div class="product__item product__item-js').slice(1)) {
    const sku = attr(card, "data-code"), name = attr(card, "data-name"), slug = card.match(/href="\/g\/([^"?#]+)"/)?.[1];
    if (!sku || !name || !slug || seen.has(sku)) continue;
    seen.add(sku);
    items.push({
      sku, slug, title: unescape(name).replace(/\s+/g, " ").trim(),
      price: tenge(attr(card, "data-price")), oldPrice: tenge(card.match(/product__item-price-old[^"]*">\s*([\d\s ]+)/)?.[1]),
      onOrder: /Под заказ|Предзаказ/.test(card),
    });
  }
  return { items, pages };
}

export interface SulpakProduct { sku: string; title: string; price: number | null; oldPrice: number | null; inStock: boolean }

/** A product page: the #product-page block's code, name and price, and the schema.org offer's availability. */
export function parseSulpakProduct(html: string): SulpakProduct {
  const i = html.indexOf('id="product-page"');
  if (i < 0) throw new SulpakParseError("no product-page block");
  const block = html.slice(i, i + 2000);
  const sku = attr(block, "data-code"), name = attr(block, "data-name");
  if (!sku || !name) throw new SulpakParseError("no code or name");
  if (attr(block, "data-city-id") && attr(block, "data-city-id") !== "1") throw new SulpakParseError(`city ${attr(block, "data-city-id")}, not Almaty`);
  const availability = html.match(/"availability"\s*:\s*"https?:\/\/schema\.org\/(\w+)"/)?.[1] ?? null;
  const price = tenge(attr(block, "data-price"));
  return {
    sku, title: unescape(name).replace(/\s+/g, " ").trim(), price,
    oldPrice: tenge(html.match(/product__price-old[^"]*">\s*([\d\s ]+)/)?.[1]),
    inStock: availability === "InStock" && price !== null,
  };
}

export interface SulpakClientOptions {
  minIntervalMs?: number; jitterMs?: number; timeoutMs?: number; userAgent?: string;
  /** Called right before each request, after the pacing wait: throw StoreRequestRefused to stop it. */
  beforeRequest?: () => void | Promise<void>;
  fetch?: typeof fetch;
}

/** One request at a time, starts ≥ minIntervalMs (+ jitter) apart; non-2xx throws SulpakHttpError. */
export function createSulpakClient(o: SulpakClientOptions = {}) {
  const f = o.fetch ?? fetch;
  const ua = o.userAgent ?? process.env.KASPI_USER_AGENT ?? "BAGA price history bot (+contact: hello@baga.app)";
  const minIntervalMs = o.minIntervalMs ?? 10_000, jitterMs = o.jitterMs ?? 0, timeoutMs = o.timeoutMs ?? 30_000;
  let nextAt = 0;
  let queue: Promise<void> = Promise.resolve();
  const gate = () => {
    const turn = queue.then(async () => {
      const wait = nextAt - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      nextAt = Date.now() + minIntervalMs + Math.round(Math.random() * jitterMs);
    });
    queue = turn.catch(() => {});
    return turn;
  };
  async function get(url: string, accept: string) {
    await gate();
    await o.beforeRequest?.();
    const res = await f(url, { headers: { "User-Agent": ua, Accept: accept }, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    if (res.status < 200 || res.status >= 300) { await res.body?.cancel().catch(() => undefined); throw new SulpakHttpError(res.status, url); }
    return res.text();
  }
  return {
    fetchCategories: async () => parseCategorySitemap(await get(SULPAK.categorySitemap, "application/xml, text/xml")),
    fetchListing: async (category: string, page: number) => parseListing(await get(SULPAK.listingUrl(category, page), "text/html")),
    fetchProduct: async (slug: string) => parseSulpakProduct(await get(SULPAK.productUrl(slug), "text/html")),
  };
}
export type SulpakClient = ReturnType<typeof createSulpakClient>;
export { StoreRequestRefused };

/**
 * Sulpak category slugs for our Kaspi leaf categories: Sulpak writes them in its own transliteration («Стиральные
 * машины» → stiralniye_mashiniy). The same name first; else the Sulpak categories whose first word starts like the
 * Kaspi name's first word («Телевизоры» → led_oled_televizoriy is found by its last word). Pure, offline.
 */
const TR: Record<string, string> = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "j", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "iy", ь: "", э: "e", ю: "yu", я: "ya" };
export const sulpakTranslit = (s: string) => [...s.toLowerCase()].map((c) => TR[c] ?? c).join("").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const STOP = new Set(["i", "dlya", "k", "s", "v", "na", "po"]);
export function sulpakCategoriesFor(kaspiLeaf: string, sulpak: readonly string[]): string[] {
  const own = sulpakTranslit(kaspiLeaf);
  if (sulpak.includes(own)) return [own];
  const words = own.split("_").filter((w) => w.length >= 4 && !STOP.has(w));
  if (!words.length) return [];
  const stem = words[0]!.slice(0, Math.max(5, words[0]!.length - 3));
  return sulpak.filter((c) => !c.startsWith("aksess") && !c.startsWith("aksesu") && c.split("_").some((w) => w.startsWith(stem))).slice(0, 3);
}
