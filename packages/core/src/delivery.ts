/**
 * Delivery of Telegram and email messages (DECISIONS.md, 2026-11-05 "Recoverable delivery").
 * - A message is claimed ('sending') before it is sent, so overlapping runs never send it twice.
 * - A failure the provider may get over (timeout, 429, 5xx) is tried again after DELIVERY.retryMinutes, up to
 *   DELIVERY.maxAttempts; a permanent one (blocked bot, unknown chat, rejected address) fails at once.
 * - A message older than DELIVERY.maxAgeHours is not sent any more: an old price would mislead.
 * - A claim left behind by a crash goes back to the queue. If the send had already started, email is sent again
 *   under the same Resend Idempotency-Key (Resend drops a duplicate); Telegram has no such key, so that one
 *   message is given up rather than risk sending it twice.
 */
export const DELIVERY = { retryMinutes: [5, 30, 120, 360], maxAttempts: 5, maxAgeHours: 48, staleClaimMinutes: 15 } as const;

export type DeliveryOutcome = { status: "queued"; retryInMinutes: number } | { status: "failed" };

/** What happens after a failed attempt; `attempts` counts the one that just failed. */
export function afterFailedDelivery(attempts: number, permanent: boolean): DeliveryOutcome {
  if (permanent || attempts >= DELIVERY.maxAttempts) return { status: "failed" };
  const steps = DELIVERY.retryMinutes;
  return { status: "queued", retryInMinutes: steps[Math.min(attempts, steps.length) - 1] ?? steps[steps.length - 1]! };
}

/** HTTP statuses a retry cannot fix: the request itself or the recipient is wrong (429 = slow down, so retry). */
export function isPermanentHttpStatus(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}
