import type postgres from "postgres";
import { SHOP_FEEDBACK, adjustedRating, isEstablished, priceNotes, sellerLabel, type ShopFeedbackOutcome } from "@baga/core";

/**
 * Shop evidence (DECISIONS.md, 2026-11-05 "Shop evidence, not verdicts"; migration 0016): Kaspi's own rating and
 * review count, BAGA's daily records of them, the shop's offers on products we check, and what BAGA users said
 * after buying. Only observed values; nothing is estimated.
 */
export interface ShopProduct {
  externalId: string; title: string; titleKk: string | null; imageUrl: string | null;
  price: number; minPrice: number | null; offerCount: number;
  /** The other sellers' current prices for the same product. */
  others: number[];
}
export interface ShopView {
  externalId: string; name: string; rating: number | null; reviews: number | null; firstSeenAt: Date | null;
  /** When BAGA last saw one of its offers (the rating is at least that fresh). */
  seenAt: Date | null;
  daily: { day: string; reviews: number | null; rating: number | null }[];
  products: ShopProduct[]; productCount: number;
  feedback: Record<ShopFeedbackOutcome, number> & { n: number };
}

export async function getShop(sql: postgres.Sql, externalId: string, limit = 60): Promise<ShopView | null> {
  const [s] = await sql<{ id: number; name: string; rating: number | null; reviews: number | null; first_seen_at: Date | null; seen_at: Date | null; n: number }[]>`
    select se.id, se.name, se.rating, se.reviews, se.first_seen_at,
           (select max(o.updated_at) from offers_current o where o.seller_id = se.id) as seen_at,
           (select count(*)::int from offers_current o join products p on p.id = o.product_id
             where o.seller_id = se.id and p.status = 'active') as n
    from sellers se join marketplaces m on m.id = se.marketplace_id and m.code = 'kaspi'
    where se.external_id = ${externalId}`;
  if (!s) return null;
  const daily = await sql<ShopView["daily"]>`
    select to_char(day, 'YYYY-MM-DD') as day, reviews, rating from seller_daily
    where seller_id = ${s.id} and day > now() - interval '90 days' order by day`;
  const products = await sql<(Omit<ShopProduct, "others"> & { others: number[] | null })[]>`
    select p.external_id as "externalId", p.title, p.title_kk as "titleKk", p.image_url as "imageUrl", o.price,
           st.current_min_price as "minPrice", coalesce(st.offer_count, 0) as "offerCount",
           (select array_agg(o2.price) from offers_current o2 where o2.product_id = o.product_id and o2.seller_id <> o.seller_id) as others
    from offers_current o join products p on p.id = o.product_id left join product_state st on st.product_id = p.id
    where o.seller_id = ${s.id} and p.status = 'active'
    order by coalesce(p.kaspi_reviews, 0) desc, p.external_id limit ${limit}`;
  const fb = await sql<{ outcome: ShopFeedbackOutcome; n: number }[]>`
    select outcome, count(*)::int as n from seller_feedback where seller_id = ${s.id} group by 1`;
  const feedback = Object.fromEntries(SHOP_FEEDBACK.outcomes.map((o) => [o, 0])) as Record<ShopFeedbackOutcome, number>;
  for (const r of fb) feedback[r.outcome] = r.n;
  return {
    externalId, name: s.name, rating: s.rating, reviews: s.reviews, firstSeenAt: s.first_seen_at, seenAt: s.seen_at,
    daily, productCount: s.n,
    products: products.map((p) => ({ ...p, others: (p.others ?? []).map(Number) })),
    feedback: { ...feedback, n: fb.reduce((a, r) => a + r.n, 0) },
  };
}

/** The shops currently selling a product (cheapest first): the choices for "у какого продавца купили?". */
export async function productSellers(sql: postgres.Sql, productExternalId: string): Promise<{ sellerId: string; name: string }[]> {
  return sql<{ sellerId: string; name: string }[]>`
    select se.external_id as "sellerId", se.name
    from offers_current o join sellers se on se.id = o.seller_id join products p on p.id = o.product_id
    where p.external_id = ${productExternalId} order by o.price, se.name limit 30`;
}

/**
 * Saves (or replaces) the purchase feedback of a tracking whose "Вы купили?" answer is "yes". The shop must sell
 * that product now (or be left out). By the email link's code or by this browser's watcher.
 */
export async function saveShopFeedback(
  sql: postgres.Sql, by: { code: string } | { watcherId: string; trackingId: string },
  sellerExternalId: string | null, outcome: ShopFeedbackOutcome,
): Promise<boolean> {
  const [t] = await sql<{ id: string; product_id: number | null }[]>`
    select t.id, t.product_id from trackings t
    where t.bought = 'yes' and ${"code" in by ? sql`t.bought_code = ${by.code}` : sql`t.id = ${by.trackingId} and t.watcher_id = ${by.watcherId}`}`;
  if (!t) return false;
  let sellerId: number | null = null;
  if (sellerExternalId && t.product_id) {
    const [s] = await sql<{ id: number }[]>`
      select se.id from sellers se join offers_current o on o.seller_id = se.id
      where se.external_id = ${sellerExternalId} and o.product_id = ${t.product_id}`;
    sellerId = s?.id ?? null;
  }
  await sql`insert into seller_feedback (tracking_id, seller_id, outcome) values (${t.id}, ${sellerId}, ${outcome})
    on conflict (tracking_id) do update set seller_id = excluded.seller_id, outcome = excluded.outcome, created_at = now()`;
  return true;
}

