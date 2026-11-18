import { VARIANT_INTERVAL_MINUTES } from "./variants";

/** Adaptive check intervals (minutes). A product costs the same to watch for 1 or 1000 users. */
export type Priority = "hot" | "tracked" | "seed" | "catalog" | "cold";

// The collector runs once a day inside Kaspi's visit window (see window.ts).
// seed (18 h) is longer than the window, so a product is not checked twice in one day, and shorter than
// 24 h minus the window, so a product checked at the very end of today's window is due before tomorrow's opens.
// catalog (60 h) is due again on the third day, wherever in the window it was checked.
// hot is shorter than the window: a product near someone's target is re-checked within the same window. tracked is
// daily like seed since 16 Nov 2026 (the owner's go, DECISIONS "Stretching the daily requests"): prices move about
// once a day, and the 3-hourly re-checks of products far from any target cost ~40 requests a day.
export const INTERVAL_MINUTES: Record<Priority, number> = {
  hot: 60,
  tracked: 18 * 60,
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
  // Untracked products' pages monthly since 10 Nov 2026 (DECISIONS.md "More checks from the same rules"): names and
  // photos rarely change, and weekly re-reads cost ~90 requests a day. Watched products stay weekly.
  pageRefreshDays: { hot: 7, tracked: 7, seed: 30, catalog: 30, cold: 30 } satisfies Record<Priority, number>,
  /**
   * Overdue product pages refreshed per run for products nobody tracks (DECISIONS.md, 2026-11-04 "Tracked first,
   * real views, spread page refreshes"). Steady state needs ~70 a day; the cap spreads a batch first fetched on one
   * day (584 on 3 Nov 2026) over several days instead of spending ~600 requests at once a week later.
   */
  pageRefreshPerRun: 120,
  /**
   * The share of a run's requests kept for new products from the seed queue (DECISIONS.md, 2026-11-06 "A fixed share
   * for new products"): on 6 Nov re-checks of the 972 daily products took the whole window and the catalog grew by
   * 4. A quarter of ~1,330 requests is ~165 new products a day (2 requests each).
   * 0 since 8 Nov 2026 (the owner's rule "no daily gaps first"): with a quarter for new products, ~1 in 5 catalog
   * products missed a day. New products now come only once every due product is checked (the collector's fallback).
   */
  newShare: 0,
  /**
   * A product nobody tracks or opened lately whose price has not moved is checked every third day instead of daily
   * (8 Nov 2026, the owner's go): STABLE.minDays observed days in the last STABLE.days, all within STABLE.pct of
   * each other (the verdict's «Цена стабильна» band). Any move puts it back on daily checks.
   */
} as const;

export const STABLE = { days: 7, minDays: 3, pct: 2 } as const;

/**
 * Opened products (DECISIONS.md, 2026-11-16 "Stretching the daily requests"; the owner's go): checked daily for
 * VIEWED.dailyDays days after someone opens them, then every third day (the catalog tier) until VIEWED.maxDays.
 * Opening it again brings it to the next run (queueLane lane 1) and restarts the daily days. On 16 Nov products
 * opened in the last 14 days took 841 of the day's ~1 650 requests.
 */
export const VIEWED = { dailyDays: 3, maxDays: 14 } as const;

/**
 * Steady prices (same decision): a daily product nobody tracks (opened lately, or among the top catalog) whose
 * lowest price stayed within STEADY.pct for STEADY.days (STEADY.minDays observed days) is checked every second day.
 * Tracked products are never stretched by this.
 */
export const STEADY = { days: 5, minDays: 4, pct: 2, intervalMinutes: 36 * 60 } as const;

/** Whether daily lows (the last STEADY.days days, observed days only) say the price has been steady that long. */
export function isSteadyPrice(lows: number[]): boolean {
  if (lows.length < STEADY.minDays) return false;
  const lo = Math.min(...lows), hi = Math.max(...lows);
  return lo > 0 && hi <= lo * (1 + STEADY.pct / 100);
}

