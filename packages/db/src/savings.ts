import type postgres from "postgres";

/**
 * What BAĞA's alerts caught (the owner's report since 12 Nov; on the home page since 20 Nov 2026, the owner: «it doesn't
 * mean we didn't help»). For every tracking whose target alert went out (Telegram, email or browser): the price when it
 * began (the lowest observed then, else the first one after) minus the price the alert reported; only drops count. A
 * tracking removed or bought later still counts, so the sum never shrinks. `confirmed`: the part people said they bought.
 * The team's own trackings left out. Observed prices only.
 */
export interface CaughtSavings { confirmed: number; confirmedCount: number; dropsCaught: number; dropsCaughtCount: number; dropsCaughtProducts: number }

export async function caughtSavings(sql: postgres.Sql): Promise<CaughtSavings> {
  const [r] = await sql<CaughtSavings[]>`
    with hit as (
      select n.tracking_id, min(n.price) as alert_price from notifications n
      where n.type = 'target_reached' and n.status = 'sent' group by n.tracking_id
    ), d as (
      select t.bought, t.product_id, coalesce(
        (select o.min_price from price_observations o where o.product_id = t.product_id and o.observed_at <= t.created_at
           and o.min_price is not null order by o.observed_at desc limit 1),
        (select o.min_price from price_observations o where o.product_id = t.product_id and o.observed_at > t.created_at
           and o.min_price is not null order by o.observed_at limit 1)) - h.alert_price as drop
      from hit h join trackings t on t.id = h.tracking_id where not exists (select 1 from watchers tw where tw.id = t.watcher_id and tw.internal)
    )
    select coalesce(sum(drop) filter (where bought = 'yes'), 0)::int as confirmed,
      count(*) filter (where bought = 'yes' and drop > 0)::int as "confirmedCount",
      coalesce(sum(drop), 0)::int as "dropsCaught", count(*)::int as "dropsCaughtCount", count(distinct product_id)::int as "dropsCaughtProducts"
    from d where drop > 0`;
  return r ?? { confirmed: 0, confirmedCount: 0, dropsCaught: 0, dropsCaughtCount: 0, dropsCaughtProducts: 0 };
}
