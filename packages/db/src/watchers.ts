import type postgres from "postgres";
import { INTERVAL_MINUTES } from "@baga/core";

/**
 * Trackings before registration (migration 0007): an anonymous watcher holds a secret (cookie + private link,
 * only its SHA-256 stored here) and optionally a linked Telegram chat.
 */
export interface Watcher {
  id: string; locale: "ru" | "kk"; telegramChatId: string | null; telegramLinkCode: string | null;
  /** Migration 0008: the address alerts go to once confirmed. */
  email: string | null; emailConfirmed: boolean;
}
export interface WatchedItem {
  /** externalId is null while the tracking waits on an unresolved short link (migration 0009); pagePath links to
   * the product page, or to the short link's waiting page. */
  trackingId: string; externalId: string | null; pagePath: string; title: string | null; slug: string | null; imageUrl: string | null;
  /** targetPrice is null while a percentage target waits for the product's first price (migration 0010). */
  targetPrice: number | null; targetDropPct: number | null; currentMinPrice: number | null; lastCheckedAt: Date | null; status: string; createdAt: Date;
  /** A target alert was sent and "Вы купили?" has no answer yet (migration 0011). */
  askBought: boolean;
}

const watcherCols = (sql: postgres.Sql) =>
  sql`id, locale, telegram_chat_id::text as "telegramChatId", telegram_link_code as "telegramLinkCode",
      email, email_confirmed_at is not null as "emailConfirmed"`;

export async function createWatcher(sql: postgres.Sql, secretHash: string, locale: "ru" | "kk", linkCode: string): Promise<Watcher> {
  const [w] = await sql<Watcher[]>`insert into watchers (secret_hash, locale, telegram_link_code)
    values (${secretHash}, ${locale}, ${linkCode}) returning ${watcherCols(sql)}`;
  return w!;
}

export async function getWatcherBySecret(sql: postgres.Sql, secretHash: string): Promise<Watcher | null> {
  const [w] = await sql<Watcher[]>`update watchers set last_seen_at = now() where secret_hash = ${secretHash} returning ${watcherCols(sql)}`;
  return w ?? null;
}

export async function setWatcherLocale(sql: postgres.Sql, watcherId: string, locale: "ru" | "kk") {
  await sql`update watchers set locale = ${locale} where id = ${watcherId} and locale <> ${locale}`;
}

/** Gives the watcher a fresh one-time Telegram link code (the old one stops working). */
export async function rotateLinkCode(sql: postgres.Sql, watcherId: string, code: string): Promise<void> {
  await sql`update watchers set telegram_link_code = ${code} where id = ${watcherId}`;
}

/**
 * Bot /start <code>: links the chat to the watcher and burns the code. A chat belongs to one watcher; linking it
 * again moves it. Returns the watcher, or null for an unknown or used code.
 */
export async function linkTelegram(sql: postgres.Sql, code: string, chatId: string): Promise<Watcher | null> {
  return sql.begin(async (tx) => {
    const [w] = await tx<{ id: string }[]>`select id from watchers where telegram_link_code = ${code} for update`;
    if (!w) return null;
    await tx`update watchers set telegram_chat_id = null where telegram_chat_id = ${chatId}::bigint and id <> ${w.id}`;
    const [r] = await tx<Watcher[]>`update watchers set telegram_chat_id = ${chatId}::bigint, telegram_link_code = null
      where id = ${w.id} returning ${watcherCols(tx as unknown as postgres.Sql)}`;
    return r ?? null;
  });
}

export async function getWatcherByChat(sql: postgres.Sql, chatId: string): Promise<Watcher | null> {
  const [w] = await sql<Watcher[]>`select ${watcherCols(sql)} from watchers where telegram_chat_id = ${chatId}::bigint`;
  return w ?? null;
}

export async function unlinkTelegram(sql: postgres.Sql, chatId: string): Promise<boolean> {
  const r = await sql`update watchers set telegram_chat_id = null where telegram_chat_id = ${chatId}::bigint`;
  return r.count > 0;
}

