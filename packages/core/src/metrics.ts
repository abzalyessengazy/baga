/**
 * Metric kinds, the same in the Telegram report, /admin and /admin/business (docs/STATS.md, "KPI definitions"):
 * - visit-based: one browser tab (events.sid), all history from 3 Nov 2026;
 * - person-based: one browser (events.vid), only for days fully covered since the id went live on 11 Nov 2026;
 * - account-based: watchers and trackings, exact for all history.
 * A period that starts before PERSON_METRICS_FROM gets no person numbers: visits are never relabelled as people.
 */
export const PERSON_METRICS_FROM = "2026-11-12";

/** Whether person-based numbers are reliable for a period starting on `from` (YYYY-MM-DD, Almaty). */
export function personReliable(from: string): boolean {
  return from >= PERSON_METRICS_FROM;
}

/** The outcome of a pasted Kaspi link, sent as the `paste` event's detail (from 11 Nov 2026; older events have none). */
export const PASTE_OUTCOMES = [
  "ok", "queued", "not_a_url", "not_kaspi", "not_a_product", "short_link_failed", "check_failed", "rate_limited", "network", "unknown",
] as const;
export type PasteOutcome = (typeof PASTE_OUTCOMES)[number];

/** The resolve answer (or a thrown request) as a paste outcome. */
export function pasteOutcome(r: { productId?: string; pendingLink?: string; error?: string } | "network"): PasteOutcome {
  if (r === "network") return "network";
  if (r.productId) return "ok";
  if (r.pendingLink) return "queued";
  switch (r.error) {
    case "not_a_url": case "not_kaspi": case "not_a_product": return r.error;
    case "short_link": return "short_link_failed";
    case "check_failed": case "check_blocked": return "check_failed";
    case "too_many": return "rate_limited";
    default: return "unknown";
  }
}
