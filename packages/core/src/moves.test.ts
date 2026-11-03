import { describe, expect, it } from "vitest";
import { moveDirection, MOVE_MIN_PCT } from "./moves";

describe("moveDirection", () => {
  it("ignores seller nudges under MOVE_MIN_PCT", () => {
    // 3 Nov 2026: an iPhone moved 897 581 → 895 755 → 897 900; neither step is a change.
    expect(moveDirection(897_581, 895_755)).toBe(0);
    expect(moveDirection(895_755, 897_900)).toBe(0);
  });
  it("counts a change from exactly MOVE_MIN_PCT", () => {
    expect(MOVE_MIN_PCT).toBe(1);
    expect(moveDirection(100_000, 99_000)).toBe(-1);
    expect(moveDirection(100_000, 99_001)).toBe(0);
    expect(moveDirection(100_000, 101_000)).toBe(1);
  });
});
