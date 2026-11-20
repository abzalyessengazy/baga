import type postgres from "postgres";

/**
 * What BAĞA's alerts caught (the owner's report since 12 Nov; on the home page since 20 Nov 2026, the owner: «it doesn't
 * mean we didn't help»). For every tracking whose target alert went out (Telegram, email or browser): the price when it
 * began (the lowest observed then, else the first one after; a city tracking: that city's) minus the lowest price an
 * alert reported; only plausible drops count (view caught_live, migration 0042). The sum never shrinks: a drop once
 * caught stays in the caught_drops ledger after the person deletes their data or the tracking ends. `confirmed`: the
 * part people said they bought (live). The team's own trackings left out. Observed prices only.
 */
export interface CaughtSavings { confirmed: number; confirmedCount: number; dropsCaught: number; dropsCaughtCount: number; dropsCaughtProducts: number }

export async function caughtSavings(sql: postgres.Sql): Promise<CaughtSavings> {
  // float8, not int: a sum of tenge can pass int4 (2 147 483 647) and would fail the whole home receipt (audit 20 Nov).
  const [r] = await sql<CaughtSavings[]>`
    with live as (select tracking_id, product_id, bought, start_price - alert_price as drop from caught_live),
    every as (
      select tracking_id, product_id, drop from live
      union all
      select c.tracking_id, c.product_id, c.start_price - c.alert_price from caught_drops c
      where not exists (select 1 from live l where l.tracking_id = c.tracking_id))
    select (select coalesce(sum(drop), 0)::float8 from live where bought = 'yes') as confirmed,
      (select count(*)::int from live where bought = 'yes') as "confirmedCount",
      coalesce(sum(drop), 0)::float8 as "dropsCaught", count(*)::int as "dropsCaughtCount", count(distinct product_id)::int as "dropsCaughtProducts"
    from every`;
  return r ?? { confirmed: 0, confirmedCount: 0, dropsCaught: 0, dropsCaughtCount: 0, dropsCaughtProducts: 0 };
}

/** Writes newly caught drops to the ledger (after the worker's sends); a later, lower alert of the same tracking counts. */
export async function recordCaughtDrops(sql: postgres.Sql): Promise<void> {
  await sql`insert into caught_drops (tracking_id, product_id, start_price, alert_price)
    select tracking_id, product_id, start_price, alert_price from caught_live
    on conflict (tracking_id) do update set alert_price = least(caught_drops.alert_price, excluded.alert_price)`;
}