export async function listWatched(sql: postgres.Sql, watcherId: string): Promise<WatchedItem[]> {
  return sql<WatchedItem[]>`
    select t.id as "trackingId", t.external_id as "externalId",
           case when t.external_id is not null then '/p/' || t.external_id else '/l/' || t.short_link_code end as "pagePath",
           p.title, coalesce(p.slug, q.slug) as slug,
           p.image_url as "imageUrl", t.target_price as "targetPrice",
           t.target_drop_pct as "targetDropPct", s.current_min_price as "currentMinPrice",
           s.last_checked_at as "lastCheckedAt", t.status, t.created_at as "createdAt",
           t.bought is null and exists (select 1 from notifications n where n.tracking_id = t.id and n.type = 'target_reached'
             and n.status = 'sent') as "askBought"
    from trackings t
    left join products p on p.id = t.product_id
    left join product_state s on s.product_id = t.product_id
    left join seed_queue q on q.external_id = t.external_id
    where t.watcher_id = ${watcherId} and t.status in ('active', 'paused')
    order by t.created_at desc`;
}

export type TrackResult = { ok: true; trackingId: string } | { ok: false; reason: "unknown_product" | "limit" };
/** A price in tenge, or a drop in percent while the product has no price yet (migration 0010). */
export type TrackTarget = { price: number } | { dropPct: number };
const targetCols = (t: TrackTarget) => "price" in t ? { price: t.price, pct: null } : { price: null, pct: t.dropPct };

/**
 * Creates or updates the watcher's tracking. The product must be in our catalog or queued for the collector, so
 * arbitrary ids cannot be stored. Changing the target re-arms the alert. A product we already have a price for
 * gets no "first price" message (the visitor saw it on the page). A percentage target is only for a product with
 * no price yet; the caller turns it into a price when there is one.
 */
export async function upsertWatcherTracking(sql: postgres.Sql, watcherId: string, externalId: string, target: TrackTarget, limit: number): Promise<TrackResult> {
  const [prod] = await sql<{ id: number | null; queued: boolean }[]>`
    select (select id from products where external_id = ${externalId}) as id,
           exists (select 1 from seed_queue where external_id = ${externalId} and status = 'pending') as queued`;
  if (!prod?.id && !prod?.queued) return { ok: false, reason: "unknown_product" };
  const [existing] = await sql<{ id: string }[]>`select id from trackings where watcher_id = ${watcherId} and external_id = ${externalId}`;
  if (!existing) {
    const [n] = await sql<{ n: number }[]>`select count(*)::int as n from trackings where watcher_id = ${watcherId} and status in ('active', 'paused')`;
    if ((n?.n ?? 0) >= limit) return { ok: false, reason: "limit" };
  }
  const [t] = await sql<{ id: string }[]>`
    insert into trackings (watcher_id, external_id, product_id, target_price, target_drop_pct, status, first_price_sent_at)
    values (${watcherId}, ${externalId}, ${prod.id}, ${targetCols(target).price}, ${targetCols(target).pct}, 'active', ${prod.id ? new Date() : null})
    on conflict (watcher_id, external_id) where watcher_id is not null do update
      set target_price = excluded.target_price, target_drop_pct = excluded.target_drop_pct, status = 'active', alert_state = 'armed', above_since = null,
          -- A new target (or tracking again after "bought") may be asked "Вы купили?" again (migration 0011).
          bought = null, bought_at = null, bought_asked_at = null, bought_code = null
    returning id`;
  // Tracked products are always first (PRIORITY_ORDER): promote the product now, not after its next check, and make it
  // due within the tracked interval of its last check. Hot products stay hot; the collector sets the exact tier after the check.
  if (prod.id) await sql`
    update collection_schedule cs set priority = 'tracked', interval_minutes = ${INTERVAL_MINUTES.tracked},
      next_check_at = least(cs.next_check_at, coalesce(s.last_checked_at, now()) + make_interval(mins => ${INTERVAL_MINUTES.tracked}))
    from product_state s
    where cs.product_id = ${prod.id} and s.product_id = cs.product_id and cs.priority not in ('hot', 'tracked')`;
  return { ok: true, trackingId: t!.id };
}

