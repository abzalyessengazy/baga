import { describe, expect, it } from "vitest";
import { priorityFor, backoffMinutes, isSuspiciousJump, needsPageRefresh, queueLane, newProductTurn, isStablePrice, isCalmPrice, intervalFor, INTERVAL_MINUTES, CATALOG } from "./schedule";
import { VISIT_WINDOW_MINUTES } from "./window";
import { formatTenge, toTenge } from "./money";

describe("schedule", () => {
  it("refreshes overdue product pages for unwatched products only while the run's budget lasts", () => {
    const now = new Date("2026-11-10T05:00:00Z");
    const old = new Date("2026-11-03T04:00:00Z"); // 7 days and 1 hour ago
    const fresh = new Date("2026-11-08T04:00:00Z");
    const base = { now, refreshedThisRun: 0 };
    expect(needsPageRefresh({ ...base, pageCheckedAt: null, priority: "seed", refreshedThisRun: 10_000 })).toBe(true);
    expect(needsPageRefresh({ ...base, pageCheckedAt: fresh, priority: "seed" })).toBe(false);
    expect(needsPageRefresh({ ...base, pageCheckedAt: old, priority: "seed" })).toBe(false); // 30 days since 10 Nov
    const month = new Date("2026-10-10T04:00:00Z"); // 31 days ago
    expect(needsPageRefresh({ ...base, pageCheckedAt: month, priority: "seed" })).toBe(true);
    expect(needsPageRefresh({ ...base, pageCheckedAt: month, priority: "seed", refreshedThisRun: CATALOG.pageRefreshPerRun })).toBe(false);
    expect(needsPageRefresh({ ...base, pageCheckedAt: old, priority: "tracked", refreshedThisRun: CATALOG.pageRefreshPerRun })).toBe(true);
    expect(needsPageRefresh({ ...base, pageCheckedAt: old, priority: "hot", refreshedThisRun: CATALOG.pageRefreshPerRun })).toBe(true);
    expect(needsPageRefresh({ ...base, pageCheckedAt: old, priority: "catalog" })).toBe(false); // 30 days for catalog
  });
  it("checks seed products exactly once per daily visit window", () => {
    // Longer than the window: no second check the same day. Short enough that a product checked as the
    // window closes is due again before the next window opens, so every day gets a point.
    expect(INTERVAL_MINUTES.seed).toBeGreaterThan(VISIT_WINDOW_MINUTES);
    expect(INTERVAL_MINUTES.seed).toBeLessThanOrEqual(24 * 60 - VISIT_WINDOW_MINUTES);
  });
  it("checks catalog products on every third day", () => {
    // Checked anywhere in today's window, due again after the window two days later and before the third day's opens.
    expect(INTERVAL_MINUTES.catalog).toBeGreaterThan(2 * 24 * 60 + VISIT_WINDOW_MINUTES);
    expect(INTERVAL_MINUTES.catalog).toBeLessThanOrEqual(3 * 24 * 60 - VISIT_WINDOW_MINUTES);
  });
  it("checks the most reviewed seed products daily, the rest every third day", () => {
    const seed = { activeTrackings: 0, minDistanceToTargetPct: null, isSeed: true, lastViewedDaysAgo: null };
    expect(priorityFor({ ...seed, seedRank: 0 })).toBe("seed");
    expect(priorityFor({ ...seed, seedRank: CATALOG.dailyTop - 1 })).toBe("seed");
    expect(priorityFor({ ...seed, seedRank: CATALOG.dailyTop })).toBe("catalog");
    // Someone looked at it: daily again, whatever its rank.
    expect(priorityFor({ ...seed, seedRank: 5_000, lastViewedDaysAgo: 3 })).toBe("seed");
    expect(priorityFor({ ...seed, seedRank: 5_000, activeTrackings: 1, minDistanceToTargetPct: 40 })).toBe("tracked");
  });
  it("prioritises products near a target", () => {
    expect(priorityFor({ activeTrackings: 2, minDistanceToTargetPct: 5, isSeed: false, lastViewedDaysAgo: null })).toBe("hot");
    expect(priorityFor({ activeTrackings: 1, minDistanceToTargetPct: 30, isSeed: false, lastViewedDaysAgo: null })).toBe("tracked");
    expect(priorityFor({ activeTrackings: 0, minDistanceToTargetPct: null, isSeed: true, lastViewedDaysAgo: null })).toBe("seed");
    expect(priorityFor({ activeTrackings: 0, minDistanceToTargetPct: null, isSeed: false, lastViewedDaysAgo: 90 })).toBe("cold");
  });
  it("backs off", () => {
    expect([1, 2, 3, 4].map((n) => backoffMinutes(n, 180))).toEqual([5, 20, 60, 180]);
  });
  it("flags implausible jumps", () => {
    expect(isSuspiciousJump(749_364, 74_936)).toBe(true);
    expect(isSuspiciousJump(749_364, 699_990)).toBe(false);
    expect(isSuspiciousJump(null, 1)).toBe(false);
  });
});

describe("money", () => {
  it("formats tenge", () => {
    expect(formatTenge(749364)).toBe("749 364 ₸");
  });
  it("rounds floats from the API", () => {
    expect(toTenge(749364.0)).toBe(749364);
    expect(() => toTenge(-1)).toThrow();
  });
});

