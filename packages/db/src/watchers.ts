import type postgres from "postgres";

/**
 * Trackings before registration (migration 0007): an anonymous watcher holds a secret (cookie + private link,
 * only its SHA-256 stored here) and optionally a linked Telegram chat.
 */
export interface Watcher { id: string; locale: "ru" | "kk"; telegramChatId: string | null; telegramLinkCode: string | null }
export interface WatchedItem {
  trackingId: string; externalId: string; title: string | null; slug: string | null; imageUrl: string | null;
  targetPrice: number; currentMinPrice: number | null; lastCheckedAt: Date | null; status: string; createdAt: Date;
}

const watcherCols = (sql: postgres.Sql) =>
  sql`id, locale, telegram_chat_id::text as "telegramChatId", telegram_link_code as "telegramLinkCode"`;

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
    select t.id as "trackingId", t.external_id as "externalId", p.title, coalesce(p.slug, q.slug) as slug,
           p.image_url as "imageUrl", t.target_price as "targetPrice", s.current_min_price as "currentMinPrice",
           s.last_checked_at as "lastCheckedAt", t.status, t.created_at as "createdAt"
    from trackings t
    left join products p on p.id = t.product_id
    left join product_state s on s.product_id = t.product_id
    left join seed_queue q on q.external_id = t.external_id
    where t.watcher_id = ${watcherId} and t.status in ('active', 'paused')
    order by t.created_at desc`;
}

export type TrackResult = { ok: true; trackingId: string } | { ok: false; reason: "unknown_product" | "limit" };

/**
 * Creates or updates the watcher's tracking. The product must be in our catalog or queued for the collector, so
 * arbitrary ids cannot be stored. Changing the target re-arms the alert. A product we already have a price for
 * gets no "first price" message (the visitor saw it on the page).
 */
export async function upsertWatcherTracking(sql: postgres.Sql, watcherId: string, externalId: string, target: number, limit: number): Promise<TrackResult> {
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
    insert into trackings (watcher_id, external_id, product_id, target_price, status, first_price_sent_at)
    values (${watcherId}, ${externalId}, ${prod.id}, ${target}, 'active', ${prod.id ? new Date() : null})
    on conflict (watcher_id, external_id) where watcher_id is not null do update
      set target_price = excluded.target_price, status = 'active', alert_state = 'armed', above_since = null
    returning id`;
  return { ok: true, trackingId: t!.id };
}

export async function deleteWatcherTracking(sql: postgres.Sql, watcherId: string, trackingId: string): Promise<boolean> {
  const r = await sql`delete from trackings where id = ${trackingId} and watcher_id = ${watcherId}`;
  return r.count > 0;
}

export async function getWatcherTracking(sql: postgres.Sql, watcherId: string, externalId: string) {
  const [t] = await sql<{ id: string; targetPrice: number }[]>`
    select id, target_price as "targetPrice" from trackings where watcher_id = ${watcherId} and external_id = ${externalId} and status = 'active'`;
  return t ?? null;
}