export async function deleteWatcherTracking(sql: postgres.Sql, watcherId: string, trackingId: string): Promise<boolean> {
  const r = await sql`delete from trackings where id = ${trackingId} and watcher_id = ${watcherId}`;
  return r.count > 0;
}

export async function getWatcherTracking(sql: postgres.Sql, watcherId: string, externalId: string) {
  const [t] = await sql<{ id: string; targetPrice: number | null; targetDropPct: number | null }[]>`
    select id, target_price as "targetPrice", target_drop_pct as "targetDropPct" from trackings where watcher_id = ${watcherId} and external_id = ${externalId} and status = 'active'`;
  return t ?? null;
}

export type EmailRequest = { ok: true; send: boolean } | { ok: false; reason: "too_soon" | "too_many" };

/** Confirmation emails a day: per address across all watchers, and per watcher (any addresses). */
export const EMAIL_REQUEST_LIMITS = { perAddressPerDay: 5, perWatcherPerDay: 10 } as const;

/**
 * Stores an address waiting for confirmation (migration 0008) with a fresh token and unsubscribe code. An address
 * this watcher already confirmed needs no new email (send: false). Limits, counted in the email_requests ledger
 * (migration 0014) so they hold however often one browser asks: one request a minute per watcher, and
 * EMAIL_REQUEST_LIMITS a day, so the form cannot be used to flood someone's inbox. One address is handled at a time
 * (advisory lock), so parallel requests cannot pass a limit together.
 */
