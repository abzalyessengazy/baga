/** Adaptive check intervals (minutes). A product costs the same to watch for 1 or 1000 users. */
export type Priority = "hot" | "tracked" | "seed" | "cold";

// The collector runs once a day inside Kaspi's visit window (see window.ts).
// seed (18 h) is longer than the window, so a product is not checked twice in one day, and shorter than
// 24 h minus the window, so a product checked at the very end of today's window is due before tomorrow's opens.
// hot and tracked are shorter than the window: such products are re-checked within the same window.
export const INTERVAL_MINUTES: Record<Priority, number> = {
  hot: 60,
  tracked: 180,
  seed: 18 * 60,
  cold: 7 * 24 * 60,
};

export function priorityFor(p: {
  activeTrackings: number;
  minDistanceToTargetPct: number | null; // smallest (price - target)/target across trackings
  isSeed: boolean;
  lastViewedDaysAgo: number | null;
}): Priority {
  if (p.activeTrackings > 0 && p.minDistanceToTargetPct !== null && p.minDistanceToTargetPct <= 10) return "hot";
  if (p.activeTrackings > 0) return "tracked";
  if (p.isSeed || (p.lastViewedDaysAgo !== null && p.lastViewedDaysAgo <= 14)) return "seed";
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
