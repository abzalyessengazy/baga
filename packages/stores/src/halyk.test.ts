import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { brandOf, halykMismatch, modelCodes, partNumber, sameCode, createHalykClient, listItems, nuxtData, pagePath, parseHalykProduct, phoneKey, pickColour, pickMemory, sameModel, variantPickers } from "./halyk";

// The payload of a real product page (iPhone 17 Pro Max 256Gb Silver, 17 Nov 2026), the rest of the page cut.
const page = readFileSync(join(__dirname, "../fixtures", "halyk-product.html"), "utf8");

describe("Halyk product page", () => {
  const data = nuxtData(page);
  it("reads the variant's price and number of sellers", () => {
    expect(parseHalykProduct(data)).toMatchObject({ title: "Смартфон Apple iPhone 17 Pro Max 256Gb Silver", price: 731187, offers: 27, inStock: true });
  });
  it("reads the variant pickers with their links", () => {
    const p = variantPickers(data);
    expect(p["Объем памяти"]!.map((o) => o.name)).toEqual(["256Gb", "512Gb", "1Tb", "2Tb"]);
    expect(pickColour(p["Цвет"]!, "темно-синий")?.url).toBe("/p/smartfony/smartfon-apple-iphone-17-pro-max-0e6f/256gb_deepblue");
    expect(pickMemory(p["Объем памяти"]!, "1tb")?.name).toBe("1Tb");
    expect(pickColour(p["Цвет"]!, "розовый")).toBeNull();
  });
  it("lists its similar products as page addresses", () => {
    expect(listItems(data).length).toBeGreaterThan(5);
    expect(listItems(data)[0]!.url.startsWith("/category/")).toBe(true);
  });
  it("turns variant links into the address Halyk serves", () => {
    expect(pagePath("/p/smartfony/smartfon-apple-iphone-17-pro-max-0e6f/256gb_deepblue")).toBe("/category/smartfony/smartfon-apple-iphone-17-pro-max-0e6f?sku=256gb_deepblue");
    expect(pagePath("/category/smartfony/smartfon-apple-iphone-air-3b57/256gb_cloudwhite?sku=256gb_cloudwhite")).toBe("/category/smartfony/smartfon-apple-iphone-air-3b57?sku=256gb_cloudwhite");
    expect(pagePath("/category/smartfony/smartfon-apple-iphone-17-pro-max-0e6f?sku=256gb_silver")).toBe("/category/smartfony/smartfon-apple-iphone-17-pro-max-0e6f?sku=256gb_silver");
    expect(pagePath("/category/smartfony?sort=popular-desc&f=brands:Apple")).toBe("/category/smartfony?sort=popular-desc&f=brands:Apple");
  });
});

describe("phoneKey and sameModel", () => {
  it("reads model, memory, colour and SIM kind from a Kaspi title", () => {
    expect(phoneKey("Смартфон Apple iPhone 17 Pro Max 256Gb NanoSIM+eSIM темно-синий")).toEqual({ model: "apple iphone 17 pro max", memory: "256gb", colour: "темно-синий", esimOnly: false, dualSim: false });
    expect(phoneKey("Смартфон Apple iPhone 17 Pro Max 1024Gb Dual eSim серебристый")).toMatchObject({ memory: "1tb", esimOnly: true });
    expect(phoneKey("Смартфон Samsung Galaxy S26 12 ГБ/256 ГБ черный")).toMatchObject({ model: "samsung galaxy s26", memory: "256gb" });
    expect(phoneKey("Смартфон Apple iPhone 15 128 Gb Dual Sim черный")).toMatchObject({ dualSim: true });
  });
  it("matches only the same model and SIM kind, never a bundle", () => {
    const k = phoneKey("Смартфон Apple iPhone 17 Pro 256Gb NanoSIM+eSIM серебристый");
    expect(sameModel(k, "Смартфон Apple iPhone 17 Pro 256Gb Silver")).toBe(true);
    expect(sameModel(k, "Смартфон Apple iPhone 17 Pro Max 256Gb Silver")).toBe(false);
    expect(sameModel(k, "Смартфон Apple iPhone 17 Pro eSim 256Gb Silver")).toBe(false);
    expect(sameModel(phoneKey("Смартфон Apple iPhone 17 Pro 256Gb Dual eSim серебристый"), "Смартфон Apple iPhone 17 Pro eSim 256Gb Silver")).toBe(true);
    expect(sameModel(k, "Смартфон Apple iPhone 17 Pro 512Gb Glacier + Наушники Apple Earpods USB-C Белый")).toBe(false);
    expect(sameModel(phoneKey("Смартфон Samsung Galaxy A07S 4 ГБ/64 ГБ фиолетовый"), "Смартфон Samsung Galaxy A07S 4/64Gb Light Violet")).toBe(true);
  });
});

