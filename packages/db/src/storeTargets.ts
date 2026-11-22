import type postgres from "postgres";

/**
 * «Ваша цена есть на Halyk Market» (migration 0040; DECISIONS.md 2026-11-19 "Target reached at another store"). After a
 * store run: for every active tracking (Almaty) whose target an exactly matched store's price observed today meets, in
 * stock, while Kaspi's lowest price is still above the target, one message per channel the person connected.
 * One message per tracking and store until that store's price goes back above the target (or out of stock): the
 * idempotency key carries the time of the latest such observation, so the same price never sends twice. No store or
 * Kaspi request; observed prices only.
 */
export const STORE_TARGET_STORES = ["halyk", "technodom"] as const;

export async function queueStoreTargets(sql: postgres.Sql): Promise<number> {
  const rows = await sql<{ n: number }[]>`
    with lp as (
      select distinct on (sp.match_id) sp.match_id, sp.price, sp.in_stock, sp.observed_at
      from store_prices sp join store_matches m on m.id = sp.match_id and m.status = 'confirmed'
      join marketplaces k on k.id = m.marketplace_id and k.code in ('halyk', 'technodom') -- STORE_TARGET_STORES
      order by sp.match_id, sp.observed_at desc),
    hit as (
      select t.id as tracking_id, m.id as match_id, lp.price, w.telegram_chat_id is not null as tg,
        w.email_confirmed_at is not null and w.email_stop_code is not null as mail,
        exists (select 1 from push_subscriptions ps where ps.watcher_id = w.id) as push,
        -- Re-armed when the store's price was last above the target or out of stock.
        coalesce((select max(o.observed_at) from store_prices o where o.match_id = m.id
          and (o.price > t.target_price or not o.in_stock)), 'epoch'::timestamptz) as armed_at
      from trackings t join watchers w on w.id = t.watcher_id join product_state s on s.product_id = t.product_id
      join store_matches m on m.product_id = t.product_id join lp on lp.match_id = m.id
      where t.status = 'active' and t.target_price is not null and coalesce(t.city, 'almaty') = 'almaty'
        and lp.in_stock and lp.price <= t.target_price and s.in_stock and s.current_min_price > t.target_price
        and (lp.observed_at at time zone 'Asia/Almaty')::date = (now() at time zone 'Asia/Almaty')::date),
    msgs as (
      select h.tracking_id, h.match_id, h.price, c.channel,
        'store:' || h.tracking_id || ':' || h.match_id || ':' || extract(epoch from h.armed_at)::bigint
          || case c.channel when 'telegram' then '' else ':' || c.channel end as key
      from hit h cross join lateral (values ('telegram', h.tg), ('email', h.mail), ('push', h.push)) as c(channel, ok)
      where c.ok)
    insert into notifications (tracking_id, type, channel, price, idempotency_key, match_id)
    select tracking_id, 'store_target', channel, price, key, match_id from msgs
    on conflict (idempotency_key) do nothing
    returning 1 as n`;
  return rows.length;
}

/** What a queued store message shows, read when it is sent: the store's latest observation of that match. */
export interface StoreTargetInfo { store: string; storeName: string; url: string; price: number; inStock: boolean; observedAt: Date; kaspi: number | null }

export async function storeTargetInfo(sql: postgres.Sql, matchId: number): Promise<StoreTargetInfo | null> {
  const [r] = await sql<StoreTargetInfo[]>`
    select k.code as store, k.name as "storeName", k.base_url || k.product_path || m.store_slug as url,
      sp.price, sp.in_stock as "inStock", sp.observed_at as "observedAt", s.current_min_price as kaspi
    from store_matches m join marketplaces k on k.id = m.marketplace_id
    join lateral (select price, in_stock, observed_at from store_prices where match_id = m.id order by observed_at desc limit 1) sp on true
    left join product_state s on s.product_id = m.product_id
    where m.id = ${matchId} and m.status = 'confirmed'`; // a pair rejected after the message was queued sends nothing (23 Nov 2026 audit)
  return r ?? null;
}
