import type postgres from "postgres";
import { weekMovers, type Mover } from "./movers";

/** One product where sellers ask very different prices right now (offers of its latest check). */
export interface MarketSpread { externalId: string; title: string; titleKk: string | null; lo: number; hi: number; sellers: number }
/** A Kaspi leaf category we watch enough products in. `weekPct` stays null until enough of them have a week of history. */
export interface MarketCategory { name: string; products: number; from: number; median: number; weekPct: number | null; compared: number }

export interface Market {
  /** The latest Almaty day with a successful check, and how many products were checked that day. */
  day: string | null;
  checked: number;
  /** Products checked on two different days: their latest daily low against the previous one. */
  compared: number; down: number; up: number; same: number;
  /** Products with at least MARKET_CONFIG.lowsMinDays observed days whose latest price is below every earlier one. */
  newLows: number;
  spread: { products: number; over10: number; over25: number; medianPct: number | null; top: MarketSpread[] };
  categories: MarketCategory[];
  /** Biggest drops against the previous 7 days (the same rule as /drops). */
  deals: Mover[];
}

export const MARKET_CONFIG = {
  lowsMinDays: 7,
  /** Seller spread: in-stock products with 2+ sellers checked in the last 3 days; cheap accessories are left out of the list. */
  spreadMinPrice: 5_000, spreadTop: 12,
  /** A category is listed from this many priced products; its week change needs this many with history. */
  categoryMin: 8, categoryCompared: 5, categoryTop: 8,
  deals: 12,
} as const;

/**
 * Market numbers for the home page (DECISIONS.md, 2026-11-03 "Market today instead of the sample receipt").
 * Everything is counted from observed prices and current offers; nothing is estimated. Queries run one at a time
 * (parallel queries beyond the pool size stall the Supabase pooler).
 */
export async function getMarket(sql: postgres.Sql): Promise<Market> {
  const c = MARKET_CONFIG;
  const [moves] = await sql<{ day: string | null; checked: number; compared: number; down: number; up: number; same: number; lows: number }[]>`
    with d as (
      select product_id, (observed_at at time zone 'Asia/Almaty')::date as day, min(min_price) as p
      from price_observations where min_price is not null group by 1, 2),
    r as (
      select product_id, day, p, row_number() over (w order by day desc) as rn, count(*) over w as days,
             min(p) over (w order by day rows between unbounded preceding and 1 preceding) as before_low
      from d window w as (partition by product_id)),
    latest as (select max(day) as day from d),
    a as (select r.* from r, latest where r.rn = 1 and r.day >= latest.day - 1),
    b as (select * from r where rn = 2)
    select to_char((select day from latest), 'YYYY-MM-DD') as day,
           (select count(*)::int from a, latest where a.day = latest.day) as checked,
           count(b.p)::int as compared,
           count(*) filter (where a.p < b.p)::int as down,
           count(*) filter (where a.p > b.p)::int as up,
           count(*) filter (where a.p = b.p)::int as same,
           count(*) filter (where a.days >= ${c.lowsMinDays} and a.p < a.before_low)::int as lows
    from a join b using (product_id)`;
  const offers = sql`
    select o.product_id, min(o.price)::int as lo, max(o.price)::int as hi, count(*)::int as sellers
    from offers_current o join product_state s on s.product_id = o.product_id join products p on p.id = o.product_id
    where p.status = 'active' and s.in_stock and s.last_checked_at > now() - interval '3 days'
    group by 1 having count(*) >= 2`;
  const [spread] = await sql<{ products: number; over10: number; over25: number; median: number | null }[]>`
    with x as (${offers})
    select count(*)::int as products,
           count(*) filter (where hi >= lo * 1.10)::int as over10,
           count(*) filter (where hi >= lo * 1.25)::int as over25,
           round(percentile_cont(0.5) within group (order by (hi - lo) * 100.0 / lo))::int as median
    from x`;
  const top = await sql<MarketSpread[]>`
    with x as (${offers})
    select p.external_id as "externalId", p.title, p.title_kk as "titleKk", x.lo, x.hi, x.sellers
    from x join products p on p.id = x.product_id
    where x.lo >= ${c.spreadMinPrice}
    order by (x.hi - x.lo)::numeric / x.lo desc limit ${c.spreadTop}`;
  const categories = await sql<MarketCategory[]>`
    with d as (
      select product_id, (observed_at at time zone 'Asia/Almaty')::date as day, min(min_price) as p
      from price_observations where min_price is not null and observed_at > now() - interval '10 days' group by 1, 2),
    today as (select (now() at time zone 'Asia/Almaty')::date as day),
    was as (
      select distinct on (product_id) product_id, p from d, today
      where d.day >= today.day - 7 and d.day < today.day - 1 order by product_id, d.day),
    x as (
      select p.category_path[array_length(p.category_path, 1)] as name, s.current_min_price as now, w.p as was
      from products p join product_state s on s.product_id = p.id left join was w on w.product_id = p.id, today
      where p.status = 'active' and s.in_stock and s.current_min_price is not null and array_length(p.category_path, 1) > 0
        and (s.last_checked_at at time zone 'Asia/Almaty')::date >= today.day - 1)
    select name, count(*)::int as products, min(now)::int as "from",
           round(percentile_cont(0.5) within group (order by now))::int as median,
           count(was)::int as compared,
           case when count(was) >= ${c.categoryCompared}
             then round(percentile_cont(0.5) within group (order by (now - was) * 100.0 / was) filter (where was is not null))::int end as "weekPct"
    from x group by name having count(*) >= ${c.categoryMin}
    order by count(*) desc limit ${c.categoryTop}`;
  const deals = await weekMovers(sql, "down", c.deals);
  return {
    day: moves?.day ?? null, checked: moves?.checked ?? 0,
    compared: moves?.compared ?? 0, down: moves?.down ?? 0, up: moves?.up ?? 0, same: moves?.same ?? 0,
    newLows: moves?.lows ?? 0,
    spread: { products: spread?.products ?? 0, over10: spread?.over10 ?? 0, over25: spread?.over25 ?? 0, medianPct: spread?.median ?? null, top },
    categories, deals,
  };
}
