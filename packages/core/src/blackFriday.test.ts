import { describe, expect, it } from "vitest";
import { salePhase, storeSaleCheck, type StoreDay } from "./blackFriday";

const d = (day: string, price: number, oldPrice: number | null = null): StoreDay => ({ day, price, oldPrice });
const before = [d("2026-11-16", 300_000), d("2026-11-20", 290_000), d("2026-11-25", 300_000)];

describe("salePhase", () => {
  it("before, during, after, then gone", () => {
    expect(salePhase("2026-11-15")).toBe("before");
    expect(salePhase("2026-11-27")).toBe("during");
    expect(salePhase("2026-11-30")).toBe("during");
    expect(salePhase("2026-12-01")).toBe("after");
    expect(salePhase("2026-12-15")).toBeNull();
  });
});

describe("storeSaleCheck", () => {
  it("waits for the sale", () => {
    const c = storeSaleCheck(before, "2026-11-25");
    expect(c.kind).toBe("pending");
    expect(c.before).toEqual({ low: 290_000, days: 3 });
  });
  it("a real discount is below the two weeks before", () => {
    const c = storeSaleCheck([...before, d("2026-11-27", 250_000, 350_000)], "2026-11-28");
    expect(c).toMatchObject({ kind: "real", pct: -14, claimedPct: -29 });
  });
  it("a crossed-out price over the usual one is not a discount", () => {
    expect(storeSaleCheck([...before, d("2026-11-27", 289_000, 390_000)], "2026-11-27")).toMatchObject({ kind: "same", claimedPct: -26 });
    expect(storeSaleCheck([...before, d("2026-11-28", 320_000, 400_000)], "2026-12-02").kind).toBe("pricier");
  });
  it("no verdict without enough days before", () => {
    expect(storeSaleCheck([d("2026-11-26", 300_000), d("2026-11-27", 200_000)], "2026-11-27").kind).toBe("noBaseline");
  });
});
