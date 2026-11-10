import type postgres from "postgres";
import { CITY_CHECKS, CITY_DEPENDENT_CATEGORIES, EXTRA_CITIES, isCityDependent, type City } from "@baga/core";

/**
 * Prices by city for goods sold by local shops (DECISIONS.md 2026-11-10 "Pharmacy prices by city", migration 0023).
 * Almaty stays the reference in price_observations; the other cities' sellers are kept here, once a day each.
 */

export type CitySeller = { id: string; name: string; price: number; rating: number | null; reviews: number | null; delivery: string | null };
export type CityPrice = { city: City; observedAt: Date; minPrice: number | null; offerCount: number; sellers: CitySeller[] };

type OfferLike = { sellerId: string; sellerName: string; sellerRating: number | null; sellerReviews: number | null; price: number; deliveryDuration: string | null };

/** Saves one city's sellers as observed (cheapest first). No seller = min_price null, offer_count 0. */
export async function saveCityPrice(sql: postgres.Sql, productId: number, city: City, offers: OfferLike[], runId: number | null) {
  const sorted = [...offers].sort((a, b) => a.price - b.price);
  const sellers: CitySeller[] = sorted.slice(0, CITY_CHECKS.sellersKept).map((o) => ({
    id: o.sellerId, name: o.sellerName, price: o.price, rating: o.sellerRating, reviews: o.sellerReviews, delivery: o.deliveryDuration,
  }));
  await sql`insert into city_prices (product_id, city, min_price, offer_count, sellers, run_id)
    values (${productId}, ${city}, ${sorted[0]?.price ?? null}, ${sorted.length}, ${sql.json(sellers as unknown as postgres.JSONValue)}, ${runId})`;
}

/**
 * City checks that are due: active products in a city-dependent category, already collected for Almaty, whose city
 * row is missing or older than CITY_CHECKS.recheckHours. Products someone tracks or opened recently come first.
 */
export async function cityChecksDue(sql: postgres.Sql, limit: number, onlyProduct?: number) {
  const roots = [...new Set(CITY_DEPENDENT_CATEGORIES.map((c) => c[0]!))];
  const rows = await sql<{ productId: number; externalId: string; categoryPath: string[]; city: City }[]>`
    select p.id as "productId", p.external_id as "externalId", p.category_path as "categoryPath", c.city
    from products p
    join product_state s on s.product_id = p.id and s.last_checked_at is not null
    cross join unnest(${sql.array(EXTRA_CITIES as string[])}::text[]) as c(city)
    where p.status = 'active' and p.category_path[1] = any(${sql.array(roots)}::text[])
      ${onlyProduct ? sql`and p.id = ${onlyProduct}` : sql``}
      and not exists (select 1 from city_prices cp where cp.product_id = p.id and cp.city = c.city
        and cp.observed_at > now() - make_interval(hours => ${CITY_CHECKS.recheckHours}))
    order by exists (select 1 from trackings t where t.external_id = p.external_id and t.status = 'active') desc,
      p.last_viewed_at desc nulls last, p.id, c.city
    limit ${limit * 4}`;
  return rows.filter((r) => isCityDependent(r.categoryPath)).slice(0, limit);
}

/** The latest observation for one city, or null when that city was never checked. */
export async function latestCityPrice(sql: postgres.Sql, productId: number, city: City): Promise<CityPrice | null> {
  const [r] = await sql<{ observedAt: Date; minPrice: number | null; offerCount: number; sellers: CitySeller[] }[]>`
    select observed_at as "observedAt", min_price as "minPrice", offer_count as "offerCount", sellers
    from city_prices where product_id = ${productId} and city = ${city} order by observed_at desc limit 1`;
  return r ? { city, ...r } : null;
}
