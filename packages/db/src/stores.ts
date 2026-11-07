import type postgres from "postgres";

/**
 * Other stores' prices next to our Kaspi products (DECISIONS.md, 2026-11-07 "Technodom as a second price source";
 * migration 0018). Only exactly matched items, only observed prices; Kaspi's own tables are never touched.
 */
export const STORE_PRICES = {
  /** A store price older than this is not shown (a missed day must not show yesterday's price as today's). */
  showMaxAgeHours: 48,
  /** A confirmed match is priced again once its last price is this old. */
  repriceAfterHours: 20,
} as const;

export async function storeMarketplaceId(sql: postgres.Sql, code: string): Promise<number> {
  const [m] = await sql<{ id: number }[]>`select id from marketplaces where code = ${code}`;
  if (!m) throw new Error(`marketplace ${code} missing: apply migration 0018`);
  return m.id;
}

/** Active Kaspi products with a price that this store has never been checked against (no match row at all). */
export async function productsToMatch(sql: postgres.Sql, marketplaceId: number) {
  return sql<{ productId: number; externalId: string; title: string; tracked: number; reviews: number }[]>`
    select p.id as "productId", p.external_id as "externalId", p.title,
           (select count(*) from trackings t where t.product_id = p.id and t.status = 'active')::int as tracked,
           coalesce(p.kaspi_reviews, 0) as reviews
    from products p join product_state s on s.product_id = p.id
    where p.status = 'active' and s.current_min_price is not null
      and not exists (select 1 from store_matches m where m.product_id = p.id and m.marketplace_id = ${marketplaceId})
    order by 4 desc, p.last_viewed_at desc nulls last, 5 desc`;
}

/** The Kaspi title of the product a store item is exactly matched to (by the store's own Kaspi link), or null. */
export async function exactTitleForSku(sql: postgres.Sql, marketplaceId: number, sku: string): Promise<string | null> {
  const [r] = await sql<{ title: string }[]>`
    select p.title from store_matches m join products p on p.id = m.product_id
    where m.marketplace_id = ${marketplaceId} and m.store_sku = ${sku} and m.method = 'exact' and m.status = 'confirmed' limit 1`;
  return r?.title ?? null;
}

/**
 * Products the store itself sells on Kaspi (its Kaspi shop is among the current sellers) that have no match row yet:
 * its own site almost surely has them, and its page's Kaspi link can confirm the pair exactly.
 */
export async function productsSoldOnKaspiBy(sql: postgres.Sql, marketplaceId: number, kaspiMerchantId: string) {
  return sql<{ productId: number; externalId: string; title: string }[]>`
    select p.id as "productId", p.external_id as "externalId", p.title
    from products p
    where p.status = 'active'
      and exists (select 1 from offers_current o join sellers se on se.id = o.seller_id where o.product_id = p.id and se.external_id = ${kaspiMerchantId})
      and not exists (select 1 from store_matches m where m.product_id = p.id and m.marketplace_id = ${marketplaceId})
    order by (select count(*) from trackings t where t.product_id = p.id and t.status = 'active') desc, p.last_viewed_at desc nulls last`;
}

/** Our product id for a Kaspi external id (the store's Kaspi link may point at another of our products). */
export async function productIdByExternal(sql: postgres.Sql, externalId: string): Promise<{ id: number; title: string } | null> {
  const [p] = await sql<{ id: number; title: string }[]>`select id, title from products where external_id = ${externalId} and status = 'active'`;
  return p ?? null;
}

export type MatchMethod = "exact" | "strict" | "manual";
export type MatchStatus = "pending" | "confirmed" | "rejected";

/**
 * Records a pair the matcher looked at. A confirmed pair yields to an existing confirmed one for the same product
 * (one item per store per product): it is kept as pending for the owner instead.
 */
export async function saveMatch(sql: postgres.Sql, m: {
  productId: number; marketplaceId: number; sku: string; slug: string; title: string | null; method: MatchMethod; status: MatchStatus; reason?: string | null;
}): Promise<{ id: number; status: MatchStatus }> {
  return sql.begin(async (tx) => {
    let status = m.status;
    if (status === "confirmed") {
      const [other] = await tx<{ id: number }[]>`
        select id from store_matches where product_id = ${m.productId} and marketplace_id = ${m.marketplaceId}
          and status = 'confirmed' and store_sku <> ${m.sku}`;
      if (other) status = "pending";
    }
    const [row] = await tx<{ id: number; status: MatchStatus }[]>`
      insert into store_matches (product_id, marketplace_id, store_sku, store_slug, store_title, method, status, reason, verified_at)
      values (${m.productId}, ${m.marketplaceId}, ${m.sku}, ${m.slug}, ${m.title}, ${m.method}, ${status}, ${m.reason ?? null},
              ${status === "pending" ? null : new Date()})
      on conflict (product_id, marketplace_id, store_sku) do update
        set store_slug = excluded.store_slug, store_title = excluded.store_title
      returning id, status`;
    return row!;
  });
}

