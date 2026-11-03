import { describe, expect, it } from "vitest";
import { DROP_PRESETS, targetForDrop } from "./target";

describe("target presets", () => {
  it("take the smaller percentage of each range", () => {
    expect(DROP_PRESETS.map((p) => targetForDrop(100_000, p.from))).toEqual([95_000, 90_000, 75_000]);
  });
  it("round down to a round number, never a smaller drop", () => {
    expect(targetForDrop(149_990, 5)).toBe(142_000); // 142 490.5 → 142 000
    expect(targetForDrop(18_990, 10)).toBe(17_000);  // 17 091 → 17 000
    expect(targetForDrop(2_349, 5)).toBe(2_230);     // 2 231.55 → 2 230
  });
  it("gives nothing for prices too small to drop", () => {
    expect(targetForDrop(5, 5)).toBeNull();
  });
});
