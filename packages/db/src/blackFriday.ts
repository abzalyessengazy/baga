import type postgres from "postgres";
import { BLACK_FRIDAY, storeSaleCheck, type StoreDay, type StoreSaleCheck } from "@baga/core";
import { STORE_PRICES } from "./stores";

/**
 * The «Чёрная пятница» page (DECISIONS.md, 2026-11-15 "Black Friday: checking the discounts"): products we price both
 * on Kaspi and in Technodom or Sulpak (confirmed exact pairs only), from BLACK_FRIDAY.minPrice, the ones people open
 * and track most first. For each store: its daily lows (with the crossed-out price it showed) from two weeks before
 * the sale, judged by storeSaleCheck; and Kaspi's price now and its lowest in the same two weeks. Read-only.
 */
/** `stale`: the store's last price is older than STORE_PRICES.showMaxAgeHours, so no price is shown as "now" (audit 20 Nov 2026). */
export interface BfStore { store: string; name: string; url: string; now: number | null; nowOld: number | null; checkedAt: Date | null; stale: boolean; check: StoreSaleCheck }
export interface BfRow {
  externalId: string; title: string; titleKk: string | null; imageUrl: string | null;
  kaspiNow: number; kaspiCheckedAt: Date | null; kaspiBeforeLow: number | null;
  stores: BfStore[];
}

export async function blackFridayRows(sql: postgres.Sql, today: string, cfg = BLACK_FRIDAY): Promise<BfRow[]> {
  const from = new Date(Date.parse(`${cfg.start}T00:00:00Z`) - cfg.beforeDays * 86_400_000).toISOString().slice(0, 10);
  const products = await sql<{ id: number; externalId: string; title: string; titleKk: string | null; imageUrl: string | null; kaspiNow: number; kaspiCheckedAt: Date | null; kaspiBeforeLow: number | null }[]>`
    with cand as (
      select distinct p.id from store_matches m join products p on p.id = m.product_id join product_state s on s.product_id = p.id
      where m.status = 'confirmed' and p.status = 'active' and s.in_stock and s.current_min_price >= ${cfg.minPrice}
        -- A Kaspi listing «+ подарок» is priced with its gift: no fair verdict against the store's plain item.
        and p.title !~* 'подар|сыйлық'),
    views as (
      select external_id, count(distinct coalesce(vid, sid))::int as n from events
      where name = 'product_view' and at > now() - interval '30 days' and external_id is not null group by 1),
    tracks as (select product_id, count(*)::int as n from trackings where status <> 'removed' group by 1)
    select p.id, p.external_id as "externalId", p.title, p.title_kk as "titleKk", p.image_url as "imageUrl", s.current_min_price as "kaspiNow", s.last_checked_at as "kaspiCheckedAt",
      (select min(o.min_price) from price_observations o where o.product_id = p.id and o.min_price is not null
         and o.observed_at >= (${from}::date)::timestamp at time zone 'Asia/Almaty'
         and o.observed_at < (${cfg.start}::date)::timestamp at time zone 'Asia/Almaty')::int as "kaspiBeforeLow"
    from cand c join products p on p.id = c.id join product_state s on s.product_id = p.id
    left join views v on v.external_id = p.external_id left join tracks t on t.product_id = p.id
    order by coalesce(t.n, 0) * 5 + coalesce(v.n, 0) desc, s.current_min_price desc, p.id
    limit ${cfg.rows}`;
  if (!products.length) return [];
  const days = await sql<{ productId: number; store: string; name: string; url: string; day: string; price: number; oldPrice: number | null }[]>`
    select m.product_id as "productId", mk.code as store, mk.name, mk.base_url || mk.product_path || m.store_slug as url,
      to_char((sp.observed_at at time zone 'Asia/Almaty')::date, 'YYYY-MM-DD') as day,
      min(sp.price)::int as price, (array_agg(sp.old_price order by sp.price))[1]::int as "oldPrice"
    from store_matches m join marketplaces mk on mk.id = m.marketplace_id join store_prices sp on sp.match_id = m.id
    where m.status = 'confirmed' and m.product_id = any(${sql.array(products.map((p) => p.id))}::bigint[])
      and sp.in_stock and sp.price is not null and sp.observed_at >= (${from}::date)::timestamp at time zone 'Asia/Almaty'
    group by 1, 2, 3, 4, 5 order by 5`;
  const latest = await sql<{ productId: number; store: string; price: number | null; oldPrice: number | null; at: Date }[]>`
    select distinct on (m.product_id, mk.code) m.product_id as "productId", mk.code as store,
      case when sp.in_stock then sp.price end as price, case when sp.in_stock then sp.old_price end as "oldPrice", sp.observed_at as at
    from store_matches m join marketplaces mk on mk.id = m.marketplace_id join store_prices sp on sp.match_id = m.id
    where m.status = 'confirmed' and m.product_id = any(${sql.array(products.map((p) => p.id))}::bigint[])
    order by m.product_id, mk.code, sp.observed_at desc`;
  return products.map((p) => {
    const mine = days.filter((d) => d.productId === p.id);
    const stores = [...new Set(mine.map((d) => d.store))].map((store): BfStore => {
      const rows = mine.filter((d) => d.store === store);
      const last = latest.find((l) => l.productId === p.id && l.store === store);
      const history: StoreDay[] = rows.map((r) => ({ day: r.day, price: r.price, oldPrice: r.oldPrice }));
      const stale = !last || Date.now() - last.at.getTime() > STORE_PRICES.showMaxAgeHours * 3_600_000;
      return { store, name: rows[0]!.name, url: rows[0]!.url, now: stale ? null : last.price, nowOld: stale ? null : last.oldPrice, checkedAt: last?.at ?? null, stale, check: storeSaleCheck(history, today, cfg) };
    });
    return { externalId: p.externalId, title: p.title, titleKk: p.titleKk, imageUrl: p.imageUrl, kaspiNow: p.kaspiNow, kaspiCheckedAt: p.kaspiCheckedAt, kaspiBeforeLow: p.kaspiBeforeLow, stores };
  }).filter((r) => r.stores.length > 0);
}
