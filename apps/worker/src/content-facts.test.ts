import { describe, expect, it } from "vitest";
import type { Market, MarketPick } from "@baga/db";
import { buildFacts, postLink, themesFor } from "./content-facts";

const pick = (id: string, pct: number, note?: MarketPick["note"]): MarketPick => ({
  kind: "drop", externalId: id, title: `Product ${id} long name`, titleKk: null, imageUrl: null, price: 27990, ref: 50000, pct, sellers: 4, note,
});
const market = (picks: MarketPick[], spreadSellers = 5) => ({
  day: "2026-11-12", picks,
  spread: { products: 10, over10: 5, over25: 2, medianPct: 12, top: [{ externalId: "s1", title: "Spread item", titleKk: "Спред", imageUrl: null, lo: 10000, hi: 15000, sellers: spreadSellers }] },
}) as unknown as Market;
const site = "https://bagaapp.com";

describe("content facts", () => {
  it("rotates themes by weekday", () => {
    expect(themesFor(1)[0]).toBe("week");
    expect(themesFor(3)[0]).toBe("pick");
    expect(themesFor(5)[0]).toBe("spread");
  });
  it("tags links for Instagram with the day's campaign", () => {
    expect(postLink(site, "kk", "123", "d20261112")).toBe("https://bagaapp.com/kk/p/123?utm_source=instagram&utm_medium=post&utm_campaign=d20261112");
  });
  it("Monday: up to three week drops, skipping a seller to check", () => {
    const f = buildFacts(market([pick("a", -45), pick("b", -30, { pct: 60, kind: "check" }), pick("c", -20), pick("d", -15), pick("e", -12)]), 1, site, "d1");
    expect(f?.theme).toBe("week");
    expect(f?.products.map((p) => p.linkRu.split("?")[0])).toEqual([`${site}/ru/p/a`, `${site}/ru/p/c`, `${site}/ru/p/d`]);
    expect(f?.products[0]).toMatchObject({ price: 27990, ref: 50000, pct: 45, sellers: 4, card: `${site}/ru/p/a/opengraph-image/card` });
  });
  it("Friday: the widest seller spread, with the gap; falls back when too few sellers", () => {
    const f = buildFacts(market([pick("a", -45)]), 5, site, "d1");
    expect(f?.theme).toBe("spread");
    expect(f?.products[0]).toMatchObject({ price: 10000, ref: 15000, pct: 33, sellers: 5 });
    expect(buildFacts(market([pick("a", -45)], 2), 5, site, "d1")?.theme).toBe("pick");
  });
  it("nothing to post without picks or spread", () => {
    expect(buildFacts(market([], 2), 3, site, "d1")).toBeNull();
  });
  it("Friday skips a spread whose cheapest offer is more than half below the dearest", () => {
    const m = market([pick("a", -45)]);
    m.spread.top = [{ ...m.spread.top[0]!, externalId: "far", lo: 11589, hi: 38180 }, { ...m.spread.top[0]!, externalId: "ok" }];
    expect(buildFacts(m, 5, site, "d1")?.products[0]?.linkRu).toBe(`${site}/ru/p/ok?utm_source=instagram&utm_medium=post&utm_campaign=d1`);
  });
});
