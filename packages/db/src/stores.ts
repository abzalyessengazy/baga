import type postgres from "postgres";

/**
 * Other stores' prices next to our Kaspi products (DECISIONS.md, 2026-11-07 "Technodom as a second price source";
 * migration 0018). Only exactly matched items, only observed prices; Kaspi's own tables are never touched.
 */
export const STORE_PRICES = {
  /** A store price older than this is not shown (a missed day must not show yesterday's price as today's). */
  showMaxAgeHours: 48,
  /** A match is priced again once its last price is this old: once a day, also when yesterday's run started late
   * (the window is 13:46–23:00 Almaty), and never twice in one day's backup runs. */
  repriceAfterHours: 12,
} as const;

/**
 * Pending pairs whose only doubt is the colour: same model and memory, so the page may show the store's item as
 * «похожий товар» with its own name, never as the same product and never with «дешевле» (DECISIONS 2026-11-07).
 */
export const SIMILAR_REASONS = ["colour differs", "colourway unclear", "colour of the store's own Kaspi listing differs"] as const;
export const isSimilarReason = (why: string | null | undefined) => !!why && (SIMILAR_REASONS as readonly string[]).includes(why);

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
    where m.marketplace_id = ${marketplaceId} and p.status = 'active'
      and (m.status = 'confirmed' or (m.status = 'pending' and m.reason = any(${SIMILAR_REASONS as unknown as string[]})))
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

/** Pairs the owner decides on /admin. Colour-only pairs are not asked: they are shown as «похожий» on their own. */
export interface PendingMatch { id: number; ourTitle: string; externalId: string; storeTitle: string | null; url: string; reason: string | null; kaspiPrice: number | null }
export async function pendingMatches(sql: postgres.Sql, limit = 50): Promise<PendingMatch[]> {
  return sql<PendingMatch[]>`
    select m.id, p.title as "ourTitle", p.external_id as "externalId", m.store_title as "storeTitle",
           mk.base_url || mk.product_path || m.store_slug as url, m.reason, s.current_min_price as "kaspiPrice"
    from store_matches m join products p on p.id = m.product_id join marketplaces mk on mk.id = m.marketplace_id
    left join product_state s on s.product_id = p.id
    where m.status = 'pending' and not (coalesce(m.reason, '') = any(${SIMILAR_REASONS as unknown as string[]}))
    order by m.created_at limit ${limit}`;
}

/**
 * What a product page shows: each store's latest price, fresh and in stock only. `exact`: the confirmed item, the same
 * product. `similar`: a colour-only doubt, shown apart with the store's own name; only when that store has no exact one.
 */
