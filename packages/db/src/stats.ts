import type postgres from "postgres";
import { dayMoves, stillMoving, weekMovers, type Mover } from "./movers";

/** One Almaty calendar day of collector work. */
export interface StatsDay { day: string; checks: number; drops: number }
/** A price move by rule D or W (docs/STATS.md): from the earlier daily low to the current one. */
export interface StatsMove { externalId: string; title: string; titleKk: string | null; imageUrl: string | null; from: number; to: number; pct: number; at: Date }
/**
 * A product a person brought to BAĞA (8 Nov owner rule: «Новые в BAĞA» shows these first within their day, before the
 * collector's catalog additions; NEWEST_ORDER): not a catalog seed, and a visitor opened its page before we first collected it,
 * or tracked it within a day. (Rare-category seeds below their price floor are not seeds either, but nobody asked
 * for them.) Uses the alias `p` for products.
 */
export const addedByPerson = (sql: postgres.Sql) => sql`(not p.is_seed and (
  exists (select 1 from events e where e.external_id = p.external_id and e.at <= p.first_seen_at)
  or exists (select 1 from trackings t where t.product_id = p.id and t.created_at <= p.first_seen_at + interval '1 day')))`;

/**
 * «Новые в BAĞA» order (owner, 12 Nov: the old order put every person-added product first whatever its date, so the list
 * showed 9–11 Nov, one product a day, and looked as if we added 1–2 products a day): the newest Almaty day first; within
 * a day, products people brought first, then the collector's additions. Uses the alias `p`.
 */
export const NEWEST_ORDER = (sql: postgres.Sql) =>
  sql`(p.first_seen_at at time zone 'Asia/Almaty')::date desc, ${addedByPerson(sql)} desc, p.first_seen_at desc`;

/**
 * «Чаще всего отслеживают» lists a product from this many people tracking it: 1 since 14 Nov 2026 (the owner: with 2,
 * one product qualified and the list showed a single row). Most people first, then the latest tracked.
 */
export const MIN_TRACKERS = 1;

/** A product in a plain list (most tracked, newest). */
export interface StatsProduct { externalId: string; title: string; titleKk: string | null; imageUrl: string | null; price: number | null; at: Date }
export interface StatsMoves { drops: StatsMove[]; rises: StatsMove[] }

export interface PlatformStats {
  /** Active products (all time). */
  products: number;
  /** Sellers with an offer in the latest check of an active product. */
  sellers: number;
  /** The latest shift (rule D): products checked, how many changed by MOVE_MIN_PCT, how many of them got cheaper. */
  /** The latest complete shift (rule D) that checks, changes and drops are counted for. */
  shiftDay: string | null;
  checks: number;
  changes: number;
  drops: number;
  rises: number;
  alertsSent: number;
  watchers: number;
  lastRun: { startedAt: Date; finishedAt: Date } | null;
  /** The runs of the shift day: first start to last check that day (the Z-report head names the day its numbers are for). */
  shiftRun: { startedAt: Date; finishedAt: Date } | null;
  days: StatsDay[];
  /** "day": rule D (latest shift vs previous daily low); "week": rule W (now vs the previous 7 days). Biggest percent first. */
  moves: { day: StatsMoves; week: StatsMoves };
  mostTracked: StatsProduct[];
  newest: StatsProduct[];
  /** The day's moves again (rule D), ordered by the difference in tenge instead of percent (the owner, 13 Nov). */
  tenge: StatsMoves;
  /** Products whose daily low has not changed for the most observed days in a row, up to today. */
  stable: StatsStable[];
  /** Shops with offers on our products by Kaspi's own rating, from SHOP_BOARD_MIN_REVIEWS reviews. */
  shops: { top: StatsShop[]; low: StatsShop[] };
}

/** A product with one unchanged daily low: `days` observed days in a row, the first of them `since`. */
export interface StatsStable extends StatsProduct { days: number; since: string }
export interface StatsShop { externalId: string; name: string; rating: number; reviews: number; products: number }
/** A shop is listed by rating only with this many Kaspi reviews: fewer say little either way. */
export const SHOP_BOARD_MIN_REVIEWS = 100;
/** «Самая стабильная цена» needs this many observed days at one price. */
export const STABLE_MIN_DAYS = 5;

