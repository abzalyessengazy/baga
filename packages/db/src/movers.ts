import type postgres from "postgres";
import { lastCompleteShiftDay, liveShiftDay, LIVE_MIN_CHECKED, MOVE_MIN_PCT, moveDirection } from "@baga/core";

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
  /** The latest lowest price (product_state), which may be newer than `now` in a day list. */
  current: number | null;
}

/**
 * Rule W (docs/STATS.md): the current lowest price against the price a week ago, i.e. the product's earliest daily
 * low 2–7 days before today that held two days in a row (owner, 11 Nov: against the week's highest or lowest day, a one-day blip that came back
 * showed as a move). Biggest percent first.
 */
export async function weekMovers(sql: postgres.Sql, dir: "down" | "up", limit = 30, minPct = MOVE_MIN_PCT): Promise<Mover[]> {
  const down = dir === "down";
  return sql<Mover[]>`
    with d as (
      select product_id, (observed_at at time zone 'Asia/Almaty')::date as day, min(min_price) as p
      from price_observations
      where min_price is not null and observed_at > now() - interval '9 days'
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
      order by d2.product_id, d2.day)
    select p.external_id as "externalId", p.title, p.title_kk as "titleKk", p.image_url as "imageUrl",
           s.current_min_price as now, pr.was,
           round((s.current_min_price - pr.was) * 100.0 / pr.was)::int as pct,
           coalesce(s.offer_count, 0) as "offerCount", s.last_checked_at as "checkedAt", s.current_min_price as current
    from prior pr
    join product_state s on s.product_id = pr.product_id
    join products p on p.id = pr.product_id, today
    where p.status = 'active' and s.in_stock and s.current_min_price is not null
      and (s.last_checked_at at time zone 'Asia/Almaty')::date >= today.day - 1
      and ${down
        ? sql`s.current_min_price <= pr.was * (1 - ${minPct}::numeric / 100)`
        : sql`s.current_min_price >= pr.was * (1 + ${minPct}::numeric / 100)`}
    order by s.current_min_price::numeric / pr.was ${down ? sql`asc` : sql`desc`}
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
  /** Today while it is still being checked (the live day), with the time of its latest check; false for a complete day. */
  live: boolean; asOf: Date | null;
}

/**
 * Rule D (docs/STATS.md): the latest shift's daily low of each product against its daily low of the day before
 * (a product not seen in stock the day before is not compared). Used by "Kaspi сегодня", the Z-report totals and its "day" lists.
 */
export async function dayMoves(sql: postgres.Sql, now = new Date()): Promise<DayMoves> {
  // The live day (owner, 12 Nov 2026): during Visit-time, today once LIVE_MIN_CHECKED products were checked.
  const today = liveShiftDay(now);
  if (today) {
    const [c] = await sql<{ n: number; at: Date | null }[]>`
      select count(distinct o.product_id)::int as n, max(o.observed_at) as at
      from price_observations o join products p on p.id = o.product_id
      where p.status = 'active' and o.observed_at >= (${today}::date)::timestamp at time zone 'Asia/Almaty'`;
    if (c && c.n >= LIVE_MIN_CHECKED) return liveDayMoves(sql, today, c.n, c.at);
  }
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
  if (!head?.day) return { day: null, checked: 0, compared: 0, down: [], up: [], live: false, asOf: null };
  const rows = await sql<Mover[]>`
    with d as (
      select product_id, (observed_at at time zone 'Asia/Almaty')::date as day, min(min_price)::int as p
      from price_observations where min_price is not null
        and observed_at < (${head.day}::date + 1)::timestamp at time zone 'Asia/Almaty' group by 1, 2),
    r as (select product_id, day, p, row_number() over (partition by product_id order by day desc) as rn from d)
    select p.external_id as "externalId", p.title, p.title_kk as "titleKk", p.image_url as "imageUrl",
           a.p as now, b.p as was, round((a.p - b.p) * 100.0 / b.p)::int as pct,
           coalesce(s.offer_count, 0) as "offerCount", s.last_checked_at as "checkedAt", s.current_min_price as current
    -- The previous day only (8 Nov owner rule): a product missed yesterday has no "today" move; a change across a gap
    -- (6 Nov → 8 Nov) cannot be dated, so it shows only in the week lists.
    from r a join r b on b.product_id = a.product_id and b.rn = 2 and b.day = a.day - 1
    join products p on p.id = a.product_id left join product_state s on s.product_id = a.product_id
    where a.rn = 1 and a.day = ${head.day}::date and p.status = 'active'`;
  const by = (dir: -1 | 1) => rows.filter((m) => moveDirection(m.was, m.now) === dir)
    .sort((x, y) => (y.now - y.was) / y.was * dir - (x.now - x.was) / x.was * dir);
  return { day: head.day, checked: head.checked, compared: rows.length, down: by(-1), up: by(1), live: false, asOf: null };
}

/**
 * Today so far (the live day): each product checked today, in stock, at its current lowest price (the price its page
 * shows) against its daily low of yesterday, so a product listed as cheaper never shows a higher price on its page.
 * A product not in stock yesterday is not compared, as on a complete day.
 */
async function liveDayMoves(sql: postgres.Sql, day: string, checked: number, asOf: Date | null): Promise<DayMoves> {
  const rows = await sql<Mover[]>`
    with y as (
      select product_id, min(min_price)::int as p from price_observations
      where min_price is not null
        and observed_at >= ((${day}::date - 1)::timestamp at time zone 'Asia/Almaty')
        and observed_at < (${day}::date::timestamp at time zone 'Asia/Almaty')
      group by 1)
    select p.external_id as "externalId", p.title, p.title_kk as "titleKk", p.image_url as "imageUrl",
           s.current_min_price as now, y.p as was, round((s.current_min_price - y.p) * 100.0 / y.p)::int as pct,
           coalesce(s.offer_count, 0) as "offerCount", s.last_checked_at as "checkedAt", s.current_min_price as current
    from y join product_state s on s.product_id = y.product_id join products p on p.id = y.product_id
    where p.status = 'active' and s.in_stock and s.current_min_price is not null
      and s.last_checked_at >= (${day}::date::timestamp at time zone 'Asia/Almaty')`;
  const by = (dir: -1 | 1) => rows.filter((m) => moveDirection(m.was, m.now) === dir)
    .sort((x, y) => (y.now - y.was) / y.was * dir - (x.now - x.was) / x.was * dir);
  return { day, checked, compared: rows.length, down: by(-1), up: by(1), live: true, asOf };
}

/**
 * A day move a later check has not undone (owner, 11 Nov: a product listed as «Подешевели» for the last complete
 * day while its page already showed the price back up). For the displayed lists only; the day's counts keep every move.
 */
export function stillMoving(m: Mover): boolean {
  if (m.current === null) return true;
  return moveDirection(m.was, m.current) === moveDirection(m.was, m.now);
}