export async function requestWatcherEmail(sql: postgres.Sql, watcherId: string, email: string, tokenHash: string, stopCode: string): Promise<EmailRequest> {
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${email}))`;
    const [w] = await tx<{ email: string | null; confirmed: boolean }[]>`
      select email, email_confirmed_at is not null as confirmed from watchers where id = ${watcherId}`;
    if (w?.email === email && w.confirmed) return { ok: true, send: false } as const;
    const hash = tx`sha256(convert_to(${email}, 'UTF8'))`;
    const [n] = await tx<{ recent: number; address: number; watcher: number }[]>`
      select count(*) filter (where watcher_id = ${watcherId} and at > now() - interval '1 minute')::int as recent,
             count(*) filter (where email_hash = ${hash})::int as address,
             count(*) filter (where watcher_id = ${watcherId})::int as watcher
      from email_requests where at > now() - interval '1 day' and (email_hash = ${hash} or watcher_id = ${watcherId})`;
    if ((n?.recent ?? 0) > 0) return { ok: false, reason: "too_soon" } as const;
    if ((n?.address ?? 0) >= EMAIL_REQUEST_LIMITS.perAddressPerDay || (n?.watcher ?? 0) >= EMAIL_REQUEST_LIMITS.perWatcherPerDay)
      return { ok: false, reason: "too_many" } as const;
    await tx`insert into email_requests (email_hash, watcher_id) values (${hash}, ${watcherId})`;
    await tx`update watchers set email = ${email}, email_confirmed_at = null, email_token_hash = ${tokenHash},
      email_token_expires_at = now() + interval '2 days', email_requested_at = now(), email_stop_code = ${stopCode}
      where id = ${watcherId}`;
    return { ok: true, send: true } as const;
  });
}

/** The confirmation link was opened and its button pressed: alerts may now go to the address. */
export async function confirmWatcherEmail(sql: postgres.Sql, tokenHash: string): Promise<{ email: string; locale: "ru" | "kk" } | null> {
  const [r] = await sql<{ email: string; locale: "ru" | "kk" }[]>`
    update watchers set email_confirmed_at = now(), email_token_hash = null, email_token_expires_at = null
    where email_token_hash = ${tokenHash} and email_token_expires_at > now() and email is not null
    returning email, locale`;
  return r ?? null;
}

/** Unsubscribe from an email's link (no cookie needed): forgets the address. */
export async function stopWatcherEmailByCode(sql: postgres.Sql, code: string): Promise<boolean> {
  const r = await sql`update watchers set email = null, email_confirmed_at = null, email_token_hash = null,
    email_token_expires_at = null, email_stop_code = null where email_stop_code = ${code}`;
  return r.count > 0;
}

/** "Мои товары": stop emails for this watcher. */
export async function removeWatcherEmail(sql: postgres.Sql, watcherId: string): Promise<void> {
  await sql`update watchers set email = null, email_confirmed_at = null, email_token_hash = null,
    email_token_expires_at = null, email_stop_code = null where id = ${watcherId}`;
}

/**
 * Tracking on a Kaspi app short link the website could not resolve (migration 0009). The link must be waiting in
 * short_link_queue; the collector moves the tracking onto the product when it resolves the link.
 */
export async function upsertWatcherShortLinkTracking(sql: postgres.Sql, watcherId: string, code: string, target: TrackTarget, limit: number): Promise<TrackResult> {
  const [link] = await sql<{ status: string; externalId: string | null }[]>`
    select status, external_id as "externalId" from short_link_queue where code = ${code}`;
  if (!link || link.status === "failed") return { ok: false, reason: "unknown_product" };
  if (link.status === "resolved" && link.externalId) return upsertWatcherTracking(sql, watcherId, link.externalId, target, limit);
  const [existing] = await sql<{ id: string }[]>`
    select id from trackings where watcher_id = ${watcherId} and short_link_code = ${code} and external_id is null`;
  if (!existing) {
    const [n] = await sql<{ n: number }[]>`select count(*)::int as n from trackings where watcher_id = ${watcherId} and status in ('active', 'paused')`;
    if ((n?.n ?? 0) >= limit) return { ok: false, reason: "limit" };
  }
  const [t] = await sql<{ id: string }[]>`
    insert into trackings (watcher_id, short_link_code, target_price, target_drop_pct, status)
    values (${watcherId}, ${code}, ${targetCols(target).price}, ${targetCols(target).pct}, 'active')
    on conflict (watcher_id, short_link_code) where watcher_id is not null and short_link_code is not null and external_id is null
      do update set target_price = excluded.target_price, target_drop_pct = excluded.target_drop_pct, status = 'active', alert_state = 'armed', above_since = null
    returning id`;
  return { ok: true, trackingId: t!.id };
}

export async function getWatcherShortLinkTracking(sql: postgres.Sql, watcherId: string, code: string) {
  const [t] = await sql<{ id: string; targetPrice: number | null; targetDropPct: number | null }[]>`
    select id, target_price as "targetPrice", target_drop_pct as "targetDropPct" from trackings
    where watcher_id = ${watcherId} and short_link_code = ${code} and external_id is null and status = 'active'`;
  return t ?? null;
}

/**
 * The collector resolved a short link: its waiting trackings move onto the product. A watcher who already tracks
 * that product keeps the existing tracking. The first-price message follows the product's next check.
 */
export async function attachShortLinkTrackings(sql: postgres.Sql, code: string, externalId: string): Promise<number> {
  return sql.begin(async (tx) => {
    await tx`delete from trackings t where t.short_link_code = ${code} and t.external_id is null
      and exists (select 1 from trackings o where o.watcher_id = t.watcher_id and o.external_id = ${externalId})`;
    const r = await tx`update trackings set external_id = ${externalId},
      product_id = (select id from products where external_id = ${externalId}), first_price_sent_at = null
      where short_link_code = ${code} and external_id is null`;
    return r.count;
  });
}

/** "Удалить мои данные": the watcher with its email, Telegram link, trackings and their alert log (cascade). */
export async function deleteWatcher(sql: postgres.Sql, watcherId: string): Promise<boolean> {
  const r = await sql`delete from watchers where id = ${watcherId}`;
  return r.count > 0;
}

/** How many people watch a product now: distinct owners of its active trackings (the product page's «N наблюдают»). */
export async function countWatching(sql: postgres.Sql, productId: number): Promise<number> {
  const [r] = await sql<{ n: number }[]>`
    select count(distinct coalesce(watcher_id::text, user_id::text))::int as n
    from trackings where product_id = ${productId} and status = 'active'`;
  return r?.n ?? 0;
}