describe("queueLane", () => {
  const now = new Date("2026-11-05T05:00:00Z"); // 10:00 Almaty
  const h = (n: number) => new Date(now.getTime() - n * 3_600_000);
  const base = { activeTrackings: 0, lastViewedAt: null, lastCheckedAt: h(24), nextCheckAt: h(-5), intervalMinutes: 1080, now };

  it("puts a tracked product first and makes it due 3 h after its last check, even with a stale catalog tier", () => {
    expect(queueLane({ ...base, activeTrackings: 1 })).toEqual({ lane: 0, due: true });
    expect(queueLane({ ...base, activeTrackings: 1, lastCheckedAt: h(1) })).toEqual({ lane: 0, due: false });
    expect(queueLane({ ...base, activeTrackings: 1, lastCheckedAt: null })).toEqual({ lane: 0, due: true });
  });

  it("checks a product a person opened in the next run, once a day", () => {
    expect(queueLane({ ...base, lastViewedAt: h(2) })).toEqual({ lane: 1, due: true }); // opened last night, checked yesterday
    expect(queueLane({ ...base, lastViewedAt: h(0.1), lastCheckedAt: h(0.5) })).toEqual({ lane: 2, due: false }); // already checked today
    expect(queueLane({ ...base, lastViewedAt: h(30) })).toEqual({ lane: 2, due: false }); // opened before its last check
    expect(queueLane({ ...base, lastViewedAt: h(24 * 8), lastCheckedAt: h(24 * 9) })).toEqual({ lane: 2, due: false }); // too long ago
  });

  it("makes a failing product wait for its retry time in every lane", () => {
    const failed = { ...base, failCount: 1, nextCheckAt: h(-0.1) }; // retry in 6 minutes
    expect(queueLane({ ...failed, activeTrackings: 1 })).toEqual({ lane: 0, due: false });
    expect(queueLane({ ...failed, lastViewedAt: h(2) })).toEqual({ lane: 1, due: false });
    expect(queueLane({ ...failed, activeTrackings: 1, nextCheckAt: h(0) })).toEqual({ lane: 0, due: true }); // retry time reached
  });

  it("leaves catalog products to their tier", () => {
    expect(queueLane(base)).toEqual({ lane: 2, due: false });
    expect(queueLane({ ...base, nextCheckAt: h(1) })).toEqual({ lane: 2, due: true });
  });
});

describe("newProductTurn", () => {
  it("never adds new products between re-checks since 8 Nov (no daily gaps first): only once nothing is due", () => {
    expect(newProductTurn(0, 0)).toBe(false);
    expect(newProductTurn(0, 4)).toBe(false);
    expect(newProductTurn(0, 1300)).toBe(false);
  });
});

describe("stable prices are checked every third day (8 Nov 2026)", () => {
  it("needs 3 observed days within 2%", () => {
    expect(isStablePrice([100_000, 101_000, 100_500])).toBe(true);
    expect(isStablePrice([100_000, 100_000])).toBe(false); // too few days
    expect(isStablePrice([100_000, 103_000, 100_000])).toBe(false); // a 3% move
  });
  it("only for catalog products nobody tracks or opened lately", () => {
    expect(priorityFor({ activeTrackings: 0, minDistanceToTargetPct: null, isSeed: true, lastViewedDaysAgo: null, seedRank: 5, stable: true })).toBe("catalog");
    expect(priorityFor({ activeTrackings: 0, minDistanceToTargetPct: null, isSeed: true, lastViewedDaysAgo: null, seedRank: 5, stable: false })).toBe("seed");
    expect(priorityFor({ activeTrackings: 0, minDistanceToTargetPct: null, isSeed: true, lastViewedDaysAgo: 2, seedRank: 5, stable: true })).toBe("seed");
    expect(priorityFor({ activeTrackings: 1, minDistanceToTargetPct: null, isSeed: true, lastViewedDaysAgo: null, seedRank: 5, stable: true })).toBe("tracked");
  });
});

describe("longer gaps where nothing happens (10 Nov 2026)", () => {
  it("calls a price calm after 7+ observed days within 2%", () => {
    expect(isCalmPrice(Array(7).fill(50_000))).toBe(true);
    expect(isCalmPrice([50_000, 50_500, 50_900, 50_000, 50_000, 50_000, 50_000])).toBe(true);
    expect(isCalmPrice(Array(6).fill(50_000))).toBe(false); // too few days
    expect(isCalmPrice([...Array(6).fill(50_000), 52_000])).toBe(false); // a 4% move
  });
  it("checks calm catalog products every 5 days and untracked ones out of stock every 3", () => {
    expect(intervalFor("catalog", { calm: true, inStock: true })).toBe(5 * 24 * 60);
    expect(intervalFor("catalog", { calm: false, inStock: true })).toBe(INTERVAL_MINUTES.catalog);
    expect(intervalFor("seed", { calm: true, inStock: true })).toBe(INTERVAL_MINUTES.seed); // opened lately: daily
    expect(intervalFor("seed", { calm: false, inStock: false })).toBe(3 * 24 * 60);
    expect(intervalFor("catalog", { calm: true, inStock: false })).toBe(3 * 24 * 60);
  });
  it("checks a later colour/memory variant every third day, unless someone tracks it", () => {
    expect(intervalFor("seed", { calm: false, inStock: true, variant: true })).toBe(3 * 24 * 60);
    expect(intervalFor("catalog", { calm: true, inStock: true, variant: true })).toBe(5 * 24 * 60);
    expect(intervalFor("tracked", { calm: false, inStock: true, variant: true })).toBe(INTERVAL_MINUTES.tracked);
  });
  it("never stretches what someone tracks", () => {
    expect(intervalFor("tracked", { calm: true, inStock: false })).toBe(INTERVAL_MINUTES.tracked);
    expect(intervalFor("hot", { calm: true, inStock: false })).toBe(INTERVAL_MINUTES.hot);
  });
  it("re-reads untracked product pages monthly, watched ones weekly", () => {
    expect(CATALOG.pageRefreshDays.seed).toBe(30);
    expect(CATALOG.pageRefreshDays.tracked).toBe(7);
  });
});
