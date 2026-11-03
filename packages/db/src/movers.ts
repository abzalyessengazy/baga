import type postgres from "postgres";

/**
 * Week movers for /drops and the Telegram channel: the current lowest price against the highest (drops) or lowest
 * (rises) daily low of the previous 7 Almaty days. Observed prices only; a product needs a check today or
 * yesterday and at least one earlier day. In-stock products only, biggest change in percent first.
 */
export interface Mover {
  externalId: string; title: string; titleKk: string | null; imageUrl: string | null;
  now: number; was: number; pct: number; offerCount: number;
}

export async function weekMovers(sql: postgres.Sql, dir: "down" | "up", limit = 30, minPct = 3): Promise<Mover[]> {
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
           coalesce(s.offer_count, 0) as "offerCount"
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
