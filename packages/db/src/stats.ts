import type postgres from "postgres";

/** One Almaty calendar day of collector work. */
export interface StatsDay { day: string; checks: number; drops: number }
/** A price change seen between two consecutive observations of a product. */
export interface StatsMove { externalId: string; title: string; titleKk: string | null; from: number; to: number; at: Date }
/** A product in a plain list (most tracked, newest). */
export interface StatsProduct { externalId: string; title: string; titleKk: string | null; price: number | null; at: Date }
export interface StatsMoves { drops: StatsMove[]; rises: StatsMove[] }

type Change = { external_id: string; title: string; title_kk: string | null; prev: number; min_price: number; observed_at: Date; day: string };

export interface PlatformStats {
  products: number;
  sellers: number;
  checks: number;
  changes: number;
  drops: number;
  alertsSent: number;
  watchers: number;
  lastRun: { startedAt: Date; finishedAt: Date } | null;
  days: StatsDay[];
  /** "day": the latest Almaty day with any change; "week": the last 7 days. One entry per product, biggest first. */
  moves: { day: StatsMoves; week: StatsMoves };
  mostTracked: StatsProduct[];
  newest: StatsProduct[];
}

/**
 * Platform numbers for the home page Z-report (DECISIONS.md, 2026-11-02 "Real numbers on the home page"). All of
 * them are counted from what the collector observed (one price_observations row per successful check); a change or
 * drop needs two observations of a product.
 */
export async function getPlatformStats(sql: postgres.Sql, dayCount = 14, listCount = 12): Promise<PlatformStats> {
  const [totals] = await sql<{ products: number; sellers: number; checks: number; alerts: number; watchers: number }[]>`
    select (select count(*)::int from products where status = 'active') as products,
           (select count(*)::int from sellers) as sellers,
           (select count(*)::int from price_observations) as checks,
           (select count(*)::int from notifications where status = 'sent') as alerts,
           (select count(distinct watcher_id)::int from trackings where watcher_id is not null) as watchers`;
  const [moves] = await sql<{ changes: number; drops: number }[]>`
    with o as (
      select min_price, lag(min_price) over (partition by product_id order by observed_at) as prev
      from price_observations)
    select count(*) filter (where min_price is not null and prev is not null and min_price <> prev)::int as changes,
           count(*) filter (where min_price < prev)::int as drops
    from o`;
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
  // Every change of the last 7 days; picked per period and direction below.
  const changes: Change[] = await sql<Change[]>`
    with o as (
      select product_id, observed_at, min_price,
             lag(min_price) over (partition by product_id order by observed_at) as prev
      from price_observations
      where observed_at > now() - interval '15 days')
    select p.external_id, p.title, p.title_kk, o.prev, o.min_price, o.observed_at,
           to_char((o.observed_at at time zone 'Asia/Almaty')::date, 'YYYY-MM-DD') as day
    from o join products p on p.id = o.product_id
    where o.prev is not null and o.min_price is not null and o.min_price <> o.prev
      and o.observed_at > now() - interval '7 days' and p.status = 'active'`;
  const latestDay = changes.reduce((m, c) => (c.day > m ? c.day : m), "");
  const pick = (rows: Change[], dir: 1 | -1): StatsMove[] => {
    const best = new Map<string, Change>();
    for (const r of rows) {
      const size = (r.min_price - r.prev) * dir;
      if (size <= 0) continue;
      const had = best.get(r.external_id);
      if (!had || size > (had.min_price - had.prev) * dir) best.set(r.external_id, r);
    }
    return [...best.values()]
      .sort((a, b) => (b.min_price - b.prev) * dir - (a.min_price - a.prev) * dir)
      .slice(0, listCount)
      .map((r) => ({ externalId: r.external_id, title: r.title, titleKk: r.title_kk, from: r.prev, to: r.min_price, at: r.observed_at }));
  };
  const today = changes.filter((c) => c.day === latestDay);
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
    checks: totals!.checks,
    changes: moves!.changes,
    drops: moves!.drops,
    alertsSent: totals!.alerts,
    watchers: totals!.watchers,
    lastRun: last ? { startedAt: last.started_at, finishedAt: last.finished_at } : null,
    days: days.reverse(),
    moves: { day: { drops: pick(today, -1), rises: pick(today, 1) }, week: { drops: pick(changes, -1), rises: pick(changes, 1) } },
    mostTracked: tracked.map(product),
    newest: newest.map(product),
  };
}
