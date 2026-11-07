import "server-only";
import { cache } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getSql, getProductByExternalId, getDailyLows, getOffers, countWatching, storeOffers, type StoreOffer, getQueuedRequest, requestProduct, isCollectorRunning, queueShortLink, getShortLink, type ShortLinkRow } from "@baga/db";
import { createKaspiClient, parseOffers, parseProductPage, buildSnapshot, KaspiHttpError, type ProductSnapshot } from "@baga/kaspi";
import type { DailyLow } from "@baga/core";

export interface ProductView {
  externalId: string;
  title: string;
  imageUrl: string | null;
  categoryPath: string[];
  kaspiUrl: string;
  minPrice: number | null;
  offerCount: number;
  inStock: boolean;
  /** Kaspi no longer has the product: the page shows its last observed price as history, never as current. */
  delisted: boolean;
  /** The latest observed lowest price, also for a delisted product (minPrice is null then). */
  lastPrice?: number | null;
  offers: { sellerId: string; sellerName: string; sellerRating: number | null; sellerReviews: number | null; price: number; deliveryDuration: string | null }[];
  history: DailyLow[]; // observed daily lows only
  observedSince: string; // ISO
  checkedAt: string; // ISO
  /** People with an active tracking on this product now (0 without a database). */
  watching: number;
  /** Other stores' fresh, in-stock prices for the exactly matched item (DECISIONS.md, 2026-11-07). */
  elsewhere: StoreOffer[];
}

/**
 * Not in our database yet: "unknown" shows the Turnstile request screen; "queued" means the collector will fetch it
 * in Kaspi's next visit window. The website itself never requests Kaspi (DECISIONS.md, 2026-11-01).
 */
export type ProductResult =
  | { ok: true; view: ProductView }
  | { ok: false; reason: "not_found" | "unavailable" | "unknown" | "queued" };

const kaspi = createKaspiClient();

/** Dev-only: BAGA_FIXTURES=1 serves the captured Kaspi fixture, so UI work needs no network. */
function fixtureSnapshot(id: string): ProductSnapshot | null {
  if (process.env.BAGA_FIXTURES !== "1") return null;
  const dir = join(process.cwd(), "..", "..", "packages", "kaspi", "fixtures");
  try {
    const page = parseProductPage(readFileSync(join(dir, `product-${id}.html`), "utf8"));
    const offers = parseOffers(JSON.parse(readFileSync(join(dir, `offers-${id}.json`), "utf8")));
    return buildSnapshot(page, offers);
  } catch {
    return null;
  }
}

function fromSnapshot(s: ProductSnapshot): ProductView {
  return {
    externalId: s.externalId, title: s.title, imageUrl: s.imageUrl, categoryPath: s.categoryPath,
    kaspiUrl: `https://kaspi.kz/shop/p/-${s.externalId}/`, minPrice: s.minPrice, offerCount: s.offerCount,
    inStock: s.inStock, delisted: false, offers: s.offers.map((o) => ({ sellerId: o.sellerId, sellerName: o.sellerName, sellerRating: o.sellerRating, sellerReviews: o.sellerReviews, price: o.price, deliveryDuration: o.deliveryDuration })),
    history: [], observedSince: s.fetchedAt, checkedAt: s.fetchedAt, watching: 0, elsewhere: [],
  };
}

/** Queues a visitor's request; called by /api/lookup after a Turnstile check. No Kaspi request here. */
export async function queueProductRequest(externalId: string, slug: string | null): Promise<"queued" | "exists" | "full" | "unavailable"> {
  const sql = getSql();
  if (!sql) return "unavailable";
  return requestProduct(sql, externalId, slug);
}

/** Queues an l.kaspi.kz short link for the collector to resolve. */
export async function queueShortLinkRequest(code: string, path: string): Promise<"queued" | "full" | "unavailable"> {
  const sql = getSql();
  if (!sql) return "unavailable";
  const r = await queueShortLink(sql, code, path);
  return r === "full" ? "full" : "queued";
}

/** A queued short link: still pending, failed, or resolved to a product id. */
export async function shortLinkStatus(code: string): Promise<ShortLinkRow | null> {
  const sql = getSql();
  if (!sql) return null;
  return getShortLink(sql, code);
}

/** Whether the collector is running right now, so a queued product will be fetched within minutes. */
export async function collectorRunning(): Promise<boolean> {
  const sql = getSql();
  if (!sql) return false;
  return isCollectorRunning(sql).catch(() => false);
}

/** The slug saved with a queued request (from the visitor's link), if any. */
export async function queuedSlug(externalId: string): Promise<string | null> {
  const sql = getSql();
  if (!sql) return null;
  return (await getQueuedRequest(sql, externalId))?.slug ?? null;
}

/** cache(): the page and its metadata share one database read per request. */
export const getProductView = cache(async function getProductView(externalId: string): Promise<ProductResult> {
  const fx = fixtureSnapshot(externalId);
  if (fx) return { ok: true, view: fromSnapshot(fx) };

  const sql = getSql();
  if (sql) {
    const row = await getProductByExternalId(sql, externalId);
    if (!row) {
      const q = await getQueuedRequest(sql, externalId);
      return { ok: false, reason: !q ? "unknown" : q.status === "not_found" ? "not_found" : "queued" };
    }
    // A view is marked by the browser's product_view beacon (/api/e), not by this render: crawlers and prefetches
    // would otherwise keep products on daily checks (DECISIONS.md, 2026-11-04).
    const [history, offers, watching, elsewhere] = await Promise.all([getDailyLows(sql, row.id), getOffers(sql, row.id), countWatching(sql, row.id),
      // Before migration 0018 the store tables do not exist: no block rather than no page.
      storeOffers(sql, row.id).catch(() => [] as StoreOffer[])]);
    return {
      ok: true,
      view: {
        externalId: row.externalId, title: row.title, imageUrl: row.imageUrl, categoryPath: row.categoryPath,
        kaspiUrl: `https://kaspi.kz/shop/p/${row.slug ? `${row.slug}-` : "-"}${row.externalId}/`,
        minPrice: row.delisted ? null : row.currentMinPrice, lastPrice: row.currentMinPrice,
        offerCount: row.delisted ? 0 : row.offerCount, inStock: row.inStock && !row.delisted, delisted: row.delisted,
        offers: row.delisted ? [] : offers,
        history, observedSince: row.observedSince.toISOString(), checkedAt: (row.lastCheckedAt ?? row.observedSince).toISOString(), watching, elsewhere,
      },
    };
  }

  // No database configured: development UI work only. Production always has a database.
  if (process.env.NODE_ENV === "production") return { ok: false, reason: "unavailable" };
  try {
    return { ok: true, view: fromSnapshot(await kaspi.fetchSnapshot(externalId)) };
  } catch (e) {
    console.error(`[kaspi] live fetch failed for ${externalId}:`, e);
    return { ok: false, reason: e instanceof KaspiHttpError && e.isNotFound ? "not_found" : "unavailable" };
  }
});
