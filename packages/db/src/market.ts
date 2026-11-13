import type postgres from "postgres";
import { computeVerdict, liveShiftDay, pickOrder, priceNote, sellerLabel, KASPI_VISIT_WINDOW_UTC, SELLER_RULES, type PriceNote, type SellerLabel } from "@baga/core";
import { getDailyLows } from "./queries";
import { dayMoves, stillMoving, weekMovers, type Mover } from "./movers";

/** One product where sellers ask very different prices right now (offers of its latest check). */
export interface MarketSpread { externalId: string; title: string; titleKk: string | null; imageUrl: string | null; lo: number; hi: number; sellers: number }
/** A Kaspi leaf category we watch enough products in. `weekPct` stays null until enough of them have a week of history. */
/** `imageUrl`: the picture of its most reviewed product, as the category's icon. */
export interface MarketCategory { name: string; imageUrl: string | null; products: number; from: number; median: number; weekPct: number | null; compared: number }

/**
 * The home page's find of the day (packages/core/src/pick.ts): one of the week's best drops (rule W), a different
 * one each day, never a product the home page already shows. Only history counts: the cheapest seller against the other sellers' median is not a find (7 Nov 2026:
 * Soundcore Liberty 5 showed −53% against dear resellers while four shops asked the same 27 990 ₸), and a product
 * whose cheapest offer needs a seller check is skipped.
 */
export interface MarketPick {
  kind: "drop";
  externalId: string; title: string; titleKk: string | null; imageUrl: string | null;
  /** The current lowest price, and what it is compared with: the price a week ago (rule W). */
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
  /** `day` is today while it is still being checked (the live day), with its latest check time (ISO). */
  live: boolean; asOf: string | null;
  /** When `day` is an earlier day: today's check starts later ("later", before 09:00 Almaty) or has started but is not
   * shown yet ("running", fewer than LIVE_MIN_CHECKED products so far). Null otherwise. */
  todayCheck: "later" | "running" | null;
  compared: number; down: number; up: number; same: number;
  /** Products seen in stock on the latest shift and on MARKET_CONFIG.lowsMinDays or more days, whose latest daily low is below every earlier one. */
  newLows: number;
  spread: { products: number; over10: number; over25: number; medianPct: number | null; top: MarketSpread[] };
  categories: MarketCategory[];
  /** Biggest drops against the previous 7 days (the same rule as /drops). */
  deals: Mover[];
  pick: MarketPick | null;
  /** Up to PICK.rotate finds, today's turn first (`pick` is the first). */
  picks: MarketPick[];
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
  /** An offer above this many times the product's median offer is not part of its seller gap. */
  spreadOutlier: 2,
  /** A category is listed from this many priced products; its week change needs this many with history. */
  categoryMin: 8, categoryCompared: 5, categoryTop: 8,
  deals: 12,
} as const;

/**
 * Market numbers for the home page (DECISIONS.md, 2026-11-03 "Market today instead of the sample receipt").
 * Everything is counted from observed prices and current offers; nothing is estimated. Queries run one at a time
 * (parallel queries beyond the pool size stall the Supabase pooler).
 */
