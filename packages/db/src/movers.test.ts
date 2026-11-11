import { describe, expect, it } from "vitest";
import { stillMoving, type Mover } from "./movers";

const m = (was: number, now: number, current: number | null): Mover => ({
  externalId: "100115381", title: "x", titleKk: null, imageUrl: null, now, was, pct: 0, offerCount: 7,
  checkedAt: new Date("2026-11-10T05:00:00Z"), current,
});

describe("stillMoving", () => {
  it("keeps a day drop that the latest check has not undone", () => {
    expect(stillMoving(m(3470, 2700, 2700))).toBe(true);
    expect(stillMoving(m(3470, 2700, 2500))).toBe(true);
    expect(stillMoving(m(3470, 2700, null))).toBe(true);
  });
  it("drops a day drop whose price is back up (11 Nov: headphones 3 470 → 2 700 → 3 470)", () => {
    expect(stillMoving(m(3470, 2700, 3470))).toBe(false);
    expect(stillMoving(m(3470, 2700, 3600))).toBe(false);
  });
  it("works the same way for rises", () => {
    expect(stillMoving(m(2700, 3470, 3470))).toBe(true);
    expect(stillMoving(m(2700, 3470, 2700))).toBe(false);
  });
});
