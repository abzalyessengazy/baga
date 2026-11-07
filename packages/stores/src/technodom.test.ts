import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTechnodomClient, parseProductSitemap, parseTechnodomProduct, TechnodomHttpError, TechnodomParseError, StoreRequestRefused } from "./technodom";

const fixture = (f: string) => readFileSync(join(__dirname, "../fixtures", f), "utf8");

describe("Technodom pages (captured 7 Nov 2026)", () => {
  it("reads a product page: price, old price, stock and the Kaspi link", () => {
    expect(parseTechnodomProduct(fixture("technodom-product-298516.html"))).toEqual({
      sku: "298516", title: "Наушники беспроводные SoundCore Liberty 5 A3957 White",
      price: 27990, oldPrice: 49990, inStock: true, kaspiId: "142633055",
    });
  });
  it("refuses a page without its data", () => {
    expect(() => parseTechnodomProduct("<html><body>Just a moment…</body></html>")).toThrow(TechnodomParseError);
  });
  it("reads product addresses and ids from the sitemap", () => {
    const items = parseProductSitemap(fixture("technodom-products-sitemap.xml"));
    expect(items).toHaveLength(4);
    expect(items.at(-1)).toEqual({ slug: "naushniki-besprovodnye-soundcore-liberty-5-a3957-white-298516", sku: "298516" });
  });
});

describe("Technodom client", () => {
  it("sends the honest User-Agent and spaces requests", async () => {
    const seen: { url: string; ua: string | null; at: number }[] = [];
    const f = (async (url: string, init: RequestInit) => {
      seen.push({ url, ua: new Headers(init.headers).get("User-Agent"), at: Date.now() });
      return new Response(fixture("technodom-products-sitemap.xml"), { status: 200 });
    }) as unknown as typeof fetch;
    const c = createTechnodomClient({ fetch: f, minIntervalMs: 60, userAgent: "BAGA test" });
    await c.fetchProductSitemap();
    await c.fetchProductSitemap();
    expect(seen.map((s) => s.ua)).toEqual(["BAGA test", "BAGA test"]);
    expect(seen[1]!.at - seen[0]!.at).toBeGreaterThanOrEqual(55);
  });
  it("throws on a refusal and lets the guard stop a request", async () => {
    const f = (async () => new Response("", { status: 429 })) as unknown as typeof fetch;
    const blocked = createTechnodomClient({ fetch: f, minIntervalMs: 0 });
    await expect(blocked.fetchProduct("x-1")).rejects.toSatisfy((e: unknown) => e instanceof TechnodomHttpError && e.isBlocked);
    let calls = 0;
    const guarded = createTechnodomClient({ fetch: (async () => { calls++; return new Response(""); }) as unknown as typeof fetch, minIntervalMs: 0,
      beforeRequest: () => { throw new StoreRequestRefused("breaker open"); } });
    await expect(guarded.fetchProduct("x-1")).rejects.toThrow(StoreRequestRefused);
    expect(calls).toBe(0);
  });
});
