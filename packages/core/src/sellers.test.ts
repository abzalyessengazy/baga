import { describe, expect, it } from "vitest";
import { sellerLabel, adjustedRating, byRating, cheapOutlierPct, cheapOutliers, reviewGrowth, isEstablished, priceNote, priceNotes, SELLER_RULES } from "./sellers";

describe("sellerLabel", () => {
  it("treats a missing or zero rating as no rating, never a low one", () => {
    expect(sellerLabel(null, null)).toBe("none");
    expect(sellerLabel(0, 0)).toBe("none"); // Kaspi's value for a shop nobody rated
    expect(sellerLabel(4.9, 0)).toBe("none");
    expect(sellerLabel(0, 15)).toBe("none");
  });
  it("needs enough reviews before calling a rating high or low", () => {
    expect(sellerLabel(5, 1)).toBe("few");
    expect(sellerLabel(2.1, SELLER_RULES.enoughReviews - 1)).toBe("few");
    expect(sellerLabel(2.1, SELLER_RULES.enoughReviews)).toBe("low");
  });
  it("puts the boundaries where the rules say", () => {
    expect(sellerLabel(4.8, 100)).toBe("high");
    expect(sellerLabel(4.79, 100)).toBe("mixed");
    expect(sellerLabel(4.0, 100)).toBe("mixed");
    expect(sellerLabel(3.99, 100)).toBe("low");
  });
});

describe("adjustedRating / byRating", () => {
  it("does not let one perfect review outrank hundreds of good ones", () => {
    expect(adjustedRating(5, 1)!).toBeLessThan(adjustedRating(4.8, 900)!);
    expect(adjustedRating(null, 10)).toBeNull();
  });
  it("orders by adjusted rating, then price, unrated shops last", () => {
    const o = [
      { id: "cheap-unrated", price: 100, sellerRating: 0, sellerReviews: 0 },
      { id: "one-review", price: 110, sellerRating: 5, sellerReviews: 1 },
      { id: "solid", price: 130, sellerRating: 4.9, sellerReviews: 2000 },
      { id: "solid-dearer", price: 140, sellerRating: 4.9, sellerReviews: 2000 },
    ];
    expect(byRating(o).map((x) => x.id)).toEqual(["solid", "solid-dearer", "one-review", "cheap-unrated"]);
    expect(o[0]!.id).toBe("cheap-unrated"); // the input is not reordered
  });
});

describe("cheapOutlierPct", () => {
  it("points out an offer far below the other sellers", () => {
    expect(cheapOutlierPct(60_000, [100_000, 101_000, 99_000])).toBe(40);
    expect(cheapOutlierPct(71_000, [100_000, 100_000, 100_000])).toBeNull(); // 29%: not enough
    expect(cheapOutlierPct(70_000, [100_000, 100_000, 100_000])).toBe(30);
  });
  it("needs at least three other sellers (two may both be dear)", () => {
    expect(cheapOutlierPct(10_000, [100_000, 100_000])).toBeNull(); // the Sulpak page of 5 Nov: 2 others
  });
  it("checks every offer against the others", () => {
    expect(cheapOutliers([50_000, 100_000, 102_000, 98_000, 100_000])).toEqual([50, null, null, null, null]);
  });
});

describe("priceNote", () => {
  const others = [289_999, 300_000, 323_528];
  it("gives an established shop the plain fact, any other shop the advice to check", () => {
    expect(isEstablished(4.9, 57_981)).toBe(true);
    expect(isEstablished(4.9, 999)).toBe(false);
    expect(isEstablished(4.5, 5_000)).toBe(false); // many reviews, not a high rating
    expect(priceNote(144_990, others, 4.9, 57_981)).toEqual({ pct: 51, kind: "fact" });
    expect(priceNote(144_990, others, 4.8, 520)).toEqual({ pct: 51, kind: "check" });
    expect(priceNote(144_990, others, 0, 0)).toEqual({ pct: 51, kind: "check" });
    expect(priceNote(280_000, others, 4.8, 520)).toBeNull();
  });
  it("checks every offer against the others", () => {
    const o = [144_990, ...others].map((price) => ({ price, sellerRating: 4.8, sellerReviews: 100 }));
    expect(priceNotes(o).map((n) => n?.kind ?? null)).toEqual(["check", null, null, null]);
  });
});

describe("reviewGrowth", () => {
  it("counts new reviews over at least a week of daily records", () => {
    expect(reviewGrowth([{ day: "2026-11-01", reviews: 100 }, { day: "2026-11-09", reviews: 160 }])).toEqual({ added: 60, days: 8, since: "2026-11-01" });
  });
  it("says nothing over a shorter span or without numbers", () => {
    expect(reviewGrowth([{ day: "2026-11-01", reviews: 100 }, { day: "2026-11-05", reviews: 130 }])).toBeNull();
    expect(reviewGrowth([{ day: "2026-11-01", reviews: null }, { day: "2026-11-20", reviews: 130 }])).toBeNull();
  });
});
