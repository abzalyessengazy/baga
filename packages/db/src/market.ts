import type postgres from "postgres";
import { priceNote, sellerLabel, type PriceNote, type SellerLabel } from "@baga/core";
import { dayMoves, weekMovers, type Mover } from "./movers";

/** One product where sellers ask very different prices right now (offers of its latest check). */
export interface MarketSpread { externalId: string; title: string; titleKk: string | null; imageUrl: string | null; lo: number; hi: number; sellers: number }
/** A Kaspi leaf category we watch enough products in. `weekPct` stays null until enough of them have a week of history. */
/** `imageUrl`: the picture of its most reviewed product, as the category's icon. */
export interface MarketCategory { name: string; imageUrl: string | null; products: number; from: number; median: number; weekPct: number | null; compared: number }

/**
 * The home page's find of the day, with the reason it was picked: the biggest week drop (rule W) or the product
 * whose cheapest seller is furthest below the median of its sellers' prices, whichever is bigger in percent.
 */
export interface MarketPick {
  kind: "drop" | "seller";
  externalId: string; title: string; titleKk: string | null; imageUrl: string | null;
  /** The current lowest price, and what it is compared with: the week's high (drop) or the sellers' median (seller). */
  price: number; ref: number; pct: number; sellers: number;
  /** The cheapest offer far below the other sellers (priceNote): "check" adds "проверьте продавца". */
  note?: PriceNote;
}

export interface Market {
  /** The whole catalog, shown first: priced active products, distinct sellers in current offers, first observed day. */
  catalog: { products: number; sellers: number; firstDay: string | null };
  /** Rule D (docs/STATS.md): the latest shift, products checked, compared with an earlier day, and changed by MOVE_MIN_PCT. */
  day: string | null;
  checked: number;
  compared: number; down: number; up: number; same: number;
  /** Products seen in stock on the latest shift and on MARKET_CONFIG.lowsMinDays or more days, whose latest daily low is below every earlier one. */
  newLows: number;
  spread: { products: number; over10: number; over25: number; medianPct: number | null; top: MarketSpread[] };
  categories: MarketCategory[];
  /** Biggest drops against the previous 7 days (the same rule as /drops). */
  deals: Mover[];
  pick: MarketPick | null;
  /**
   * Shop evidence (DECISIONS.md, 2026-11-05 "Shop evidence, not verdicts"): the shops in current offers by the
   * label of their Kaspi rating (sellerLabel), and the products whose cheapest offer is far below the other sellers
   * from a shop that is not established (priceNote "check"). The same rules as the seller table.
   */
  shops: Record<SellerLabel, number> & { cheapOffers: number };
}

