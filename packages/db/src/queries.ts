import type postgres from "postgres";
import type { ProductSnapshot } from "@baga/kaspi";

export interface ProductRow {
  id: number;
  externalId: string;
  slug: string | null;
  title: string;
  imageUrl: string | null;
  categoryPath: string[];
  currentMinPrice: number | null;
  offerCount: number;
  inStock: boolean;
  lastCheckedAt: Date | null;
  observedSince: Date;
}

export async function getProductByExternalId(sql: postgres.Sql, externalId: string): Promise<ProductRow | null> {
  const rows = await sql<ProductRow[]>`
    select p.id, p.external_id as "externalId", p.slug, p.title, p.image_url as "imageUrl",
           p.category_path as "categoryPath", s.current_min_price as "currentMinPrice",
           coalesce(s.offer_count, 0) as "offerCount", coalesce(s.in_stock, false) as "inStock",
           s.last_checked_at as "lastCheckedAt", coalesce(s.observed_since, p.first_seen_at) as "observedSince"
    from products p
    join marketplaces m on m.id = p.marketplace_id and m.code = 'kaspi'
    left join product_state s on s.product_id = p.id
    where p.external_id = ${externalId}`;
  return rows[0] ?? null;
}

/** Daily lowest observed price. Days without a check are absent, never interpolated. */
export async function getDailyLows(sql: postgres.Sql, productId: number, days = 365) {
  return sql<{ day: string; price: number }[]>`
    select to_char(date_trunc('day', observed_at at time zone 'Asia/Almaty'), 'YYYY-MM-DD') as day,
           min(min_price)::int as price
    from price_observations
    where product_id = ${productId} and min_price is not null
      and observed_at > now() - make_interval(days => ${days})
    group by 1 order by 1`;
}

export async function getOffers(sql: postgres.Sql, productId: number) {
  return sql<{ sellerName: string; sellerRating: number | null; price: number; deliveryDuration: string | null }[]>`
    select se.name as "sellerName", se.rating as "sellerRating", o.price, o.delivery_duration as "deliveryDuration"
    from offers_current o join sellers se on se.id = o.seller_id
    where o.product_id = ${productId} order by o.price asc limit 50`;
}

/**
 * Stores a snapshot. Writes a price observation only when something changed, or once a day as a heartbeat.
 * Returns whether the min price changed.
 */
export async function saveSnapshot(sql: postgres.Sql, snap: ProductSnapshot, slug: string | null, runId: number | null) {
  return sql.begin(async (tx) => {
    const [p] = await tx<{ id: number }[]>`
      insert into products (marketplace_id, external_id, slug, title, image_url, category_path)
      values ((select id from marketplaces where code = 'kaspi'), ${snap.externalId}, ${slug}, ${snap.title},
              ${snap.imageUrl}, ${snap.categoryPath})
      on conflict (marketplace_id, external_id) do update
        set title = excluded.title, image_url = excluded.image_url, category_path = excluded.category_path,
            slug = coalesce(excluded.slug, products.slug), status = 'active'
      returning id`;
    const productId = p!.id;
    const [prev] = await tx<{ current_min_price: number | null; offer_count: number; in_stock: boolean; last_obs: Date | null }[]>`
      select s.current_min_price, s.offer_count, s.in_stock,
             (select max(observed_at) from price_observations o where o.product_id = s.product_id) as last_obs
      from product_state s where s.product_id = ${productId}`;
    const prices = snap.offers.map((o) => o.price);
    const median = prices.length ? prices[Math.floor(prices.length / 2)]! : null;
    const changed =
      !prev ||
      prev.current_min_price !== snap.minPrice ||
      prev.offer_count !== snap.offerCount ||
      prev.in_stock !== snap.inStock;
    const heartbeatDue = !prev?.last_obs || Date.now() - prev.last_obs.getTime() > 24 * 3_600_000;
    if (changed || heartbeatDue) {
      await tx`insert into price_observations (product_id, min_price, median_price, offer_count, in_stock, run_id)
               values (${productId}, ${snap.minPrice}, ${median}, ${snap.offerCount}, ${snap.inStock}, ${runId})`;
    }
    await tx`
      insert into product_state (product_id, current_min_price, offer_count, in_stock, last_checked_at, last_changed_at)
      values (${productId}, ${snap.minPrice}, ${snap.offerCount}, ${snap.inStock}, now(), now())
      on conflict (product_id) do update set
        current_min_price = excluded.current_min_price, offer_count = excluded.offer_count,
        in_stock = excluded.in_stock, last_checked_at = now(),
        last_changed_at = case when ${changed} then now() else product_state.last_changed_at end`;
    await tx`delete from offers_current where product_id = ${productId}`;
    for (const o of snap.offers) {
      const [s] = await tx<{ id: number }[]>`
        insert into sellers (marketplace_id, external_id, name, rating, reviews)
        values ((select id from marketplaces where code = 'kaspi'), ${o.sellerId}, ${o.sellerName}, ${o.sellerRating}, ${o.sellerReviews})
        on conflict (marketplace_id, external_id) do update set name = excluded.name, rating = excluded.rating, reviews = excluded.reviews
        returning id`;
      await tx`insert into offers_current (product_id, seller_id, price, delivery_duration)
               values (${productId}, ${s!.id}, ${o.price}, ${o.deliveryDuration})
               on conflict (product_id, seller_id) do update set price = least(offers_current.price, excluded.price)`;
    }
    await tx`insert into collection_schedule (product_id) values (${productId}) on conflict do nothing`;
    return { productId, priceChanged: !prev || prev.current_min_price !== snap.minPrice, previousMin: prev?.current_min_price ?? null };
  });
}
