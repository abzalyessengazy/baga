import { describe, expect, it } from "vitest";
import { plausibleMove, stillMoving, type Mover } from "./movers";

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

describe("plausibleMove", () => {
  it("keeps real moves, up to an 80% drop or a 5x rise", () => {
    expect(plausibleMove({ was: 150800, now: 55800 })).toBe(true); // −63%
    expect(plausibleMove({ was: 100000, now: 20000 })).toBe(true); // −80%
    expect(plausibleMove({ was: 20000, now: 100000 })).toBe(true); // 5x
  });
  it("drops listing errors (17 Nov: shoes «was 1 450 000», now 85 000)", () => {
    expect(plausibleMove({ was: 1450000, now: 85000 })).toBe(false);
    expect(plausibleMove({ was: 85000, now: 1450000 })).toBe(false);
  });
});