export const MARKET_CONFIG = {
  lowsMinDays: 7,
  /** Seller spread: in-stock products with 2+ sellers checked in the last 3 days; cheap accessories are left out of the list. */
  spreadMinPrice: 5_000, spreadTop: 12,
  /**
   * The seller pick: a price where the gap means real money, and 4+ sellers (the cheapest against 3+ others, as
   * SELLER_RULES.cheapOutlierMinOthers: with 2 others their "usual price" may just be two dear shops).
   */
  pickMinSellers: 4, pickMinPrice: 20_000,
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
  const moves = await dayMoves(sql);
  const [catalog] = await sql<{ products: number; sellers: number; firstDay: string | null }[]>`
    select (select count(*)::int from products p join product_state s on s.product_id = p.id
            where p.status = 'active' and s.current_min_price is not null) as products,
           (select count(distinct o.seller_id)::int from offers_current o join products p on p.id = o.product_id
            where p.status = 'active') as sellers,
           (select to_char(min((observed_at at time zone 'Asia/Almaty')::date), 'YYYY-MM-DD') from price_observations) as "firstDay"`;
  const shopRows = await sql<{ rating: number | null; reviews: number | null }[]>`
    select se.rating, se.reviews from sellers se
    where exists (select 1 from offers_current o join products p on p.id = o.product_id where o.seller_id = se.id and p.status = 'active')`;
  const shops = { high: 0, mixed: 0, low: 0, few: 0, none: 0, cheapOffers: 0 } as Market["shops"];
  for (const r of shopRows) shops[sellerLabel(r.rating, r.reviews)]++;
  const priceLists = await sql<{ prices: number[]; rating: number | null; reviews: number | null }[]>`
    select array_agg(o.price order by o.price, se.id) as prices,
           (array_agg(se.rating order by o.price, se.id))[1] as rating, (array_agg(se.reviews order by o.price, se.id))[1] as reviews
    from offers_current o join sellers se on se.id = o.seller_id join products p on p.id = o.product_id
    join product_state s on s.product_id = p.id
    where p.status = 'active' and s.in_stock and s.last_checked_at > now() - interval '3 days'
    group by o.product_id having count(*) >= 4`;
  for (const r of priceLists) if (priceNote(r.prices[0]!, r.prices.slice(1), r.rating, r.reviews)?.kind === "check") shops.cheapOffers++;
  const [lows] = moves.day ? await sql<{ n: number }[]>`
    with d as (
      select product_id, (observed_at at time zone 'Asia/Almaty')::date as day, min(min_price) as p
      from price_observations where min_price is not null
        and observed_at < (${moves.day}::date + 1)::timestamp at time zone 'Asia/Almaty' group by 1, 2),
    r as (
      select product_id, day, p, row_number() over (w order by day desc) as rn, count(*) over w as days,
             min(p) over (w order by day rows between unbounded preceding and 1 preceding) as before_low
      from d window w as (partition by product_id))
    select count(*)::int as n from r
    where rn = 1 and day = ${moves.day}::date and days >= ${c.lowsMinDays} and p < before_low` : [];
  const offers = sql`
    select o.product_id, min(o.price)::int as lo, max(o.price)::int as hi, count(*)::int as sellers,
           round(percentile_cont(0.5) within group (order by o.price))::int as med
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
    select p.external_id as "externalId", p.title, p.title_kk as "titleKk", p.image_url as "imageUrl", x.lo, x.hi, x.sellers
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
      select p.category_path[array_length(p.category_path, 1)] as name, s.current_min_price as now, w.p as was,
             p.image_url, coalesce(p.kaspi_reviews, 0) as reviews
      from products p join product_state s on s.product_id = p.id left join was w on w.product_id = p.id, today
      where p.status = 'active' and s.in_stock and s.current_min_price is not null and array_length(p.category_path, 1) > 0
        and (s.last_checked_at at time zone 'Asia/Almaty')::date >= today.day - 1)
    select name, (array_agg(image_url order by reviews desc) filter (where image_url is not null))[1] as "imageUrl",
           count(*)::int as products, min(now)::int as "from",
           round(percentile_cont(0.5) within group (order by now))::int as median,
           count(was)::int as compared,
           case when count(was) >= ${c.categoryCompared}
             then round(percentile_cont(0.5) within group (order by (now - was) * 100.0 / was) filter (where was is not null))::int end as "weekPct"
    from x group by name having count(*) >= ${c.categoryMin}
    order by count(*) desc limit ${c.categoryTop}`;
  const deals = await weekMovers(sql, "down", c.deals);
  const d = deals[0];
  const drop: MarketPick | null = d ? { kind: "drop", externalId: d.externalId, title: d.title, titleKk: d.titleKk,
    imageUrl: d.imageUrl, price: d.now, ref: d.was, pct: d.pct, sellers: d.offerCount } : null;
  const [x] = await sql<Omit<MarketPick, "kind">[]>`
    with x as (${offers})
    select p.external_id as "externalId", p.title, p.title_kk as "titleKk", p.image_url as "imageUrl",
           x.lo as price, x.med as ref, round((x.lo - x.med) * 100.0 / x.med)::int as pct, x.sellers
    from x join products p on p.id = x.product_id
    where x.sellers >= ${c.pickMinSellers} and x.lo >= ${c.pickMinPrice} and x.med > x.lo
    order by (x.med - x.lo)::numeric / x.med desc limit 1`;
  const seller: MarketPick | null = x ? { kind: "seller", ...x } : null;
  const pick = drop && (!seller || Math.abs(drop.pct) >= Math.abs(seller.pct)) ? drop : seller;
  // The find of the day says what the seller table would say about its cheapest offer.
  if (pick) {
    const [o] = await sql<{ prices: number[]; rating: number | null; reviews: number | null }[]>`
      select array_agg(o.price order by o.price, se.id) as prices,
             (array_agg(se.rating order by o.price, se.id))[1] as rating, (array_agg(se.reviews order by o.price, se.id))[1] as reviews
      from offers_current o join sellers se on se.id = o.seller_id join products p on p.id = o.product_id
      where p.external_id = ${pick.externalId}`;
    pick.note = o?.prices?.length ? priceNote(o.prices[0]!, o.prices.slice(1), o.rating, o.reviews) : null;
  }
  const down = moves.down.length, up = moves.up.length;
  return {
    catalog: catalog ?? { products: 0, sellers: 0, firstDay: null },
    day: moves.day, checked: moves.checked,
    compared: moves.compared, down, up, same: moves.compared - down - up,
    newLows: lows?.n ?? 0,
    spread: { products: spread?.products ?? 0, over10: spread?.over10 ?? 0, over25: spread?.over25 ?? 0, medianPct: spread?.median ?? null, top },
    categories, deals, pick, shops,
  };
}
