import { describe, expect, it } from "vitest";
import { seedCategory, pickSeedProducts, modelKey } from "./seedCatalog";

describe("seedCategory", () => {
  it("needs a category word and a known brand", () => {
    expect(seedCategory("apple-iphone-18-pro-256gb-nanosim-esim-serebristyi")).toBe("phones");
    expect(seedCategory("noutbuk-asus-zenbook-14-ux3405ma-temno-sinii")).toBe("laptops");
    expect(seedCategory("asus-zenbook-14-14-intel-core-ultra-5-125h-16-gb-ssd-512-gb-arc-graphics-bez-os-ux3405ma-90nb11r1-m010y0-temno-sinii")).toBe("laptops");
    expect(seedCategory("kofemashina-delonghi-essenza-mini-en85-b-chernyi")).toBe("kitchen");
    expect(seedCategory("elektrochainik-midea-mk-8072-belyi")).toBe("kitchen");
    expect(seedCategory("stiral-naja-mashina-lg-f2v5hs0w-belyi")).toBe("washers");
    expect(seedCategory("televizor-samsung-ue55du7100uxce-55-chernyi")).toBe("tvs");
    expect(seedCategory("polaris-phd-2289ac-fen-chernyi")).toBe("beauty");
    expect(seedCategory("ochistitel-vozduha-levoit-lap-c401s-waaa-smart-belyi")).toBe("climate");
    expect(seedCategory("naushniki-soundcore-q20i-chernyi")).toBe("headphones");
  });
  it("drops unknown brands", () => {
    expect(seedCategory("naushniki-gm-sport-naushniki-razmer-universal-nyi-seryi")).toBeNull();
    expect(seedCategory("elektrochainik-bereke-br-serebristyi")).toBeNull();
  });
  it("puts tablets and watches before phones", () => {
    expect(seedCategory("planshet-apple-ipad-air-11-2025-wi-fi-128gb-seryi")).toBe("tablets");
    expect(seedCategory("smart-chasy-apple-watch-series-11-46-mm-chernyi")).toBe("watches");
  });
  it("skips accessories, spare parts and same-name products (captured slugs, 2 Nov 2026)", () => {
    for (const s of [
      "a-case-dlja-samsung-galaxy-a10-prozrachnyi",
      "dlja-apple-iphone-12-bezhevyi",
      "dlja-apple-macbook-air-13",
      "zh-dlja-airpods-pro-3",
      "stolik-dlja-noutbuka-ldsp-58x37x10-sm",
      "-stikery-chukur-3d-nakleiki-na-avto-noutbuk-telefon-podarok-fanatu-",
      "fil-tr-hometechessentials-35402148-dlja-pylesosov-bosch-bgs-bgl-1-sht-",
      "meshok-pylesbornik-dlja-pylesosa-gepard-gp90073-112-2-sht",
      "nabor-aksessuarov-roborock-q-revo-dlja-robotov-pylesosov-roborock-20-sht-",
      "vernel-konditsioner-pion-i-hlopok-910-ml",
      "likato-professional-wellness-konditsioner-250-ml",
      "fen-stroitel-nyi-resanta-fe-2000ek",
      "kreslo-ofisnoe-chernoe",
    ]) expect(seedCategory(s), s).toBeNull();
  });
});

describe("pickSeedProducts", () => {
  it("takes newest first, one colour per model, capped per category", () => {
    const got = pickSeedProducts([
      { productId: "100000001", slug: "apple-iphone-12-128gb-chernyi" },
      { productId: "177318181", slug: "apple-iphone-18-pro-256gb-nanosim-esim-serebristyi" },
      { productId: "177318182", slug: "apple-iphone-18-pro-256gb-nanosim-esim-goluboi" },
      { productId: "177318415", slug: "apple-iphone-18-pro-512gb-nanosim-esim-goluboi" },
      { productId: "177318415", slug: "apple-iphone-18-pro-512gb-nanosim-esim-goluboi" },
      { productId: "200000000", slug: "kreslo-ofisnoe-chernoe" },
    ], 2);
    expect([...got.keys()]).toEqual(["phones"]);
    expect(got.get("phones")!.map((p) => p.productId)).toEqual(["177318415", "177318182"]);
  });
  it("model key drops the trailing colour", () => {
    expect(modelKey("apple-iphone-18-pro-256gb-nanosim-esim-serebristyi")).toBe(modelKey("apple-iphone-18-pro-256gb-nanosim-esim-goluboi"));
  });
});