/**
 * Platform numbers for the home page Z-report, by the rules in docs/STATS.md. Everything is counted from observed
 * prices; a change needs two observed days of a product and MOVE_MIN_PCT of difference.
 */
export async function getPlatformStats(sql: postgres.Sql, dayCount = 14, listCount = 12): Promise<PlatformStats> {
  const [totals] = await sql<{ products: number; sellers: number; alerts: number; watchers: number }[]>`
    select (select count(*)::int from products where status = 'active') as products,
           (select count(distinct o.seller_id)::int from offers_current o join products p on p.id = o.product_id
            where p.status = 'active') as sellers,
           (select count(*)::int from notifications where status = 'sent') as alerts,
           (select count(distinct watcher_id)::int from trackings where watcher_id is not null) as watchers`;
  const day = await dayMoves(sql);
  // The run of the latest observation, from its start to its latest check so far: the numbers move while a run
  // is still going, and a cancelled run counts too (collection_runs.checked is only written when a run ends).
  const [last] = await sql<{ started_at: Date; finished_at: Date }[]>`
    select r.started_at, max(o.observed_at) as finished_at
    from price_observations o join collection_runs r on r.id = o.run_id
    group by r.id order by max(o.observed_at) desc limit 1`;
  const [shift] = day.day ? await sql<{ started_at: Date | null; finished_at: Date | null }[]>`
    select min(r.started_at) as started_at, max(o.observed_at) as finished_at
    from price_observations o join collection_runs r on r.id = o.run_id
    where (o.observed_at at time zone 'Asia/Almaty')::date = ${day.day}::date` : [];
  const days = await sql<{ day: string; checks: number; drops: number }[]>`
    with r as (
      select ((observed_at at time zone 'Asia/Almaty')::date) as day, count(*)::int as checks
      from price_observations group by 1),
    o as (
      select observed_at, min_price, lag(min_price) over (partition by product_id order by observed_at) as prev
      from price_observations),
    d as (
      select ((observed_at at time zone 'Asia/Almaty')::date) as day, count(*)::int as drops
      from o where min_price < prev group by 1)
    select to_char(r.day, 'YYYY-MM-DD') as day, r.checks, coalesce(d.drops, 0)::int as drops
    from r left join d using (day) order by r.day desc limit ${dayCount}`;
  const weekDown = await weekMovers(sql, "down", listCount);
  const weekUp = await weekMovers(sql, "up", listCount);
  const move = (m: Mover): StatsMove => ({ externalId: m.externalId, title: m.title, titleKk: m.titleKk, imageUrl: m.imageUrl, from: m.was, to: m.now, pct: m.pct, at: m.checkedAt });
  const product = (r: { external_id: string; title: string; title_kk: string | null; image_url: string | null; price: number | null; at: Date }): StatsProduct =>
    ({ externalId: r.external_id, title: r.title, titleKk: r.title_kk, imageUrl: r.image_url, price: r.price, at: r.at });
  // Ordered by how many people track a product; the counts themselves stay private while they are small. Only
  // products with a price that MIN_TRACKERS or more people track (owner, 11 Nov: 2, as with one person each "most tracked"
  // was really "recently tracked"; back to 1 on 14 Nov, the owner's choice). The slip hides itself until there is one.
  const tracked = await sql<{ external_id: string; title: string; title_kk: string | null; image_url: string | null; price: number | null; at: Date }[]>`
    select p.external_id, p.title, p.title_kk, p.image_url, s.current_min_price as price, max(t.created_at) as at
    from trackings t join products p on p.id = t.product_id join product_state s on s.product_id = p.id
    where p.status = 'active' and t.status <> 'removed' and s.current_min_price is not null
      and not exists (select 1 from watchers tw where tw.id = t.watcher_id and tw.internal)
    group by p.id, s.current_min_price
    having count(distinct coalesce(t.watcher_id::text, t.user_id::text)) >= ${MIN_TRACKERS}
    order by count(distinct coalesce(t.watcher_id::text, t.user_id::text)) desc, max(t.created_at) desc limit ${listCount}`;
  const newest = await sql<{ external_id: string; title: string; title_kk: string | null; image_url: string | null; price: number | null; at: Date }[]>`
    select p.external_id, p.title, p.title_kk, p.image_url, s.current_min_price as price, p.first_seen_at as at
    from products p join product_state s on s.product_id = p.id
    where p.status = 'active' and s.current_min_price is not null
    order by ${NEWEST_ORDER(sql)} limit ${listCount}`;
  // The same daily low on every observed day back from the latest one: the streak ends at the first different day.
  const stable = await sql<{ external_id: string; title: string; title_kk: string | null; image_url: string | null; price: number; at: Date; days: number; since: string }[]>`
    with d as (
      select product_id, (observed_at at time zone 'Asia/Almaty')::date as day, min(min_price)::int as p
      from price_observations where min_price is not null and observed_at > now() - interval '60 days' group by 1, 2),
    l as (select product_id, day, p, first_value(p) over (partition by product_id order by day desc) as last from d),
    r as (select product_id, day, p, last, sum((p <> last)::int) over (partition by product_id order by day desc) as broke from l),
    k as (select product_id, count(*)::int as days, min(day) as since, max(day) as till, max(last) as p from r where broke = 0 group by 1)
    select p.external_id, p.title, p.title_kk, p.image_url, s.current_min_price as price, s.last_checked_at as at,
           k.days, to_char(k.since, 'YYYY-MM-DD') as since
    from k join products p on p.id = k.product_id join product_state s on s.product_id = p.id
    where p.status = 'active' and s.in_stock and s.current_min_price = k.p and k.days >= ${STABLE_MIN_DAYS}
      and k.till >= (now() at time zone 'Asia/Almaty')::date - 1
    order by k.days desc, coalesce(p.kaspi_reviews, 0) desc, p.id limit ${listCount}`;
  const shopRows = (best: boolean) => sql<StatsShop[]>`
    select se.external_id as "externalId", se.name, round(se.rating::numeric, 1)::float8 as rating, se.reviews, count(*)::int as products
    from sellers se join offers_current o on o.seller_id = se.id join products p on p.id = o.product_id and p.status = 'active'
    where se.rating is not null and se.rating > 0 and se.reviews >= ${SHOP_BOARD_MIN_REVIEWS}
    group by se.id
    order by se.rating ${best ? sql`desc` : sql`asc`}, se.reviews desc, se.id limit ${listCount}`;
  const byTenge = (rows: Mover[]) => rows.filter(stillMoving).sort((a, b) => Math.abs(b.now - b.was) - Math.abs(a.now - a.was)).slice(0, listCount).map(move);
  return {
    tenge: { drops: byTenge(day.down), rises: byTenge(day.up) },
    stable: stable.map((r) => ({ ...product(r), days: r.days, since: r.since })),
    shops: { top: await shopRows(true), low: await shopRows(false) },
    products: totals!.products,
    sellers: totals!.sellers,
    shiftDay: day.day,
    checks: day.checked,
    changes: day.down.length + day.up.length,
    drops: day.down.length,
    rises: day.up.length,
    alertsSent: totals!.alerts,
    watchers: totals!.watchers,
    lastRun: last ? { startedAt: last.started_at, finishedAt: last.finished_at } : null,
    shiftRun: shift?.started_at && shift.finished_at ? { startedAt: shift.started_at, finishedAt: shift.finished_at } : null,
    days: days.reverse(),
    moves: {
      day: { drops: day.down.filter(stillMoving).slice(0, listCount).map(move), rises: day.up.filter(stillMoving).slice(0, listCount).map(move) },
      week: { drops: weekDown.map(move), rises: weekUp.map(move) },
    },
    mostTracked: tracked.map(product),
    newest: newest.map(product),
  };
}
