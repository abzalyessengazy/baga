import type postgres from "postgres";
import { dayMoves, weekMovers, type Mover } from "./movers";

/** One Almaty calendar day of collector work. */
export interface StatsDay { day: string; checks: number; drops: number }
/** A price move by rule D or W (docs/STATS.md): from the earlier daily low to the current one. */
export interface StatsMove { externalId: string; title: string; titleKk: string | null; from: number; to: number; pct: number; at: Date }
/** A product in a plain list (most tracked, newest). */
export interface StatsProduct { externalId: string; title: string; titleKk: string | null; price: number | null; at: Date }
export interface StatsMoves { drops: StatsMove[]; rises: StatsMove[] }

export interface PlatformStats {
  /** Active products (all time). */
  products: number;
  /** Sellers with an offer in the latest check of an active product. */
  sellers: number;
  /** The latest shift (rule D): products checked, how many changed by MOVE_MIN_PCT, how many of them got cheaper. */
  checks: number;
  changes: number;
  drops: number;
  alertsSent: number;
  watchers: number;
  lastRun: { startedAt: Date; finishedAt: Date } | null;
  days: StatsDay[];
  /** "day": rule D (latest shift vs previous daily low); "week": rule W (now vs the previous 7 days). Biggest percent first. */
  moves: { day: StatsMoves; week: StatsMoves };
  mostTracked: StatsProduct[];
  newest: StatsProduct[];
}

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
  const move = (m: Mover): StatsMove => ({ externalId: m.externalId, title: m.title, titleKk: m.titleKk, from: m.was, to: m.now, pct: m.pct, at: m.checkedAt });
  const product = (r: { external_id: string; title: string; title_kk: string | null; price: number | null; at: Date }): StatsProduct =>
    ({ externalId: r.external_id, title: r.title, titleKk: r.title_kk, price: r.price, at: r.at });
  // Ordered by how many watchers track a product; the counts themselves stay private while they are small.
  const tracked = await sql<{ external_id: string; title: string; title_kk: string | null; price: number | null; at: Date }[]>`
    select p.external_id, p.title, p.title_kk, s.current_min_price as price, max(t.created_at) as at
    from trackings t join products p on p.id = t.product_id left join product_state s on s.product_id = p.id
    where p.status = 'active'
    group by p.id, s.current_min_price
    order by count(*) desc, max(t.created_at) desc limit ${listCount}`;
  const newest = await sql<{ external_id: string; title: string; title_kk: string | null; price: number | null; at: Date }[]>`
    select p.external_id, p.title, p.title_kk, s.current_min_price as price, p.first_seen_at as at
    from products p join product_state s on s.product_id = p.id
    where p.status = 'active' and s.current_min_price is not null
    order by p.first_seen_at desc limit ${listCount}`;
  return {
    products: totals!.products,
    sellers: totals!.sellers,
    checks: day.checked,
    changes: day.down.length + day.up.length,
    drops: day.down.length,
    alertsSent: totals!.alerts,
    watchers: totals!.watchers,
    lastRun: last ? { startedAt: last.started_at, finishedAt: last.finished_at } : null,
    days: days.reverse(),
    moves: {
      day: { drops: day.down.slice(0, listCount).map(move), rises: day.up.slice(0, listCount).map(move) },
      week: { drops: weekDown.map(move), rises: weekUp.map(move) },
    },
    mostTracked: tracked.map(product),
    newest: newest.map(product),
  };
}
