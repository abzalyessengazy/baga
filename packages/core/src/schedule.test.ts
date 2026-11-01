import { describe, expect, it } from "vitest";
import { priorityFor, backoffMinutes, isSuspiciousJump, INTERVAL_MINUTES } from "./schedule";
import { VISIT_WINDOW_MINUTES } from "./window";
import { formatTenge, toTenge } from "./money";

describe("schedule", () => {
  it("checks seed products exactly once per daily visit window", () => {
    // Longer than the window: no second check the same day. Short enough that a product checked as the
    // window closes is due again before the next window opens, so every day gets a point.
    expect(INTERVAL_MINUTES.seed).toBeGreaterThan(VISIT_WINDOW_MINUTES);
    expect(INTERVAL_MINUTES.seed).toBeLessThanOrEqual(24 * 60 - VISIT_WINDOW_MINUTES);
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
