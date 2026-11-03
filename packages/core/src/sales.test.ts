import { describe, expect, it } from "vitest";
import { saleCheck, latestSaleCheck, upcomingSale, runningSale, type SaleEvent } from "./sales";

const sale: SaleEvent = { id: "s", start: "2026-11-11", end: "2026-11-11" };
const h = (rows: [string, number][]) => rows.map(([day, price]) => ({ day, price }));

describe("saleCheck", () => {
  it("is empty before the sale and when nothing was observed during it", () => {
    expect(saleCheck(h([["2026-11-05", 100]]), sale, "2026-11-10")).toBeNull();
    expect(saleCheck(h([["2026-11-05", 100], ["2026-11-12", 90]]), sale, "2026-11-12")).toBeNull();
  });
  it("confirms a real discount against the lowest price of the two weeks before", () => {
    const c = saleCheck(h([["2026-11-05", 100_000], ["2026-11-07", 98_000], ["2026-11-09", 99_000], ["2026-11-11", 88_000]]), sale, "2026-11-11")!;
    expect(c).toMatchObject({ kind: "cheaper", duringLow: 88_000, before: { low: 98_000, days: 3 }, beforePct: -10, ongoing: true, after: null });
  });
  it("calls a raise-then-discount the same price or pricier", () => {
    const base = h([["2026-11-05", 100_000], ["2026-11-06", 100_000], ["2026-11-08", 120_000]]);
    expect(saleCheck([...base, ...h([["2026-11-11", 99_000]])], sale, "2026-11-11")!.kind).toBe("same");
    expect(saleCheck([...base, ...h([["2026-11-11", 110_000]])], sale, "2026-11-11")!.kind).toBe("pricier");
  });
  it("needs two observed days before the sale for a comparison", () => {
    const c = saleCheck(h([["2026-11-10", 100_000], ["2026-11-11", 80_000]]), sale, "2026-11-11")!;
    expect(c.kind).toBe("noBaseline");
    expect(c.before).toBeNull();
    expect(saleCheck(h([["2026-11-09", 100_000], ["2026-11-10", 100_000], ["2026-11-11", 80_000]]), sale, "2026-11-11")!)
      .toMatchObject({ kind: "cheaper", before: { low: 100_000, days: 2 } });
  });
  it("reports the latest price after the sale against the sale price", () => {
    const c = saleCheck(h([["2026-11-11", 80_000], ["2026-11-12", 84_000], ["2026-11-14", 92_000]]), sale, "2026-11-14")!;
    expect(c.after).toEqual({ price: 92_000, day: "2026-11-14", pct: 15 });
    expect(c.ongoing).toBe(false);
  });
  it("treats an open-ended sale as running until today, and stops showing 30 days after the end", () => {
    const open: SaleEvent = { id: "o", start: "2026-11-03", end: null };
    const c = saleCheck(h([["2026-11-03", 50_000], ["2026-11-05", 48_000]]), open, "2026-11-05")!;
    expect(c).toMatchObject({ duringLow: 48_000, duringDays: 2, ongoing: true, after: null });
    expect(saleCheck(h([["2026-11-11", 1]]), sale, "2026-12-12")).toBeNull();
  });
  it("latestSaleCheck picks the most recent sale with data", () => {
    const sales: SaleEvent[] = [{ id: "a", start: "2026-11-03", end: "2026-11-05" }, sale];
    expect(latestSaleCheck(h([["2026-11-04", 10]]), "2026-11-12", sales)!.saleId).toBe("a");
    expect(latestSaleCheck(h([["2026-11-04", 10], ["2026-11-11", 9]]), "2026-11-12", sales)!.saleId).toBe("s");
  });
  it("upcomingSale announces the next sale up to two weeks ahead, runningSale takes over on its first day", () => {
    const sales: SaleEvent[] = [{ id: "a", start: "2026-11-05", end: "2026-11-07" }, sale];
    expect(upcomingSale("2026-11-03", 14, sales)!.id).toBe("a");
    expect(upcomingSale("2026-11-05", 14, sales)!.id).toBe("s");
    expect(runningSale("2026-11-05", sales)!.id).toBe("a");
    expect(upcomingSale("2026-10-01", 14, sales)).toBeNull();
  });
});
