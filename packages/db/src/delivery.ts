import type postgres from "postgres";
import { DELIVERY, afterFailedDelivery, type DeliveryOutcome } from "@baga/core";

/**
 * Notification delivery state (migration 0015; rules in packages/core/src/delivery.ts, DECISIONS.md 2026-11-05
 * "Recoverable delivery"). The collector claims, sends and records; these queries hold the rules that need SQL.
 */
export type DeliveryChannel = "telegram" | "email";

/**
 * Claims up to `limit` due messages of one channel ('sending'): an overlapping run skips them (skip locked). Only
 * messages younger than DELIVERY.maxAgeHours whose watcher can still receive them. Oldest first.
 */
export async function claimNotifications(sql: postgres.Sql, channel: DeliveryChannel, limit = 30): Promise<number[]> {
  const reachable = channel === "telegram"
    ? sql`w.telegram_chat_id is not null`
    : sql`w.email_confirmed_at is not null and w.email_stop_code is not null`;
  const rows = await sql<{ id: number }[]>`
    update notifications set status = 'sending', claimed_at = now(), send_started_at = null
    where id in (
      select n.id from notifications n join trackings t on t.id = n.tracking_id join watchers w on w.id = t.watcher_id
      where n.status = 'queued' and n.channel = ${channel} and n.next_attempt_at <= now() and ${reachable}
        and n.created_at > now() - make_interval(hours => ${DELIVERY.maxAgeHours})
      order by n.created_at limit ${limit} for update of n skip locked)
    returning id`;
  return rows.map((r) => Number(r.id)).sort((a, b) => a - b);
}

/** Right before the provider is called: counts the attempt and marks that the message may now go out. */
export async function startSend(sql: postgres.Sql, id: number): Promise<void> {
  await sql`update notifications set send_started_at = now(), attempts = attempts + 1 where id = ${id}`;
}

export async function markSent(sql: postgres.Sql, id: number, providerMessageId: string): Promise<void> {
  await sql`update notifications set status = 'sent', sent_at = now(), provider_message_id = ${providerMessageId},
    last_error = null, claimed_at = null where id = ${id}`;
}

/** A failed send: queued again after its retry time, or failed for good (afterFailedDelivery). */
export async function markFailed(sql: postgres.Sql, id: number, permanent: boolean, error: string): Promise<DeliveryOutcome> {
  const [n] = await sql<{ attempts: number }[]>`select attempts from notifications where id = ${id}`;
  const next = afterFailedDelivery(n?.attempts ?? DELIVERY.maxAttempts, permanent);
  await sql`update notifications set status = ${next.status}, claimed_at = null, send_started_at = null,
    last_error = ${error.slice(0, 500)},
    next_attempt_at = now() + make_interval(mins => ${next.status === "queued" ? next.retryInMinutes : 0})
    where id = ${id}`;
  return next;
}

/**
 * Before sending: claims a crash left behind (DELIVERY.staleClaimMinutes) go back to the queue, except a Telegram
 * message whose send had started: Telegram has no idempotency key, so it is given up rather than risk sending it
 * twice (an email is retried; Resend's Idempotency-Key drops a duplicate). Messages older than
 * DELIVERY.maxAgeHours are given up.
 */
export async function tidyDeliveries(sql: postgres.Sql): Promise<void> {
  await sql`update notifications set
      status = case when channel = 'telegram' and send_started_at is not null then 'failed' else 'queued' end,
      last_error = case when channel = 'telegram' and send_started_at is not null
        then 'interrupted while sending: may or may not have arrived' else 'claim interrupted, retrying' end,
      claimed_at = null, send_started_at = null
    where status = 'sending' and claimed_at < now() - make_interval(mins => ${DELIVERY.staleClaimMinutes})`;
  await sql`update notifications set status = 'failed', last_error = coalesce(last_error, 'expired')
    where status = 'queued' and created_at <= now() - make_interval(hours => ${DELIVERY.maxAgeHours})`;
}
