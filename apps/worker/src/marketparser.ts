/**
 * MarketParser (cp2.marketparser.ru, API v2) as the source of visitors' manual checks (DECISIONS.md 2026-11-17,
 * the owner's decision): BAĞA sends no Kaspi request outside the collector's window; MarketParser checks the Kaspi
 * cards by their product number and we store what it saw, marked source 'marketparser'. One campaign set up once in
 * MarketParser's web interface (kaspi.kz, Almaty, search column «Идентификатор», all offers, base price); the API
 * replaces its price list and starts a report.
 */
import type { ProductSnapshot, OfferSnapshot } from "@baga/kaspi";

const BASE = "https://cp2.marketparser.ru/api/v2";

export type MpOffer = { shopName: string; price: number; inStock?: boolean; productName?: string | null; currency?: string };
export type MpProduct = {
  name: string;
  ourId: string | null;
  linkToOffers: string | null;
  countOffers: number;
  searchResult: string;
  isError?: boolean;
  offers: MpOffer[];
};
export type KnownSeller = { externalId: string; name: string; rating: number | null; reviews: number | null };

export class MarketParserError extends Error {
  constructor(message: string, readonly status?: number) { super(message); this.name = "MarketParserError"; }
}

export function createMarketParser(apiKey: string, campaignId: string, fetchImpl: typeof fetch = fetch) {
  async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const res = await fetchImpl(`${BASE}/${path}`, {
      method,
      headers: { "Api-Key": apiKey, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    let json: { response?: T; message?: string } = {};
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    if (!res.ok || json.response === undefined) throw new MarketParserError(`${method} ${path}: ${res.status} ${json.message ?? text.slice(0, 200)}`, res.status);
    return json.response;
  }
  return {
    remainingUnits: async () => (await call<{ remainingUnits: number }>("GET", "me/plan.json")).remainingUnits,
    /** Replaces the campaign's list and starts a report on it; returns the report id. */
    checkProducts: async (items: { externalId: string; name: string }[]) => {
      const r = await call<{ success: boolean; reportId: number | null }>("POST", `campaigns/${campaignId}/price.json`, {
        products: items.map((i) => ({ name: i.name, id: i.externalId })),
        create_report: true,
      });
      if (!r.reportId) throw new MarketParserError("no report was created");
      return r.reportId;
    },
    report: (id: number) => call<{ status: string; isSuccessfullyFinished: boolean }>("GET", `campaigns/${campaignId}/reports/${id}.json`),
    results: async (id: number) => {
      const all: MpProduct[] = [];
      for (let page = 1; page < 20; page++) {
        const r = await call<{ total: number; products: MpProduct[] }>("GET", `campaigns/${campaignId}/reports/${id}/results.json?per_page=100&page=${page}`);
        all.push(...r.products);
        if (all.length >= r.total || !r.products.length) break;
      }
      return all;
    },
  };
}

/** The Kaspi card a result came from: its links wrap kaspi.kz/shop/p/<slug>-<id>/ (percent-encoded). */
export function cardOf(link: string | null): { externalId: string; slug: string } | null {
  if (!link) return null;
  let s = link;
  for (let i = 0; i < 3 && /%2F/i.test(s); i++) s = decodeURIComponent(s);
  const m = s.match(/kaspi\.kz\/shop\/p\/([a-z0-9-]*?)-?(\d{5,12})\/?(?:[?#&]|$)/i);
  return m ? { externalId: m[2]!, slug: m[1] ?? "" } : null;
}

/** The card's title: the name most offers carry (sellers may list their own wording), else what we sent. */
export function titleOf(p: MpProduct): string {
  const n = new Map<string, number>();
  for (const o of p.offers) if (o.productName?.trim()) n.set(o.productName.trim(), (n.get(o.productName.trim()) ?? 0) + 1);
  let best: string | null = null;
  for (const [k, v] of n) if (best === null || v > n.get(best)!) best = k;
  return best ?? p.name;
}

/**
 * One result as our snapshot, or why it cannot be used. Only a result for exactly the card we asked for (one card
 * found, its link carrying our product number) with at least one priced offer in tenge; anything else waits for the
 * collector's own check. Sellers are matched to the ones we know by their exact name, so their rating stays; an
 * unknown shop gets a name key until the collector sees its Kaspi id. No page data (image, category, reviews): the
 * collector reads the page in its next window.
 */
export function snapshotOf(p: MpProduct, expectedId: string, known: Map<string, KnownSeller>, now = new Date()):
  { snap: ProductSnapshot; slug: string | null } | { skip: string } {
  if (p.isError) return { skip: "MarketParser error" };
  if (p.searchResult !== "ONE_MODEL") return { skip: `search: ${p.searchResult}` };
  const card = cardOf(p.linkToOffers);
  if (!card || card.externalId !== expectedId) return { skip: `another card: ${card?.externalId ?? "no link"}` };
  const priced = p.offers.filter((o) => Number.isInteger(o.price) && o.price > 0 && (!o.currency || o.currency === "KZT") && o.shopName?.trim());
  if (!priced.length) return { skip: "no offers" };
  const seen = new Set<string>();
  const offers: OfferSnapshot[] = [];
  for (const o of [...priced].sort((a, b) => a.price - b.price)) {
    const name = o.shopName.trim();
    const k = known.get(name);
    const sellerId = k?.externalId ?? `name:${name}`.slice(0, 200);
    if (seen.has(sellerId)) continue;
    seen.add(sellerId);
    offers.push({ sellerId, sellerName: name, sellerRating: k?.rating ?? null, sellerReviews: k?.reviews ?? null, price: o.price as OfferSnapshot["price"], deliveryDuration: null, preorderDays: 0 });
  }
  return {
    slug: card.slug || null,
    snap: {
      marketplace: "kaspi", externalId: expectedId, title: titleOf(p), imageUrl: null, categoryPath: [],
      reviews: null, rating: null, offers, minPrice: offers[0]!.price, offerCount: offers.length, inStock: true,
      fetchedAt: now.toISOString(),
    },
  };
}
