import { describe, expect, it } from "vitest";
import { share, targetMark, TARGETS } from "./targets";

describe("targetMark", () => {
  it("is on at or above the target, half from 50%, off below", () => {
    expect(targetMark(100, 100)).toBe("on");
    expect(targetMark(120, 100)).toBe("on");
    expect(targetMark(50, 100)).toBe("half");
    expect(targetMark(49, 100)).toBe("off");
    expect(targetMark(0.3, 0.6)).toBe("half");
  });
  it("treats a zero target as met", () => {
    expect(targetMark(0, 0)).toBe("on");
  });
});

describe("share", () => {
  it("divides, and is 0 with nothing to divide", () => {
    expect(share(1, 4)).toBe(0.25);
    expect(share(3, 0)).toBe(0);
  });
});

describe("TARGETS", () => {
  it("has a deadline date and rates between 0 and 1", () => {
    expect(TARGETS.by).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const r of [TARGETS.productOpenRate, TARGETS.connectedRate, TARGETS.utmShare]) expect(r).toBeGreaterThan(0), expect(r).toBeLessThanOrEqual(1);
  });
});
