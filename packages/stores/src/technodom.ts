/**
 * Technodom (technodom.kz), the second price source (DECISIONS.md, 2026-11-07; CLAUDE.md rule 6a). Only what its
 * robots.txt allows: the product sitemap and product pages /p/. One request at a time, ≥10 s apart, an honest
 * User-Agent, no cookies, no logins. A product page carries its data as JSON (__NEXT_DATA__): price, old price,
 * stock and, when Technodom also sells the item on Kaspi, a link to that Kaspi product (exact matching).
 */
export const TECHNODOM = {
  code: "technodom",
  base: "https://www.technodom.kz",
  productSitemap: "https://www.technodom.kz/products-server-sitemap.xml",
  productUrl: (slug: string) => `https://www.technodom.kz/p/${slug}`,
  /** Technodom's own shop on Kaspi (merchant id), seen in its pages' Kaspi links. */
  kaspiMerchantId: "18430177",
} as const;

export class TechnodomHttpError extends Error {
  constructor(public status: number, public url: string) {
    super(`Technodom answered ${status} for ${url}`);
    this.name = "TechnodomHttpError";
  }
  get isBlocked() { return this.status === 403 || this.status === 429; }
  get isGone() { return this.status === 404 || this.status === 410; }
}
export class TechnodomParseError extends Error {
  constructor(message: string) { super(message); this.name = "TechnodomParseError"; }
}
/** Thrown before a request that the caller's guard refused (circuit breaker open, outside the run window). */
export class StoreRequestRefused extends Error {
  constructor(reason: string) { super(reason); this.name = "StoreRequestRefused"; }
}

/** Product addresses from the products sitemap: the slug after /p/ and Technodom's item id (its last segment). */
export function parseProductSitemap(xml: string): { slug: string; sku: string }[] {
  return [...xml.matchAll(/<loc>https:\/\/www\.technodom\.kz\/p\/([^<\s]+)<\/loc>/g)].map((m) => ({ slug: m[1]!, sku: skuOf(m[1]!) }));
}
export const skuOf = (slug: string) => slug.slice(slug.lastIndexOf("-") + 1);

export interface TechnodomProduct {
  sku: string; title: string;
  /** Integer tenge as Technodom shows it; null when it shows none. Bonuses are never subtracted. */
  price: number | null; oldPrice: number | null; inStock: boolean;
  /** The Kaspi product id Technodom links to (its Kaspi shop's listing), or null. */
  kaspiId: string | null;
}

/** Reads a product page's __NEXT_DATA__. Throws TechnodomParseError when the shape is not what we know. */
export function parseTechnodomProduct(html: string): TechnodomProduct {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new TechnodomParseError("no __NEXT_DATA__");
  let pi: Record<string, unknown> | undefined;
  try {
    pi = JSON.parse(m[1]!)?.props?.pageProps?.initialState?.productInfoStore?.productInfo;
  } catch {
    throw new TechnodomParseError("__NEXT_DATA__ is not JSON");
  }
  if (!pi || typeof pi.sku !== "string" || typeof pi.title !== "string") throw new TechnodomParseError("no productInfo with sku and title");
  const tenge = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null);
  const link = (pi.kaspiInstallmentInfo as { link?: unknown } | undefined)?.link;
  const kaspiId = typeof link === "string" ? link.match(/kaspi\.kz\/shop\/p\/[^?#]*?-(\d{6,12})\/?(?:[?#]|$)/)?.[1] ?? null : null;
  return { sku: pi.sku, title: pi.title.replace(/\s+/g, " ").trim(), price: tenge(pi.price), oldPrice: tenge(pi.oldPrice),
    inStock: pi.isAvailable === true && tenge(pi.price) !== null, kaspiId };
}

export interface TechnodomClientOptions {
  minIntervalMs?: number; jitterMs?: number; timeoutMs?: number; userAgent?: string;
  /** Called right before each request, after the pacing wait (may wait itself): throw StoreRequestRefused to stop it. */
  beforeRequest?: () => void | Promise<void>;
  fetch?: typeof fetch;
}

/** One request at a time, starts ≥ minIntervalMs (+ jitter) apart; non-2xx throws TechnodomHttpError. */
export function createTechnodomClient(o: TechnodomClientOptions = {}) {
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
    if (res.status < 200 || res.status >= 300) { await res.body?.cancel().catch(() => undefined); throw new TechnodomHttpError(res.status, url); }
    return res.text();
  }
  return {
    fetchProductSitemap: async () => parseProductSitemap(await get(TECHNODOM.productSitemap, "application/xml, text/xml")),
    fetchProduct: async (slug: string) => parseTechnodomProduct(await get(TECHNODOM.productUrl(slug), "text/html")),
  };
}
export type TechnodomClient = ReturnType<typeof createTechnodomClient>;
