import type postgres from "postgres";

/**
 * Browser notifications (migration 0038). A subscription is a push service address plus the browser's keys; the
 * address must belong to a known push service, so the collector never posts to a host a visitor chose.
 */
export interface PushSubscriptionRow { endpoint: string; p256dh: string; auth: string }

/** The push services of Chrome/Android, Firefox, Edge/Windows and Safari (macOS and iPhone home-screen apps). */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^[a-z0-9-]+\.notify\.windows\.com$/, /^web\.push\.apple\.com$/];
const KEY = /^[A-Za-z0-9_-]+$/;

/** A subscription as the browser gives it ({ endpoint, keys: { p256dh, auth } }), or null when anything is off. */
export function validPushSubscription(v: unknown): PushSubscriptionRow | null {
  const s = v as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  if (!s || typeof s.endpoint !== "string" || s.endpoint.length > 1024) return null;
  let u: URL;
  try { u = new URL(s.endpoint); } catch { return null; }
  if (u.protocol !== "https:" || u.port || u.username || !PUSH_HOSTS.some((h) => h.test(u.hostname))) return null;
  const p256dh = s.keys?.p256dh, auth = s.keys?.auth;
  if (typeof p256dh !== "string" || !KEY.test(p256dh) || p256dh.length < 40 || p256dh.length > 200) return null;
  if (typeof auth !== "string" || !KEY.test(auth) || auth.length < 10 || auth.length > 64) return null;
  return { endpoint: s.endpoint, p256dh, auth };
}

/** Saves this browser's subscription for the watcher (a browser that moves to another watcher moves its row). */
export async function savePushSubscription(sql: postgres.Sql, watcherId: string, s: PushSubscriptionRow): Promise<void> {
  // At most 5 browsers per person: the oldest gives way.
  await sql`insert into push_subscriptions (watcher_id, endpoint, p256dh, auth) values (${watcherId}, ${s.endpoint}, ${s.p256dh}, ${s.auth})
    on conflict (endpoint) do update set watcher_id = excluded.watcher_id, p256dh = excluded.p256dh, auth = excluded.auth`;
  await sql`delete from push_subscriptions where watcher_id = ${watcherId} and id not in (
    select id from push_subscriptions where watcher_id = ${watcherId} order by created_at desc limit 5)`;
}

export async function deletePushSubscription(sql: postgres.Sql, watcherId: string, endpoint: string): Promise<void> {
  await sql`delete from push_subscriptions where watcher_id = ${watcherId} and endpoint = ${endpoint}`;
}

/** The collector: every browser of a watcher, and the clean-up of one the push service no longer knows. */
export async function pushSubscriptionsOf(sql: postgres.Sql, watcherId: string): Promise<(PushSubscriptionRow & { id: number })[]> {
  const rows = await sql<(PushSubscriptionRow & { id: number })[]>`
    select id, endpoint, p256dh, auth from push_subscriptions where watcher_id = ${watcherId} order by created_at desc`;
  return rows.map((r) => ({ ...r, id: Number(r.id) }));
}
export async function dropPushSubscription(sql: postgres.Sql, id: number): Promise<void> {
  await sql`delete from push_subscriptions where id = ${id}`;
}
export async function pushWorked(sql: postgres.Sql, id: number): Promise<void> {
  await sql`update push_subscriptions set last_ok_at = now() where id = ${id}`;
}
