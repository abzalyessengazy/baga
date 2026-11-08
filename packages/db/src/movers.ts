import type postgres from "postgres";
import { lastCompleteShiftDay, MOVE_MIN_PCT, moveDirection } from "@baga/core";

/**
 * Price moves, by the rules in docs/STATS.md. Prices are compared as daily lows (the lowest price of an Almaty
 * calendar day); a difference under MOVE_MIN_PCT is not a change.
 *
 * Week movers (rule W, for /drops, the Z-report week lists, the best drop of the week, the find of the day and the
 * Telegram channel): the current lowest price against the highest (drops) or lowest (rises) daily low of the
 * previous 7 Almaty days. A product needs a check today or yesterday and at least one earlier day, and must be in
 * stock. A drop that has since gone back up is no longer a drop. Biggest change in percent first.
 */
export interface Mover {
  externalId: string; title: string; titleKk: string | null; imageUrl: string | null;
  now: number; was: number; pct: number; offerCount: number; checkedAt: Date;
}

export async function weekMovers(sql: postgres.Sql, dir: "down" | "up", limit = 30, minPct = MOVE_MIN_PCT): Promise<Mover[]> {
  const down = dir === "down";
  return sql<Mover[]>`
    with d as (
      select product_id, (observed_at at time zone 'Asia/Almaty')::date as day, min(min_price) as p
      from price_observations
      where min_price is not null and observed_at > now() - interval '9 days'
      group by 1, 2),
    today as (select (now() at time zone 'Asia/Almaty')::date as day),
    prior as (
      select d.product_id, max(d.p)::int as high, min(d.p)::int as low
      from d, today where d.day < today.day and d.day >= today.day - 7
      group by 1)
    select p.external_id as "externalId", p.title, p.title_kk as "titleKk", p.image_url as "imageUrl",
           s.current_min_price as now, ${down ? sql`pr.high` : sql`pr.low`} as was,
           round((s.current_min_price - ${down ? sql`pr.high` : sql`pr.low`}) * 100.0 / ${down ? sql`pr.high` : sql`pr.low`})::int as pct,
           coalesce(s.offer_count, 0) as "offerCount", s.last_checked_at as "checkedAt"
    from prior pr
    join product_state s on s.product_id = pr.product_id
    join products p on p.id = pr.product_id, today
    where p.status = 'active' and s.in_stock and s.current_min_price is not null
      and (s.last_checked_at at time zone 'Asia/Almaty')::date >= today.day - 1
      and ${down
        ? sql`s.current_min_price <= pr.high * (1 - ${minPct}::numeric / 100)`
        : sql`s.current_min_price >= pr.low * (1 + ${minPct}::numeric / 100)`}
    order by ${down ? sql`s.current_min_price::numeric / pr.high asc` : sql`s.current_min_price::numeric / pr.low desc`}
    limit ${limit}`;
}

export interface DayMoves {
  /** The latest shift: the latest Almaty day with a successful check. */
  day: string | null;
  /** Products with a successful check that day (in stock or not). */
  checked: number;
  /** Of those, products in stock that day with a daily low on the day before too. */
  compared: number;
  /** Cheaper / dearer than their previous daily low by MOVE_MIN_PCT or more; biggest percent first. */
  down: Mover[]; up: Mover[];
}

/**
 * Rule D (docs/STATS.md): the latest shift's daily low of each product against its daily low of the day before
 * (a product not seen in stock the day before is not compared). Used by "Kaspi сегодня", the Z-report totals and its "day" lists.
 */
export async function dayMoves(sql: postgres.Sql, now = new Date()): Promise<DayMoves> {
  // The latest complete shift (docs/STATS.md): a run still in progress is not a day yet. Every checked product has an
  // observation on each checked day (the daily heartbeat), so observations count the products checked that day.
  const cutoff = lastCompleteShiftDay(now);
  const [head] = await sql<{ day: string | null; checked: number }[]>`
    with days as (
      select (o.observed_at at time zone 'Asia/Almaty')::date as day, o.product_id
      from price_observations o join products p on p.id = o.product_id
      where p.status = 'active' and o.observed_at < (${cutoff}::date + 1)::timestamp at time zone 'Asia/Almaty'
        and o.observed_at > now() - interval '60 days'),
    latest as (select max(day) as day from days)
    select to_char(latest.day, 'YYYY-MM-DD') as day,
           (select count(distinct product_id)::int from days where days.day = latest.day) as checked
    from latest`;
  if (!head?.day) return { day: null, checked: 0, compared: 0, down: [], up: [] };
  const rows = await sql<Mover[]>`
    with d as (
      select product_id, (observed_at at time zone 'Asia/Almaty')::date as day, min(min_price)::int as p
      from price_observations where min_price is not null
        and observed_at < (${head.day}::date + 1)::timestamp at time zone 'Asia/Almaty' group by 1, 2),
    r as (select product_id, day, p, row_number() over (partition by product_id order by day desc) as rn from d)
    select p.external_id as "externalId", p.title, p.title_kk as "titleKk", p.image_url as "imageUrl",
           a.p as now, b.p as was, round((a.p - b.p) * 100.0 / b.p)::int as pct,
           coalesce(s.offer_count, 0) as "offerCount", s.last_checked_at as "checkedAt"
    -- The previous day only (8 Nov owner rule): a product missed yesterday has no "today" move; a change across a gap
    -- (6 Nov → 8 Nov) cannot be dated, so it shows only in the week lists.
    from r a join r b on b.product_id = a.product_id and b.rn = 2 and b.day = a.day - 1
    join products p on p.id = a.product_id left join product_state s on s.product_id = a.product_id
    where a.rn = 1 and a.day = ${head.day}::date and p.status = 'active'`;
  const by = (dir: -1 | 1) => rows.filter((m) => moveDirection(m.was, m.now) === dir)
    .sort((x, y) => (y.now - y.was) / y.was * dir - (x.now - x.was) / x.was * dir);
  return { day: head.day, checked: head.checked, compared: rows.length, down: by(-1), up: by(1) };
}
