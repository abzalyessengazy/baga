import { describe, expect, it } from "vitest";
import { biggestDrop, onePerCategory } from "./digest";

describe("digest selection", () => {
  it("keeps the first product of each category, in order", () => {
    const items = [
      { externalId: "a", category: "Ноутбуки" }, { externalId: "b", category: "Фены" },
      { externalId: "c", category: "Ноутбуки" }, { externalId: "d", category: null }, { externalId: "e", category: null },
    ];
    expect(onePerCategory(items).map((x) => x.externalId)).toEqual(["a", "b", "d", "e"]);
  });
  it("picks the biggest tenge drop, the bigger percent on a tie", () => {
    expect(biggestDrop([{ diff: 7320, pct: -27 }, { diff: 238009, pct: -28 }, { diff: 238009, pct: -30 }])).toEqual({ diff: 238009, pct: -30 });
    expect(biggestDrop([])).toBeNull();
  });
});