/**
 * Longer gaps where nothing happens (DECISIONS.md 2026-11-10 "More checks from the same rules"; 2026-11-18 "Calm
 * products weekly", the owner's go: on 18 Nov 696 of 1 314 daily checks were products whose lowest price had not moved
 * in 14 days). A catalog product nobody tracks whose observed lows over the last CALM.days days stay within CALM.pct,
 * with at least CALM.minDays observed days and the earliest at least CALM.minSpanDays ago, is checked weekly. The span
 * rule (not "7 of 14 days") keeps it calm under weekly checks. An untracked product nobody can buy (no offers) is
 * checked every 3 days. Opening a product or tracking it still brings it to the next run (queueLane), any move puts
 * it back on its tier, and its page says why the bars thinned out.
 */
export const CALM = { days: 21, minDays: 3, minSpanDays: 14, pct: 2, intervalMinutes: 7 * 24 * 60 } as const;
export const OUT_OF_STOCK_INTERVAL_MINUTES = 3 * 24 * 60;

/** Whether daily lows (the last CALM.days days, observed days only; `ago` = days before today) say the price is calm. */
export function isCalmPrice(lows: { p: number; ago: number }[]): boolean {
  if (lows.length < CALM.minDays || Math.max(...lows.map((l) => l.ago)) < CALM.minSpanDays) return false;
  const ps = lows.map((l) => l.p);
  const lo = Math.min(...ps), hi = Math.max(...ps);
  return lo > 0 && hi <= lo * (1 + CALM.pct / 100);
}

/**
 * The check interval for a product's tier, stretched for calm catalog products, untracked ones out of stock, and
 * later colour/memory variants of a device nobody tracks or opened lately (`variant`, 14 Nov 2026: every third day).
 */
export function intervalFor(priority: Priority, p: { calm: boolean; inStock: boolean; variant?: boolean; price?: number | null; steady?: boolean }): number {
  const base = INTERVAL_MINUTES[priority];
  if (priority === "hot" || priority === "tracked") return base;
  if (!p.inStock) return Math.max(base, OUT_OF_STOCK_INTERVAL_MINUTES);
  // Under AUTO_MIN_PRICE and nobody tracks it: no automatic checks (the owner, 15 Nov). A person opening it again
  // still brings it to the next run (queueLane lane 1); tracking it puts it back on its tier.
  if (p.price != null && p.price < AUTO_MIN_PRICE) return PARKED_MINUTES;
  const calm = priority === "catalog" && p.calm ? Math.max(base, CALM.intervalMinutes)
    : priority === "seed" && p.steady ? Math.max(base, STEADY.intervalMinutes) : base;
  return p.variant ? Math.max(calm, VARIANT_INTERVAL_MINUTES) : calm;
}

/** Below this price a product is kept off the home and drop lists (15 Nov 2026). */
export const CHEAP = { price: 5_000 } as const;

/**
 * Below this price a product nobody tracks gets no automatic check (the owner, 15 Nov 2026: «i dont want to check
 * anything cheaper than 50k tenge at all with automatic checks»): only people's products are checked there, when they
 * track it or open it again. PARKED_MINUTES is "not by schedule": a year, so the row stays valid.
 */
export const AUTO_MIN_PRICE = 50_000;
export const PARKED_MINUTES = 365 * 24 * 60;

/** Whether daily lows (the last STABLE.days days, observed days only) say the price is stable. */
export function isStablePrice(lows: number[]): boolean {
  if (lows.length < STABLE.minDays) return false;
  const lo = Math.min(...lows), hi = Math.max(...lows);
  return lo > 0 && hi <= lo * (1 + STABLE.pct / 100);
}

/**
 * Whether the collector adds a new product from the seed queue now: while new products have used less than
 * CATALOG.newShare of the run's requests so far (0: never between re-checks, only once nothing is due).
 * Tracked products and visitor requests are served before either.
 */
export function newProductTurn(newRequests: number, allRequests: number): boolean {
  return newRequests < CATALOG.newShare * allRequests;
}