export async function getMarket(sql: postgres.Sql, now = new Date()): Promise<Market> {
  const c = MARKET_CONFIG;
  const moves = await dayMoves(sql, now);
  const almatyToday = new Date(now.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
  // Almaty minute of the day (UTC+5): before Visit-time opens (09:00 Almaty) today's check is still to come.
  const almatyMinute = (now.getUTCHours() * 60 + now.getUTCMinutes() + 300) % 1440;
  const todayCheck = moves.live || !moves.day || moves.day >= almatyToday ? null
    : liveShiftDay(now) ? "running" as const
    : almatyMinute < KASPI_VISIT_WINDOW_UTC.startMinute + 300 ? "later" as const : null;
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
  // Seller gap (docs/STATS.md): an offer above twice the product's median offer is left out (owner, 11 Nov: one
  // small shop at 759 990 ₸ next to four at 185-203k read as our error, not as a gap a buyer could use). The dearest
  // end only counts shops with enough Kaspi reviews to judge (13 Nov: a 1-review shop at 1 399 858 ₸ next to six
  // shops at 699 990–839 990 ₸ made a "переплата" of 699 868 ₸ nobody would pay).
  const offers = sql`
    with b as (
      select o.product_id, o.price, coalesce(se.reviews, 0) >= ${SELLER_RULES.enoughReviews} as known
      from offers_current o join product_state s on s.product_id = o.product_id
      join products p on p.id = o.product_id join sellers se on se.id = o.seller_id
      where p.status = 'active' and s.in_stock and s.last_checked_at > now() - interval '3 days'),
    m as (select product_id, percentile_cont(0.5) within group (order by price) as med from b group by 1)
    select b.product_id, min(b.price)::int as lo, (max(b.price) filter (where b.known))::int as hi, count(*)::int as sellers, round(m.med)::int as med
    from b join m on m.product_id = b.product_id
    where b.price <= m.med * ${c.spreadOutlier}
    group by b.product_id, m.med having count(*) >= 2 and max(b.price) filter (where b.known) is not null`;
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
  const picks = await picksOfDay(sql, moves, deals);
  const pick = picks[0] ?? null;
  const down = moves.down.length, up = moves.up.length;
  return {
    catalog: catalog ?? { products: 0, sellers: 0, firstDay: null },
    day: moves.day, checked: moves.checked, live: moves.live, asOf: moves.asOf?.toISOString() ?? null, todayCheck,
    compared: moves.compared, down, up, same: moves.compared - down - up,
    newLows: lows?.n ?? 0,
    spread: { products: spread?.products ?? 0, over10: spread?.over10 ?? 0, over25: spread?.over25 ?? 0, medianPct: spread?.median ?? null, top },
    categories, deals, pick, picks, shops,
  };
}

/** The finds of the day: pickOrder's candidates whose cheapest offer does not need a seller check, today's turn first. */
async function picksOfDay(sql: postgres.Sql, moves: Awaited<ReturnType<typeof dayMoves>>, deals: Mover[]): Promise<MarketPick[]> {
  if (!moves.day) return [];
  // The day list's visible rows on the home page (ZReport, 4 rows): not repeated as a find.
  const shown = moves.down.filter(stillMoving).slice(0, DAY_ROWS_SHOWN).map((m) => m.externalId);
  const out: MarketPick[] = [];
  for (const m of pickOrder(deals, moves.day, shown)) {
    const [o] = await sql<{ prices: number[]; rating: number | null; reviews: number | null }[]>`
      select array_agg(o.price order by o.price, se.id) as prices,
             (array_agg(se.rating order by o.price, se.id))[1] as rating, (array_agg(se.reviews order by o.price, se.id))[1] as reviews
      from offers_current o join sellers se on se.id = o.seller_id join products p on p.id = o.product_id
      where p.external_id = ${m.externalId}`;
    const note = o?.prices?.length ? priceNote(o.prices[0]!, o.prices.slice(1), o.rating, o.reviews) : null;
    if (note?.kind === "check") continue;
    // Never a find whose own page says «Дороже обычного» (owner, 12 Nov): the same daily lows and current price as
    // the product page's verdict.
    const [p] = await sql<{ id: number }[]>`select id from products where external_id = ${m.externalId}`;
    if (p && computeVerdict(await getDailyLows(sql, p.id), m.now).kind === "high") continue;
    out.push({ kind: "drop", externalId: m.externalId, title: m.title, titleKk: m.titleKk, imageUrl: m.imageUrl,
      price: m.now, ref: m.was, pct: m.pct, sellers: m.offerCount, note });
  }
  return out;
}

/** Rows of the day list the home page shows before «Смотреть все» (ZReport ROWS_TWO). */
export const DAY_ROWS_SHOWN = 4;
