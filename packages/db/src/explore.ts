import type postgres from "postgres";
import { MOVE_MIN_PCT } from "@baga/core";
import { likePattern } from "./like";
import { addedByPerson } from "./stats";
import { MARKET_CONFIG } from "./market";

/**
 * The catalog browser (/explore): every product we watch, as one of four lists, with search, a category filter,
 * sorting and pages. The lists follow docs/STATS.md, the same rules as the home page slips:
 * - drops / rises: rule W, the current lowest price against the price a week ago (the earliest daily low 2–7
 *   Almaty days before today that held two days in a row; a check today or yesterday, in stock, MOVE_MIN_PCT or more);
 * - spread: the cheapest and the dearest seller of the latest check (2+ sellers, checked in the last 3 days),
 *   leaving out offers above MARKET_CONFIG.spreadOutlier times the product's median offer;
 * - all: every active product with a price.
 * Only observed prices; nothing is estimated.
 */
export type ExploreList = "drops" | "rises" | "spread" | "all";
export type ExploreSort = "change" | "spread" | "cheap" | "dear" | "popular" | "new" | "tracked";

export interface ExploreItem {
  externalId: string; title: string; titleKk: string | null; imageUrl: string | null; category: string | null;
  price: number; offerCount: number;
  /** drops / rises: the week's daily low it is compared with, and the change in percent. */
  was: number | null; pct: number | null;
  /** The cheapest and the dearest current offer (null without 2+ sellers). */
  lo: number | null; hi: number | null;
}

export interface ExploreQuery { list: ExploreList; q?: string; category?: string; sort?: ExploreSort; page?: number }
export interface ExploreResult {
  items: ExploreItem[]; total: number; page: number; pages: number; sort: ExploreSort;
  /** Categories in this list (before the category filter), most products first. */
  categories: { name: string; count: number }[];
}

export const EXPLORE = { perPage: 30, maxPage: 200, categories: 60, spreadMinPrice: 5_000 } as const;
export const EXPLORE_LISTS: ExploreList[] = ["drops", "rises", "spread", "all"];
export const EXPLORE_SORTS: ExploreSort[] = ["change", "spread", "cheap", "dear", "popular", "new", "tracked"];
/** The default order of each list. */
export const EXPLORE_DEFAULT_SORT: Record<ExploreList, ExploreSort> = { drops: "change", rises: "change", spread: "spread", all: "popular" };

