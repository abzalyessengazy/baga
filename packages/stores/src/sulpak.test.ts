import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSulpakClient, parseCategorySitemap, parseListing, parseSulpakProduct, SulpakHttpError, SulpakParseError, sulpakCategoriesFor, sulpakTranslit } from "./sulpak";

const fixture = (f: string) => readFileSync(join(__dirname, "../fixtures", f), "utf8");

describe("Sulpak pages (captured 14 Nov 2026)", () => {
  it("reads a listing: 22 cards with code, address, name, price, old price and «под заказ»", () => {
    const { items, pages } = parseListing(fixture("sulpak-listing-smartfoniy.html"));
    expect(pages).toBe(42);
    expect(items).toHaveLength(22);
    expect(items[0]).toEqual({ sku: "656294", slug: "smartfoniy-apple-iphone-duo-256gb-star-white-mk2d4hxa",
      title: "Смартфон Apple iPhone Duo 12/256GB Star White", price: 1_399_990, oldPrice: null, onOrder: true });
    expect(items.find((i) => i.sku === "656252")).toMatchObject({ price: 849_990, onOrder: false });
    expect(items.find((i) => i.sku === "641886")).toMatchObject({ price: 805_990, oldPrice: 830_990 });
  });
  it("reads a product page: code, name, price and stock in Almaty", () => {
    expect(parseSulpakProduct(fixture("sulpak-product-656252.html"))).toEqual({
      sku: "656252", title: "Смартфон Apple iPhone 18 Pro 12/256GB Black", price: 849_990, oldPrice: null, inStock: true });
  });
  it("refuses a page without its block, or for another city", () => {
    expect(() => parseSulpakProduct("<html>Just a moment…</html>")).toThrow(SulpakParseError);
    expect(() => parseSulpakProduct('<div id="product-page" data-code="1" data-name="X" data-price="5.0" data-city-id="7">')).toThrow(SulpakParseError);
  });
  it("lists category listings from the sitemap, without filter pages", () => {
    expect(parseCategorySitemap(`<loc>https://www.sulpak.kz/f/smartfoniy</loc><loc>https://www.sulpak.kz/f/smartfoniy/almaty/66173_7</loc><loc>https://www.sulpak.kz/p/sotoviye_telefoniy</loc>`)).toEqual(["smartfoniy"]);
  });
});

describe("Sulpak categories for our Kaspi categories", () => {
  const cats = ["smartfoniy", "monitoriy", "led_oled_televizoriy", "stiralniye_mashiniy", "elektrochajniki", "aksessuariy_dlya_telefonov", "chehliy_k_telefonam"];
  it("writes names the way Sulpak does", () => {
    expect(sulpakTranslit("Стиральные машины")).toBe("stiralniye_mashiniy");
    expect(sulpakTranslit("Смарт-часы")).toBe("smart_chasiy");
  });
  it("finds the same name first, else by the first word's stem", () => {
    expect(sulpakCategoriesFor("Смартфоны", cats)).toEqual(["smartfoniy"]);
    expect(sulpakCategoriesFor("Телевизоры", cats)).toEqual(["led_oled_televizoriy"]);
    expect(sulpakCategoriesFor("Электрочайники и термопоты", cats)).toEqual(["elektrochajniki"]);
    expect(sulpakCategoriesFor("Велосипеды", cats)).toEqual([]);
  });
});

describe("Sulpak client", () => {
  it("sends the honest User-Agent, spaces requests and stops on 403", async () => {
    const seen: { ua: string | null; at: number }[] = [];
    let status = 200;
    const f = (async (_url: string, init: RequestInit) => {
      seen.push({ ua: new Headers(init.headers).get("User-Agent"), at: Date.now() });
      return new Response("<loc>https://www.sulpak.kz/f/smartfoniy</loc>", { status });
    }) as typeof fetch;
    const c = createSulpakClient({ fetch: f, minIntervalMs: 60, userAgent: "BAGA test" });
    await c.fetchCategories();
    await c.fetchCategories();
    expect(seen[0]!.ua).toBe("BAGA test");
    expect(seen[1]!.at - seen[0]!.at).toBeGreaterThanOrEqual(55);
    status = 403;
    const e = await c.fetchCategories().catch((x) => x);
    expect(e).toBeInstanceOf(SulpakHttpError);
    expect((e as SulpakHttpError).isBlocked).toBe(true);
  });
});