describe("Halyk client", () => {
  it("never asks for a path robots.txt closes", async () => {
    const c = createHalykClient({ minIntervalMs: 0, fetch: (async () => new Response("")) as unknown as typeof fetch });
    await expect(c.page("https://halykmarket.kz/api/offers")).rejects.toThrow(/not allowed/);
    await expect(c.page("https://example.com/x")).rejects.toThrow(/not allowed/);
  });
  it("sends the honest User-Agent and reports a block", async () => {
    let ua = "";
    const c = createHalykClient({ minIntervalMs: 0, userAgent: "BAGA test", fetch: (async (_u: string, init: RequestInit) => {
      ua = (init.headers as Record<string, string>)["User-Agent"]!;
      return new Response("", { status: 403 });
    }) as unknown as typeof fetch });
    const e = await c.page("https://halykmarket.kz/category/smartfony").catch((x) => x);
    expect(ua).toBe("BAGA test");
    expect(e.isBlocked).toBe(true);
  });
});

describe("model codes", () => {
  it("finds the manufacturer's codes, the part number last, and the brand", () => {
    const laptop = "Ноутбук Lenovo LOQ 15ARP10E 15.6\" / AMD Ryzen 5 150 / 16 Гб / SSD 512 Гб / GeForce RTX 3050 / Win 11 Home / 83S000HPRK серый";
    expect(modelCodes(laptop)).toEqual(["15ARP10E", "83S000HPRK"]);
    expect(partNumber(laptop)).toBe("83S000HPRK");
    expect(brandOf(laptop)).toBe("Lenovo");
    expect(partNumber("Монитор 27\" XTREON XT2769VD черный")).toBe("XT2769VD");
    expect(partNumber("Наушники Sony WF-1000XM6 черный")).toBe("WF1000XM6");
    expect(partNumber("Наушники Apple AirPods 5 with Wireless Charging Case белый")).toBeNull();
  });
  it("matches the part number as a whole word, with a region suffix only after a digit", () => {
    expect(sameCode("83S000HPRK", "Ноутбук Lenovo LOQ 15ARP10E 83S000HPRK 15.6\" 16Gb")).toBe(true);
    expect(sameCode("XT2769VD", "27 XTREON XT2769VD черный")).toBe(true);
    expect(sameCode("XT2769VD", "XTREON XT2769VDX")).toBe(false);
    expect(sameCode("MDH74", "Ноутбук Apple MacBook Air 13 M5 MDH74RU/A")).toBe(true);
    expect(sameCode("15ARP10E", "Lenovo LOQ 15ARP10E 83S000BNRK")).toBe(true); // why only the part number decides
  });
});

describe("halykMismatch (23 Nov 2026 audit)", () => {
  it("rejects another brand, line, RAM; a colour only makes it «похожий»", () => {
    expect(halykMismatch("Ноутбук Lenovo IdeaPad 1i 83B40008US 15.6\" / Intel Core i5-1335U / 16 Гб / SSD 256 Гб серебристый",
      "Ноутбук Asus Vivobook 15 X1504VA-BQ1351W Core i5-1335U")).toBe("brand differs");
    expect(halykMismatch("Наушники Samsung Galaxy Buds3 Pro серебристый", "Наушники Samsung Galaxy Buds3 FE Черный")).toBe("variant pro");
    expect(halykMismatch("Смартфон Samsung Galaxy A17 8 ГБ/256 ГБ черный", "Смартфон Samsung Galaxy A17 6/256Gb Black")).toBe("ram differs");
    expect(halykMismatch("Наушники Sony WH-1000XM6 серый", "Наушники Sony WH-1000XM6 Черный")).toBe("colour differs");
  });
  it("keeps correct pairs", () => {
    expect(halykMismatch("Смартфон Apple iPhone 17 Pro Max 256Gb NanoSIM+eSIM темно-синий", "Смартфон Apple iPhone 17 Pro Max 256Gb Deep Blue")).toBeNull();
    expect(halykMismatch("Монитор 27\" XTREON XT2760S MiniLED белый", "XT2760S 27 QHD/Mini LED/0,5ms/240-400Hz")).toBeNull();
    expect(halykMismatch("Chuwi MiniBook X N150 10.51\" / Intel Processor N150 / 16 Гб / M.2 512 Гб / UHD Graphics / CWI558-N150 серый",
      "Ноутбук Chuwi MiniBook X N150 CWI558-N150 10.5\" 512Gb Grey")).toBeNull();
  });
  it("never takes a processor or a one-digit line name for a part number", () => {
    expect(modelCodes("Ноутбук Asus Vivobook 15 Core i5-1335U")).not.toContain("I51335U");
    expect(modelCodes("Наушники Samsung Galaxy Buds3 Pro")).not.toContain("BUDS3");
  });
});
