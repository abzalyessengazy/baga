import { describe, expect, it } from "vitest";
import { bfOrder, salePhase, storeSaleCheck, type StoreDay } from "./blackFriday";

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

describe("bfOrder", () => {
  const pending = { kind: "pending", pct: null };
  const row = (id: string, kaspiNow: number, stores: { store: string; now: number | null; check: { kind: string; pct: number | null } }[]) => ({ id, kaspiNow, stores });
  it("puts real drops first (biggest first), then Halyk or Technodom below Kaspi (biggest saving), then the given order", () => {
    const rows = [
      row("popular", 100_000, [{ store: "technodom", now: 120_000, check: pending }]),
      row("halyk-cheaper", 100_000, [{ store: "halyk", now: 90_000, check: pending }]),
      row("sulpak-cheaper", 100_000, [{ store: "sulpak", now: 50_000, check: pending }]),
      row("drop-10", 100_000, [{ store: "technodom", now: 95_000, check: { kind: "real", pct: -10 } }]),
      row("td-cheaper-more", 200_000, [{ store: "technodom", now: 150_000, check: pending }]),
      row("drop-25", 100_000, [{ store: "halyk", now: 80_000, check: { kind: "real", pct: -25 } }]),
      row("pricier", 100_000, [{ store: "halyk", now: 130_000, check: { kind: "pricier", pct: 8 } }]),
    ];
    expect(bfOrder(rows).map((r) => r.id)).toEqual(["drop-25", "drop-10", "td-cheaper-more", "halyk-cheaper", "popular", "sulpak-cheaper", "pricier"]);
  });
});
