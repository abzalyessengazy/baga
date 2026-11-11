/**
 * The owner's 30-day targets (set 11 Nov 2026 for 11 Dec 2026; DECISIONS.md, 2026-11-11 "Daily owner report").
 * The daily report compares each day with these. Change them here; the report shows the date they are for.
 */
export const TARGETS = {
  by: "2026-12-11",
  /** Distinct visitors a day (7-day average). */
  visitorsPerDay: 100,
  /** Share of visits that open a product. */
  productOpenRate: 0.5,
  /** New price alerts in the last 7 days. */
  alertsPerWeek: 35,
  /** Share of alert users with Telegram or a confirmed email. */
  connectedRate: 0.6,
  /** Trackings answered «Да, купил» (all time). */
  boughtYes: 5,
  /** Share of visitors arriving with a utm_source (posts, campaigns). */
  utmShare: 0.4,
} as const;

export type TargetMark = "on" | "half" | "off";

/** On target at 100% of it or more, "half" from 50%, else "off". A zero target is always on. */
export function targetMark(actual: number, target: number): TargetMark {
  if (target <= 0 || actual >= target) return "on";
  return actual >= target / 2 ? "half" : "off";
}

/** actual / total, 0 when there is nothing to divide. */
export function share(actual: number, total: number): number {
  return total > 0 ? actual / total : 0;
}
