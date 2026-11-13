import { describe, expect, it } from "vitest";
import { biggestDrop, onePerCategory, sellerSpread } from "./digest";

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
  it("flags a price that rests on one seller", () => {
    // 13 Nov: TechPlaza 712 489 ₸, the next shop 827 790 ₸ (14% higher).
    expect(sellerSpread([827790, 712489, 846990], 10)).toEqual({ nextPrice: 827790, oneSeller: true });
    expect(sellerSpread([19990, 20490], 10)).toEqual({ nextPrice: 20490, oneSeller: false });
    expect(sellerSpread([799000], 10)).toEqual({ nextPrice: null, oneSeller: true });
    expect(sellerSpread([], 10)).toEqual({ nextPrice: null, oneSeller: false });
  });
});