export async function exploreCatalog(sql: postgres.Sql, x: ExploreQuery): Promise<ExploreResult> {
  const list = x.list;
  // "change" only means something for drops / rises; "spread" needs 2+ sellers.
  let sort = x.sort ?? EXPLORE_DEFAULT_SORT[list];
  if (sort === "change" && list !== "drops" && list !== "rises") sort = EXPLORE_DEFAULT_SORT[list];
  const page = Math.min(EXPLORE.maxPage, Math.max(1, Math.floor(x.page ?? 1)));
  const words = (x.q ?? "").trim().split(/\s+/).filter((w) => w.length > 0).slice(0, 6);
  const min = MOVE_MIN_PCT;

  const base = sql`
    with d as (
      select product_id, (observed_at at time zone 'Asia/Almaty')::date as day, min(min_price) as p
      from price_observations where min_price is not null and observed_at > now() - interval '9 days'
      group by 1, 2),
    today as (select (now() at time zone 'Asia/Almaty')::date as day),
    d2 as (
      select product_id, day, p, lag(p) over w as prev, lead(p) over w as next
      from d window w as (partition by product_id order by day)),
    prior as (
      -- The price a week ago: the earliest daily low 2–7 days back that held two days in a row (equal within
      -- 1% to the observed day before or after it), so a one-day blip is never the reference.
      select distinct on (d2.product_id) d2.product_id, d2.p::int as was
      from d2, today where d2.day < today.day - 1 and d2.day >= today.day - 7
        and ((d2.prev is not null and abs(d2.p - d2.prev) <= d2.prev * 0.01) or (d2.next is not null and abs(d2.p - d2.next) <= d2.next * 0.01))
      order by d2.product_id, d2.day),
    om as (select product_id, percentile_cont(0.5) within group (order by price) as med from offers_current group by 1),
    o as (
      select oc.product_id, min(oc.price)::int as lo, max(oc.price)::int as hi, count(*)::int as n
      from offers_current oc join om on om.product_id = oc.product_id
      where oc.price <= om.med * ${MARKET_CONFIG.spreadOutlier} group by 1),
    -- People with an active tracking (the «tracked» order: the home page's «Чаще всего отслеживают» in full).
    w as (
      select product_id, count(distinct coalesce(watcher_id::text, user_id::text))::int as n
      from trackings where status = 'active' and product_id is not null group by 1),
    b as (
      select p.external_id, p.title, p.title_kk, p.image_url, p.first_seen_at, coalesce(p.kaspi_reviews, 0) as reviews,
             p.category_path[array_length(p.category_path, 1)] as category,
             s.current_min_price as price, coalesce(s.offer_count, 0) as offer_count,
             ${list === "drops" || list === "rises" ? sql`pr.was` : sql`null::int`} as was,
             case when o.n >= 2 then o.lo end as lo, case when o.n >= 2 then o.hi end as hi, coalesce(w.n, 0) as watchers,
             ${sort === "new" ? addedByPerson(sql) : sql`false`} as by_person
      from products p join product_state s on s.product_id = p.id
      left join w on w.product_id = p.id
      left join prior pr on pr.product_id = p.id
      left join o on o.product_id = p.id, today
      where p.status = 'active' and s.current_min_price is not null
        ${list === "drops" ? sql`and s.in_stock and (s.last_checked_at at time zone 'Asia/Almaty')::date >= today.day - 1
          and s.current_min_price <= pr.was * (1 - ${min}::numeric / 100)` : sql``}
        ${list === "rises" ? sql`and s.in_stock and (s.last_checked_at at time zone 'Asia/Almaty')::date >= today.day - 1
          and s.current_min_price >= pr.was * (1 + ${min}::numeric / 100)` : sql``}
        ${list === "spread" ? sql`and s.in_stock and o.n >= 2 and o.lo >= ${EXPLORE.spreadMinPrice}
          and s.last_checked_at > now() - interval '3 days'` : sql``}
        ${words.length ? sql`and ${words.map((w) => sql`(p.title ilike ${likePattern(w)} or p.title_kk ilike ${likePattern(w)})`)
          .reduce((a, c) => sql`${a} and ${c}`)}` : sql``})`;

  const order = {
    change: list === "rises" ? sql`price::numeric / was desc` : sql`price::numeric / was asc`,
    spread: sql`(hi - lo)::numeric / lo desc nulls last`,
    cheap: sql`price asc`,
    dear: sql`price desc`,
    popular: sql`reviews desc, offer_count desc`,
    new: sql`by_person desc, first_seen_at desc`,
    tracked: sql`watchers desc, reviews desc`,
  }[sort];
  const cat = x.category ? sql`where category = ${x.category}` : sql``;

  const rows = await sql<(ExploreItem & { total: number })[]>`
    ${base}
    select external_id as "externalId", title, title_kk as "titleKk", image_url as "imageUrl", category,
           price, offer_count as "offerCount", was,
           case when was > 0 then round((price - was) * 100.0 / was)::int end as pct, lo, hi,
           count(*) over ()::int as total
    from b ${cat}
    order by ${order}, external_id
    limit ${EXPLORE.perPage} offset ${(page - 1) * EXPLORE.perPage}`;
  const categories = await sql<{ name: string; count: number }[]>`
    ${base}
    select category as name, count(*)::int as count from b where category is not null
    group by 1 order by 2 desc, 1 limit ${EXPLORE.categories}`;

  // A page past the end (an old link, a hand-typed URL): show the last page instead.
  const total = rows[0]?.total ?? 0;
  if (!rows.length && page > 1) {
    const [c] = await sql<{ total: number }[]>`${base} select count(*)::int as total from b ${cat}`;
    const last = Math.ceil((c?.total ?? 0) / EXPLORE.perPage);
    if (last >= 1) return exploreCatalog(sql, { ...x, page: last });
  }
  return {
    items: rows.map(({ total: _, ...r }) => r), total, page, pages: Math.max(1, Math.ceil(total / EXPLORE.perPage)), sort,
    categories,
  };
}
