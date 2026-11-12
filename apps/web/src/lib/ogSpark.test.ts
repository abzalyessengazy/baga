import { describe, expect, it } from "vitest";
import { sparkline } from "./ogSpark";

describe("sparkline", () => {
  it("needs two observed days", () => {
    expect(sparkline([], 100, 50)).toBeNull();
    expect(sparkline([{ day: "2026-11-01", price: 100 }], 100, 50)).toBeNull();
  });

  it("breaks the line at a missing day instead of bridging it", () => {
    const s = sparkline([
      { day: "2026-11-01", price: 200 }, { day: "2026-11-02", price: 100 },
      { day: "2026-11-04", price: 150 },
      { day: "2026-11-06", price: 100 }, { day: "2026-11-07", price: 200 },
    ], 66, 56, 60, 3)!;
    expect(s.lines).toEqual(["3,3 13,53", "53,53 63,3"]);
    expect(s.dots).toEqual([{ x: 33, y: 28 }]);
    expect(s.last).toEqual({ x: 63, y: 3 });
  });

  it("keeps only the last `days` calendar days; a flat price there has no chart", () => {
    const old = { day: "2026-10-01", price: 999 };
    expect(sparkline([old, { day: "2026-11-09", price: 500 }, { day: "2026-11-10", price: 500 }], 100, 40, 7, 0)).toBeNull();
    expect(sparkline([old, { day: "2026-11-09", price: 500 }, { day: "2026-11-10", price: 400 }], 100, 40, 7, 0)!.lines).toEqual(["0,0 100,40"]);
  });
});
