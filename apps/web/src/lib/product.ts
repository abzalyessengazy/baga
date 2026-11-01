import "server-only";
import { cache } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getSql, getProductByExternalId, getDailyLows, getOffers, saveSnapshot } from "@baga/db";
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
  offers: { sellerName: string; sellerRating: number | null; price: number; deliveryDuration: string | null }[];
  history: DailyLow[]; // observed daily lows only
  observedSince: string; // ISO
  checkedAt: string; // ISO
}

export type ProductResult = { ok: true; view: ProductView } | { ok: false; reason: "not_found" | "unavailable" };

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
    inStock: s.inStock, offers: s.offers.map((o) => ({ sellerName: o.sellerName, sellerRating: o.sellerRating, price: o.price, deliveryDuration: o.deliveryDuration })),
    history: [], observedSince: s.fetchedAt, checkedAt: s.fetchedAt,
  };
}

/** cache(): the page and its metadata share one lookup per request, so Kaspi is asked once, not twice. */
export const getProductView = cache(async function getProductView(externalId: string): Promise<ProductResult> {
  const fx = fixtureSnapshot(externalId);
  if (fx) return { ok: true, view: fromSnapshot(fx) };

  const sql = getSql();
  if (sql) {
    let row = await getProductByExternalId(sql, externalId);
    if (!row) {
      try {
        await saveSnapshot(sql, await kaspi.fetchSnapshot(externalId), null, null);
      } catch (e) {
        console.error(`[kaspi] fetch failed for ${externalId}:`, e);
        return { ok: false, reason: e instanceof KaspiHttpError && e.isNotFound ? "not_found" : "unavailable" };
      }
      row = await getProductByExternalId(sql, externalId);
      if (!row) return { ok: false, reason: "unavailable" };
    }
    await sql`update products set last_viewed_at = now() where id = ${row.id}`;
    const [history, offers] = await Promise.all([getDailyLows(sql, row.id), getOffers(sql, row.id)]);
    return {
      ok: true,
      view: {
        externalId: row.externalId, title: row.title, imageUrl: row.imageUrl, categoryPath: row.categoryPath,
        kaspiUrl: `https://kaspi.kz/shop/p/${row.slug ? `${row.slug}-` : "-"}${row.externalId}/`,
        minPrice: row.currentMinPrice, offerCount: row.offerCount, inStock: row.inStock, offers,
        history, observedSince: row.observedSince.toISOString(), checkedAt: (row.lastCheckedAt ?? row.observedSince).toISOString(),
      },
    };
  }

  // No database configured: live snapshot only, no history (and the page says so).
  try {
    return { ok: true, view: fromSnapshot(await kaspi.fetchSnapshot(externalId)) };
  } catch (e) {
    console.error(`[kaspi] live fetch failed for ${externalId}:`, e);
    return { ok: false, reason: e instanceof KaspiHttpError && e.isNotFound ? "not_found" : "unavailable" };
  }
});