export interface StoreOffer { store: string; name: string; url: string; title: string | null; price: number; oldPrice: number | null; observedAt: Date; kind: "exact" | "similar" }
export async function storeOffers(sql: postgres.Sql, productId: number): Promise<StoreOffer[]> {
  const rows = await sql<StoreOffer[]>`
    select mk.code as store, mk.name, mk.base_url || mk.product_path || m.store_slug as url, m.store_title as title,
           sp.price, sp.old_price as "oldPrice", sp.observed_at as "observedAt",
           case when m.status = 'confirmed' then 'exact' else 'similar' end as kind
    from store_matches m join marketplaces mk on mk.id = m.marketplace_id
    join lateral (select price, old_price, in_stock, observed_at from store_prices where match_id = m.id order by observed_at desc limit 1) sp on true
    where m.product_id = ${productId} and sp.in_stock and sp.price is not null
      and (m.status = 'confirmed' or (m.status = 'pending' and m.reason = any(${SIMILAR_REASONS as unknown as string[]})))
      and sp.observed_at > now() - make_interval(hours => ${STORE_PRICES.showMaxAgeHours})
    order by (m.status = 'confirmed') desc, sp.price`;
  const exactStores = new Set(rows.filter((r) => r.kind === "exact").map((r) => r.store));
  return rows.filter((r) => r.kind === "exact" || !exactStores.has(r.store));
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

/**
 * Sulpak's index (migration 0029; DECISIONS.md 2026-11-14): its categories and the items read from their listings.
 * Sulpak has no product sitemap, so these stand in for one.
 */
export const STORE_INDEX = {
  /** A category's listings are read again after this many days. */
  recrawlDays: 7,
  /** Items not seen in a listing for this long are left out of matching. */
  itemMaxAgeDays: 30,
} as const;

/** Saves the store's category addresses (new ones only). */
export async function saveStoreCategories(sql: postgres.Sql, marketplaceId: number, slugs: string[]): Promise<void> {
  if (!slugs.length) return;
  await sql`insert into store_categories (marketplace_id, slug)
    select ${marketplaceId}, s from unnest(${sql.array(slugs)}::text[]) as s on conflict do nothing`;
}
export async function storeCategories(sql: postgres.Sql, marketplaceId: number) {
  return sql<{ slug: string; pages: number | null; nextPage: number; crawledAt: Date | null }[]>`
    select slug, pages, next_page as "nextPage", crawled_at as "crawledAt" from store_categories where marketplace_id = ${marketplaceId}`;
}
/** Our Kaspi leaf categories with priced active products: tracked ones first, then the most products. */
export async function ourLeafCategories(sql: postgres.Sql) {
  return sql<{ leaf: string; products: number; tracked: number }[]>`
    select p.category_path[array_length(p.category_path, 1)] as leaf, count(*)::int as products,
           count(*) filter (where exists (select 1 from trackings t where t.product_id = p.id and t.status = 'active'))::int as tracked
    from products p join product_state s on s.product_id = p.id
    where p.status = 'active' and s.current_min_price is not null and array_length(p.category_path, 1) > 0
    group by 1 order by 3 desc, 2 desc`;
}
export async function saveListingPage(sql: postgres.Sql, marketplaceId: number, category: string, page: number, pages: number,
  items: { sku: string; slug: string; title: string; price: number | null; oldPrice: number | null; onOrder: boolean }[]): Promise<void> {
  if (items.length) await sql`
    insert into store_items (marketplace_id, sku, slug, title, category, price, old_price, on_order, seen_at)
    select ${marketplaceId}, x.sku, x.slug, x.title, ${category}, nullif(x.price, 0), nullif(x.old, 0), x.on_order, now()
    from unnest(${sql.array(items.map((i) => i.sku))}::text[], ${sql.array(items.map((i) => i.slug))}::text[], ${sql.array(items.map((i) => i.title))}::text[],
      ${sql.array(items.map((i) => i.price ?? 0))}::int[], ${sql.array(items.map((i) => i.oldPrice ?? 0))}::int[], ${sql.array(items.map((i) => i.onOrder))}::bool[])
      as x(sku, slug, title, price, old, on_order)
    on conflict (marketplace_id, sku) do update set slug = excluded.slug, title = excluded.title, category = excluded.category,
      price = excluded.price, old_price = excluded.old_price, on_order = excluded.on_order, seen_at = now()`;
  const done = page >= pages || !items.length;
  await sql`update store_categories set pages = ${pages}, next_page = ${done ? 1 : page + 1},
    crawled_at = case when ${done} then now() else crawled_at end
    where marketplace_id = ${marketplaceId} and slug = ${category}`;
}
export interface StoreItem { sku: string; slug: string; title: string; price: number | null; oldPrice: number | null; onOrder: boolean; seenAt: Date }
export async function storeItems(sql: postgres.Sql, marketplaceId: number): Promise<StoreItem[]> {
  return sql<StoreItem[]>`select sku, slug, title, price, old_price as "oldPrice", on_order as "onOrder", seen_at as "seenAt" from store_items
    where marketplace_id = ${marketplaceId} and seen_at > now() - make_interval(days => ${STORE_INDEX.itemMaxAgeDays})`;
}
