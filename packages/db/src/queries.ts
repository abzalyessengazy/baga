import type postgres from "postgres";
import type { ProductSnapshot } from "@baga/kaspi";
import { likePattern } from "./like";

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
export async function saveSnapshot(
  sql: postgres.Sql,
  snap: ProductSnapshot,
  slug: string | null,
  runId: number | null,
  opts: { pageFetched?: boolean } = {},
) {
  const pageFetched = opts.pageFetched ?? true;
  return sql.begin(async (tx) => {
    const [p] = await tx<{ id: number }[]>`
      insert into products (marketplace_id, external_id, slug, title, image_url, category_path, page_checked_at)
      values ((select id from marketplaces where code = 'kaspi'), ${snap.externalId}, ${slug}, ${snap.title},
              ${snap.imageUrl}, ${snap.categoryPath}, ${pageFetched ? new Date() : null})
      on conflict (marketplace_id, external_id) do update
        set title = excluded.title, image_url = excluded.image_url, category_path = excluded.category_path,
            slug = coalesce(excluded.slug, products.slug), status = 'active',
            page_checked_at = coalesce(excluded.page_checked_at, products.page_checked_at)
      returning id`;
    const productId = p!.id;
    // Watcher trackings made while the product was still queued (migration 0007).
    await tx`update trackings set product_id = ${productId} where external_id = ${snap.externalId} and product_id is null`;
    // heartbeat_due: the last observation is on an earlier Almaty calendar day (or there is none), so every
    // day with a check gets a point even when nothing changed. (It was "> 24 h", which skipped days.)
    const [prev] = await tx<{ current_min_price: number | null; offer_count: number; in_stock: boolean; heartbeat_due: boolean }[]>`
      select s.current_min_price, s.offer_count, s.in_stock,
             coalesce(
               ((select max(observed_at) from price_observations o where o.product_id = s.product_id) at time zone 'Asia/Almaty')::date
                 < (now() at time zone 'Asia/Almaty')::date,
               true) as heartbeat_due
      from product_state s where s.product_id = ${productId}`;
    const prices = snap.offers.map((o) => o.price);
    const median = prices.length ? prices[Math.floor(prices.length / 2)]! : null;
    const changed =
      !prev ||
      prev.current_min_price !== snap.minPrice ||
      prev.offer_count !== snap.offerCount ||
      prev.in_stock !== snap.inStock;
    const heartbeatDue = !prev || prev.heartbeat_due;
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

export type QueuedRequest = { status: "pending" | "not_found"; addedAt: Date; slug: string | null };

/** A queued product request (seed or visitor), if any. */
export async function getQueuedRequest(sql: postgres.Sql, externalId: string): Promise<QueuedRequest | null> {
  const rows = await sql<{ status: "pending" | "not_found"; added_at: Date; slug: string | null }[]>`
    select status, added_at, slug from seed_queue where external_id = ${externalId}`;
  return rows[0] ? { status: rows[0].status, addedAt: rows[0].added_at, slug: rows[0].slug } : null;
}

export interface ShortLinkRow { code: string; path: string; status: "pending" | "resolved" | "failed"; externalId: string | null; slug: string | null }

/** Queues a short link the website could not resolve. Returns the row (existing or new), or "full". */
export async function queueShortLink(sql: postgres.Sql, code: string, path: string, maxPending = 300): Promise<ShortLinkRow | "full"> {
  const existing = await getShortLink(sql, code);
  if (existing) return existing;
  const [p] = await sql<{ n: number }[]>`select count(*)::int as n from short_link_queue where status = 'pending'`;
  if ((p?.n ?? 0) >= maxPending) return "full";
  await sql`insert into short_link_queue (code, path) values (${code}, ${path}) on conflict (code) do nothing`;
  return (await getShortLink(sql, code))!;
}

export async function getShortLink(sql: postgres.Sql, code: string): Promise<ShortLinkRow | null> {
  const rows = await sql<ShortLinkRow[]>`select code, path, status, external_id as "externalId", slug from short_link_queue where code = ${code}`;
  return rows[0] ?? null;
}

/** True while a collector run has started and not finished (runs last at most the 4 h 45 min window). */
export async function isCollectorRunning(sql: postgres.Sql): Promise<boolean> {
  const rows = await sql`select 1 from collection_runs where finished_at is null and started_at > now() - interval '6 hours' limit 1`;
  return rows.length > 0;
}

/**
 * Queues a visitor's request for a product we don't have. The collector fetches visitor rows first.
 * An existing seed row is promoted to visitor priority. Refuses when too many visitor rows are pending.
 */
export async function requestProduct(sql: postgres.Sql, externalId: string, slug: string | null = null, maxPending = 300): Promise<"queued" | "exists" | "full"> {
  const known = await sql`select 1 from products where external_id = ${externalId}`;
  if (known.length) return "exists";
  const already = await sql`select 1 from seed_queue where external_id = ${externalId}`;
  if (!already.length) {
    const [p] = await sql<{ n: number }[]>`select count(*)::int as n from seed_queue where source = 'visitor' and status = 'pending'`;
    if ((p?.n ?? 0) >= maxPending) return "full";
  }
  await sql`insert into seed_queue (external_id, slug, source) values (${externalId}, ${slug}, 'visitor')
    on conflict (external_id) do update set source = 'visitor', slug = coalesce(seed_queue.slug, excluded.slug)
    where seed_queue.status = 'pending'`;
  return "queued";
}

/** A tracked product as shown in search results and "already tracked" lists. Prices are observed, never estimated. */
export interface CatalogItem {
  externalId: string;
  title: string;
  imageUrl: string | null;
  minPrice: number | null;
  inStock: boolean;
}

function catalogSelect(sql: postgres.Sql) {
  return sql`select p.external_id as "externalId", p.title, p.image_url as "imageUrl",
      s.current_min_price as "minPrice", coalesce(s.in_stock, false) as "inStock"
    from products p join product_state s on s.product_id = p.id
    where p.status = 'active'`;
}

/** Products whose title contains every word (case-insensitive). Our catalog only; never Kaspi. */
export async function searchProducts(sql: postgres.Sql, words: string[], limit = 8): Promise<CatalogItem[]> {
  if (!words.length) return [];
  const all = words.map((w) => sql`and p.title ilike ${likePattern(w)}`).reduce((a, b) => sql`${a} ${b}`);
  return sql<CatalogItem[]>`${catalogSelect(sql)} ${all}
    order by s.in_stock desc, p.is_seed desc, p.last_viewed_at desc nulls last, p.id limit ${limit}`;
}

/**
 * Tracked products sharing words with a link's slug, best matches first. Needs 2 matching words when there are
 * several (one shared colour or brand alone is not "similar").
 */
export async function similarProducts(sql: postgres.Sql, words: string[], excludeExternalId: string, limit = 6): Promise<CatalogItem[]> {
  if (!words.length) return [];
  const score = words.map((w) => sql`(p.title ilike ${likePattern(w)})::int`).reduce((a, b) => sql`${a} + ${b}`);
  const need = words.length >= 2 ? 2 : 1;
  return sql<CatalogItem[]>`${catalogSelect(sql)} and p.external_id <> ${excludeExternalId} and (${score}) >= ${need}
    order by (${score}) desc, s.in_stock desc, p.last_viewed_at desc nulls last, p.id limit ${limit}`;
}

/** Fallback list: in-stock tracked products, seed catalog first, most recently viewed first. */
export async function popularProducts(sql: postgres.Sql, excludeExternalId: string, limit = 6): Promise<CatalogItem[]> {
  return sql<CatalogItem[]>`${catalogSelect(sql)} and p.external_id <> ${excludeExternalId} and s.in_stock
    order by p.is_seed desc, p.last_viewed_at desc nulls last, s.last_checked_at desc nulls last limit ${limit}`;
}