/**
 * Whether a check also fetches the product page (title, image, Kaspi reviews). A product never fetched always
 * does; a watched one (hot, tracked) as soon as its page is older than its tier allows; others only while this
 * run's refresh budget lasts, so an overdue page waits a day rather than crowding out price checks.
 */
export function needsPageRefresh(p: { pageCheckedAt: Date | null; priority: Priority; refreshedThisRun: number; now: Date }): boolean {
  if (!p.pageCheckedAt) return true;
  const overdue = p.now.getTime() - p.pageCheckedAt.getTime() > CATALOG.pageRefreshDays[p.priority] * 86_400_000;
  if (!overdue) return false;
  return p.priority === "hot" || p.priority === "tracked" || p.refreshedThisRun < CATALOG.pageRefreshPerRun;
}

export function priorityFor(p: {
  activeTrackings: number;
  minDistanceToTargetPct: number | null; // smallest (price - target)/target across trackings
  isSeed: boolean;
  lastViewedDaysAgo: number | null;
  /** Seed products with more Kaspi reviews than this one (0 while its reviews are unknown); omitted = top. */
  seedRank?: number;
  /** isStablePrice of its recent daily lows: a catalog product nobody watches is then checked every third day. */
  stable?: boolean;
}): Priority {
  if (p.activeTrackings > 0 && p.minDistanceToTargetPct !== null && p.minDistanceToTargetPct <= 10) return "hot";
  if (p.activeTrackings > 0) return "tracked";
  const viewed = p.lastViewedDaysAgo;
  if (viewed !== null && viewed <= VIEWED.dailyDays) return "seed";
  if (p.isSeed) return (p.seedRank ?? 0) < CATALOG.dailyTop && !p.stable ? "seed" : "catalog";
  if (viewed !== null && viewed <= VIEWED.maxDays) return "catalog";
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

/**
 * Queue lanes (DECISIONS.md, 2026-11-05 "What people want is checked first"), worked out from live data on every
 * claim, never from a stored label that may be stale:
 *   0 = someone tracks it: due when its tier says so, or at the latest TRACKED_MAX_AGE_MIN after its last check;
 *   1 = a person opened it (pasted a link, searched, followed a link) since its last check and it is not checked
 *       today: due in the next run, whatever its tier;
 *   2 = everything else (catalog enrichment): due by its tier.
 * A product whose last check failed (failCount > 0) waits for its retry time (backoffMinutes) in every lane: the
 * lane decides the order, never that a failing product is asked for again at once.
 * New products pasted by visitors (seed_queue) are fetched before lane 2 as well. The collector's SQL in
 * apps/worker/src/collect.ts mirrors this function.
 */
export const USER_INTEREST = { viewedWithinDays: 7, trackedMaxAgeMin: INTERVAL_MINUTES.tracked } as const;

export function queueLane(p: {
  activeTrackings: number; lastViewedAt: Date | null; lastCheckedAt: Date | null; nextCheckAt: Date; intervalMinutes: number; now: Date;
  failCount?: number;
}): { lane: 0 | 1 | 2; due: boolean } {
  const checked = p.lastCheckedAt?.getTime() ?? -Infinity;
  const tierDue = p.nextCheckAt.getTime() <= p.now.getTime();
  const retrying = (p.failCount ?? 0) > 0;
  if (p.activeTrackings > 0) {
    const maxAge = Math.min(p.intervalMinutes, USER_INTEREST.trackedMaxAgeMin) * 60_000;
    return { lane: 0, due: tierDue || (!retrying && p.now.getTime() - checked >= maxAge) };
  }
  const viewed = p.lastViewedAt?.getTime() ?? -Infinity;
  const recent = p.now.getTime() - viewed <= USER_INTEREST.viewedWithinDays * 86_400_000;
  const checkedToday = p.lastCheckedAt !== null && almatyDate(p.lastCheckedAt) === almatyDate(p.now);
  if (recent && viewed > checked && !checkedToday) return { lane: 1, due: !retrying || tierDue };
  return { lane: 2, due: tierDue };
}

const almatyDate = (d: Date) => new Date(d.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