/** Confirmed matches due for a price, people's products first. */
export async function matchesToPrice(sql: postgres.Sql, marketplaceId: number, limit: number) {
  return sql<{ matchId: number; slug: string; sku: string; title: string | null; ourTitle: string }[]>`
    select m.id as "matchId", m.store_slug as slug, m.store_sku as sku, m.store_title as title, p.title as "ourTitle"
    from store_matches m join products p on p.id = m.product_id
    left join lateral (select observed_at from store_prices sp where sp.match_id = m.id order by observed_at desc limit 1) last on true
    where m.marketplace_id = ${marketplaceId} and m.status = 'confirmed' and p.status = 'active'
      and (last.observed_at is null or last.observed_at < now() - make_interval(hours => ${STORE_PRICES.repriceAfterHours}))
    order by (select count(*) from trackings t where t.product_id = p.id and t.status = 'active') desc,
             p.last_viewed_at desc nulls last, last.observed_at nulls first
    limit ${limit}`;
}

export async function saveStorePrice(sql: postgres.Sql, matchId: number, p: { price: number | null; oldPrice: number | null; inStock: boolean }) {
  await sql`insert into store_prices (match_id, price, old_price, in_stock) values (${matchId}, ${p.price}, ${p.oldPrice}, ${p.inStock})`;
}

/** Takes a match out of use (the page is gone, or the item no longer passes the rules); the owner can look again. */
export async function setMatchStatus(sql: postgres.Sql, matchId: number, status: MatchStatus, reason: string | null, method?: MatchMethod) {
  await sql`update store_matches set status = ${status}, reason = ${reason}, verified_at = now(),
    method = coalesce(${method ?? null}, method) where id = ${matchId}`;
}

/** The owner's decision on /admin: confirm (as "manual") or reject. Confirming replaces another confirmed item. */
export async function decideMatch(sql: postgres.Sql, matchId: number, confirm: boolean): Promise<boolean> {
  return sql.begin(async (tx) => {
    const [m] = await tx<{ product_id: number; marketplace_id: number }[]>`select product_id, marketplace_id from store_matches where id = ${matchId}`;
    if (!m) return false;
    if (confirm) await tx`update store_matches set status = 'rejected', reason = 'replaced by the owner', verified_at = now()
      where product_id = ${m.product_id} and marketplace_id = ${m.marketplace_id} and status = 'confirmed' and id <> ${matchId}`;
    await tx`update store_matches set status = ${confirm ? "confirmed" : "rejected"}, method = case when ${confirm} then 'manual' else method end,
      reason = ${confirm ? null : "rejected by the owner"}, verified_at = now() where id = ${matchId}`;
    return true;
  });
}

export interface PendingMatch { id: number; ourTitle: string; externalId: string; storeTitle: string | null; url: string; reason: string | null; kaspiPrice: number | null }
export async function pendingMatches(sql: postgres.Sql, limit = 50): Promise<PendingMatch[]> {
  return sql<PendingMatch[]>`
    select m.id, p.title as "ourTitle", p.external_id as "externalId", m.store_title as "storeTitle",
           mk.base_url || '/p/' || m.store_slug as url, m.reason, s.current_min_price as "kaspiPrice"
    from store_matches m join products p on p.id = m.product_id join marketplaces mk on mk.id = m.marketplace_id
    left join product_state s on s.product_id = p.id
    where m.status = 'pending' order by m.created_at limit ${limit}`;
}

/** What a product page shows: each store's latest price for its confirmed item, fresh and in stock only. */
export interface StoreOffer { store: string; name: string; url: string; title: string | null; price: number; oldPrice: number | null; observedAt: Date }
export async function storeOffers(sql: postgres.Sql, productId: number): Promise<StoreOffer[]> {
  return sql<StoreOffer[]>`
    select mk.code as store, mk.name, mk.base_url || '/p/' || m.store_slug as url, m.store_title as title,
           sp.price, sp.old_price as "oldPrice", sp.observed_at as "observedAt"
    from store_matches m join marketplaces mk on mk.id = m.marketplace_id
    join lateral (select price, old_price, in_stock, observed_at from store_prices where match_id = m.id order by observed_at desc limit 1) sp on true
    where m.product_id = ${productId} and m.status = 'confirmed' and sp.in_stock and sp.price is not null
      and sp.observed_at > now() - make_interval(hours => ${STORE_PRICES.showMaxAgeHours})
    order by sp.price`;
}

export async function startStoreRun(sql: postgres.Sql, marketplaceId: number): Promise<number> {
  const [r] = await sql<{ id: number }[]>`insert into store_runs (marketplace_id) values (${marketplaceId}) returning id`;
  return r!.id;
}
export async function finishStoreRun(sql: postgres.Sql, id: number, x: { requests: number; priced: number; matched: number; failed: number; aborted: string | null }) {
  await sql`update store_runs set finished_at = now(), requests = ${x.requests}, priced = ${x.priced}, matched = ${x.matched},
    failed = ${x.failed}, aborted_reason = ${x.aborted} where id = ${id}`;
}
export async function latestStoreRuns(sql: postgres.Sql, limit = 5) {
  return sql<{ store: string; startedAt: Date; finishedAt: Date | null; requests: number; priced: number; matched: number; failed: number; aborted: string | null }[]>`
    select mk.code as store, r.started_at as "startedAt", r.finished_at as "finishedAt", r.requests, r.priced, r.matched, r.failed, r.aborted_reason as aborted
    from store_runs r join marketplaces mk on mk.id = r.marketplace_id order by r.id desc limit ${limit}`;
}
