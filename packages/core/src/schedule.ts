/** Adaptive check intervals (minutes). A product costs the same to watch for 1 or 1000 users. */
export type Priority = "hot" | "tracked" | "seed" | "catalog" | "cold";

// The collector runs once a day inside Kaspi's visit window (see window.ts).
// seed (18 h) is longer than the window, so a product is not checked twice in one day, and shorter than
// 24 h minus the window, so a product checked at the very end of today's window is due before tomorrow's opens.
// catalog (60 h) is due again on the third day, wherever in the window it was checked.
// hot and tracked are shorter than the window: such products are re-checked within the same window.
export const INTERVAL_MINUTES: Record<Priority, number> = {
  hot: 60,
  tracked: 180,
  seed: 18 * 60,
  catalog: 60 * 60,
  cold: 7 * 24 * 60,
};

/** Claim order when the day's requests run short: the least watched products slip first. */
export const PRIORITY_ORDER: Priority[] = ["hot", "tracked", "seed", "catalog", "cold"];

/**
 * Catalog tiers (DECISIONS.md, 2026-11-03 "More products in the same Kaspi budget"): the seed products with the
 * most Kaspi reviews are checked daily, the rest every third day. Their product page (title, image, reviews)
 * is refreshed less often than for watched products.
 */
export const CATALOG = {
  dailyTop: 400,
  pageRefreshDays: { hot: 7, tracked: 7, seed: 7, catalog: 30, cold: 30 } satisfies Record<Priority, number>,
} as const;

export function priorityFor(p: {
  activeTrackings: number;
  minDistanceToTargetPct: number | null; // smallest (price - target)/target across trackings
  isSeed: boolean;
  lastViewedDaysAgo: number | null;
  /** Seed products with more Kaspi reviews than this one (0 while its reviews are unknown); omitted = top. */
  seedRank?: number;
}): Priority {
  if (p.activeTrackings > 0 && p.minDistanceToTargetPct !== null && p.minDistanceToTargetPct <= 10) return "hot";
  if (p.activeTrackings > 0) return "tracked";
  if (p.lastViewedDaysAgo !== null && p.lastViewedDaysAgo <= 14) return "seed";
  if (p.isSeed) return (p.seedRank ?? 0) < CATALOG.dailyTop ? "seed" : "catalog";
  return "cold";
}

/** Retry backoff after a failed check, in minutes: 5, 20, 60, then the normal interval. */
export function backoffMinutes(failCount: number, normal: number): number {
  const steps = [5, 20, 60];
  return failCount >= 1 && failCount <= steps.length ? steps[failCount - 1]! : normal;
}

/** Hold-and-recheck rule for implausible jumps. */
export function isSuspiciousJump(previous: number | null, next: number, maxChangePct = 60): boolean {
  if (previous === null || previous === 0) return false;
  return Math.abs((next - previous) / previous) * 100 > maxChangePct;
}