/**
 * The shop catalogue (/shops): every shop with a current offer on a product we check, by the chip it earns
 * (packages/core/src/sellers.ts), with how many of its offers are far below the other sellers ("check" / "fact").
 * Labels are worked out here with the same rules as the seller table, so the counts always agree.
 */
export type ShopTab = "all" | "established" | "high" | "mixed" | "unknown";
export type ShopSort = "reviews" | "rating" | "products";
export const SHOP_TABS: ShopTab[] = ["all", "established", "high", "mixed", "unknown"];
export const SHOP_SORTS: ShopSort[] = ["reviews", "rating", "products"];
export const SHOP_LIST = { perPage: 40 } as const;
export interface ShopListItem {
  externalId: string; name: string; rating: number | null; reviews: number | null; products: number;
  /** Offers far below the other sellers: with "check the seller", and the plain fact (established shops). */
  checks: number; facts: number;
}
export interface ShopList { items: ShopListItem[]; total: number; page: number; pages: number; counts: Record<ShopTab, number> }

export function shopTab(rating: number | null, reviews: number | null): Exclude<ShopTab, "all"> {
  if (isEstablished(rating, reviews)) return "established";
  const l = sellerLabel(rating, reviews);
  return l === "high" ? "high" : l === "mixed" || l === "low" ? "mixed" : "unknown";
}

/** Every shop with a current offer, with its far-below-others counts: the costly part, cached by the website. */
export type ShopIndex = ShopListItem[];
export async function loadShopIndex(sql: postgres.Sql): Promise<ShopIndex> {
  const rows = await sql<{ id: number; externalId: string; name: string; rating: number | null; reviews: number | null; products: number }[]>`
    select se.id, se.external_id as "externalId", se.name, se.rating, se.reviews, count(*)::int as products
    from sellers se join offers_current o on o.seller_id = se.id join products p on p.id = o.product_id
    where p.status = 'active' group by se.id`;
  const byId = new Map(rows.map((r) => [r.id, { ...r, checks: 0, facts: 0 }]));
  // Each product's offers, cheapest first, checked against the others (priceNotes), the same as the seller table.
  const offers = await sql<{ sellers: number[]; prices: number[] }[]>`
    select array_agg(o.seller_id order by o.price, o.seller_id) as sellers, array_agg(o.price order by o.price, o.seller_id) as prices
    from offers_current o join products p on p.id = o.product_id
    where p.status = 'active' group by o.product_id having count(*) >= 4`;
  for (const o of offers) {
    const list = o.sellers.map((id, i) => ({ id: Number(id), price: o.prices[i]!, sellerRating: byId.get(Number(id))?.rating ?? null, sellerReviews: byId.get(Number(id))?.reviews ?? null }));
    priceNotes(list).forEach((n, i) => {
      const shop = n && byId.get(list[i]!.id);
      if (shop) shop[n.kind === "check" ? "checks" : "facts"]++;
    });
  }
  return [...byId.values()].map(({ id: _, ...r }) => r);
}

/** The catalogue's tab, search, sort and page over a ShopIndex (no database). */
export function pickShops(all: ShopIndex, x: { tab?: ShopTab; q?: string; sort?: ShopSort; page?: number }): ShopList {
  const counts = { all: all.length, established: 0, high: 0, mixed: 0, unknown: 0 } as Record<ShopTab, number>;
  for (const r of all) counts[shopTab(r.rating, r.reviews)]++;
  const tab = x.tab ?? "all";
  const words = (x.q ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  const sort = x.sort ?? "reviews";
  const picked = all
    .filter((r) => tab === "all" || shopTab(r.rating, r.reviews) === tab)
    .filter((r) => words.every((w) => r.name.toLowerCase().includes(w)))
    .sort((a, b) =>
      sort === "products" ? b.products - a.products
      : sort === "rating" ? (adjustedRating(b.rating, b.reviews) ?? -1) - (adjustedRating(a.rating, a.reviews) ?? -1)
      : (b.reviews ?? 0) - (a.reviews ?? 0));
  const pages = Math.max(1, Math.ceil(picked.length / SHOP_LIST.perPage));
  const page = Math.min(pages, Math.max(1, Math.floor(x.page ?? 1)));
  return { items: picked.slice((page - 1) * SHOP_LIST.perPage, page * SHOP_LIST.perPage), total: picked.length, page, pages, counts };
}

export async function listShops(sql: postgres.Sql, x: { tab?: ShopTab; q?: string; sort?: ShopSort; page?: number }): Promise<ShopList> {
  return pickShops(await loadShopIndex(sql), x);
}
