import { describe, expect, it } from "vitest";
import { cardOf, snapshotOf, titleOf, createMarketParser, type MpProduct, type KnownSeller } from "./marketparser";

// The shape of a real result (trial report of 17 Nov 2026, Samsung Galaxy S26, trimmed).
const link = "http://surl.su?url=https%3A%2F%2Fkaspi.kz%2Fshop%2Fp%2Fsamsung-galaxy-s26-12-gb-256-gb-chernyi-159681488%2F%3Fc%3D750000000%3Fc%3D750000000%23%21%2Fitem&date=1794860082&ver=1&key=9090";
const product = (over: Partial<MpProduct> = {}): MpProduct => ({
  name: "159681488", ourId: "159681488", linkToOffers: link, countOffers: 3, searchResult: "ONE_MODEL", isError: false,
  offers: [
    { shopName: "ТЕХНОБРО", price: 396818, currency: "KZT", productName: "Samsung Galaxy S26 12 ГБ/256 ГБ черный" },
    { shopName: "Dora", price: 396817, currency: "KZT", productName: "Смартфон Samsung Galaxy S26 12 ГБ/256 ГБ черный" },
    { shopName: "Galaxy One", price: 396840, currency: "KZT", productName: "Смартфон Samsung Galaxy S26 12 ГБ/256 ГБ черный" },
  ],
  ...over,
});
const known = new Map<string, KnownSeller>([["Dora", { externalId: "30212345", name: "Dora", rating: 4.9, reviews: 1200 }]]);

describe("cardOf", () => {
  it("reads the Kaspi card from MarketParser's wrapped link", () => {
    expect(cardOf(link)).toEqual({ externalId: "159681488", slug: "samsung-galaxy-s26-12-gb-256-gb-chernyi" });
  });
  it("reads a plain link and refuses anything else", () => {
    expect(cardOf("https://kaspi.kz/shop/p/x-123456/")?.externalId).toBe("123456");
    expect(cardOf("https://kaspi.kz/shop/search/?text=x")).toBeNull();
    expect(cardOf(null)).toBeNull();
  });
});

describe("titleOf", () => {
  it("takes the name most offers carry", () => {
    expect(titleOf(product())).toBe("Смартфон Samsung Galaxy S26 12 ГБ/256 ГБ черный");
  });
  it("falls back to the name we sent", () => {
    expect(titleOf(product({ offers: [{ shopName: "A", price: 1 }] }))).toBe("159681488");
  });
});

describe("snapshotOf", () => {
  it("builds the snapshot: cheapest first, known sellers keep their Kaspi id and rating", () => {
    const r = snapshotOf(product(), "159681488", known);
    if (!("snap" in r)) throw new Error(r.skip);
    expect(r.slug).toBe("samsung-galaxy-s26-12-gb-256-gb-chernyi");
    expect(r.snap.minPrice).toBe(396817);
    expect(r.snap.offerCount).toBe(3);
    expect(r.snap.offers[0]).toMatchObject({ sellerId: "30212345", sellerName: "Dora", sellerRating: 4.9 });
    expect(r.snap.offers[1]).toMatchObject({ sellerId: "name:ТЕХНОБРО", sellerRating: null });
    expect(r.snap.imageUrl).toBeNull(); // the collector reads the page in its window
  });
  it("uses only the card we asked for (rule 2: never someone else's price)", () => {
    expect(snapshotOf(product(), "111111111", known)).toEqual({ skip: "another card: 159681488" });
    expect(snapshotOf(product({ searchResult: "MANY_MODELS" }), "159681488", known)).toHaveProperty("skip");
    expect(snapshotOf(product({ isError: true }), "159681488", known)).toHaveProperty("skip");
  });
  it("skips a result without a usable price", () => {
    expect(snapshotOf(product({ offers: [] }), "159681488", known)).toEqual({ skip: "no offers" });
    expect(snapshotOf(product({ offers: [{ shopName: "A", price: 100, currency: "RUB" }] }), "159681488", known)).toEqual({ skip: "no offers" });
  });
  it("keeps one offer per seller, the cheaper", () => {
    const r = snapshotOf(product({ offers: [{ shopName: "Dora", price: 500 }, { shopName: "Dora", price: 400 }] }), "159681488", known);
    if (!("snap" in r)) throw new Error(r.skip);
    expect(r.snap.offers).toHaveLength(1);
    expect(r.snap.minPrice).toBe(400);
  });
});

describe("createMarketParser", () => {
  it("sends the key, our numbers as ids, and starts a report", async () => {
    let sent: { url: string; init: RequestInit } | null = null;
    const fake = (async (url: string, init: RequestInit) => {
      sent = { url, init };
      return new Response(JSON.stringify({ response: { success: true, reportId: 77 } }), { status: 200 });
    }) as unknown as typeof fetch;
    const mp = createMarketParser("k", "62405", fake);
    expect(await mp.checkProducts([{ externalId: "159681488", name: "S26" }])).toBe(77);
    expect(sent!.url).toBe("https://cp2.marketparser.ru/api/v2/campaigns/62405/price.json");
    expect((sent!.init.headers as Record<string, string>)["Api-Key"]).toBe("k");
    expect(JSON.parse(String(sent!.init.body))).toEqual({ products: [{ name: "S26", id: "159681488" }], create_report: true });
  });
  it("turns an API error into MarketParserError", async () => {
    const fake = (async () => new Response(JSON.stringify({ code: 429, message: "limit" }), { status: 429 })) as unknown as typeof fetch;
    await expect(createMarketParser("k", "1", fake).remainingUnits()).rejects.toThrow(/429 limit/);
  });
});
