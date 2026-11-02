import { describe, expect, it } from "vitest";
import { seedCategory, pickSeedProducts, modelKey, familyKey, FAMILY_CAP } from "./seedCatalog";

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
      "haier-konditsioner-haier-fs-1-05-kitaiskaja-roza-1000-ml",
      "acd-samsung-watch-galaxy-watch3-watch4-watch6-chernyi",
      "poppy-playtime-triple-pack-nintendo-switch-rus",
      "uncharted-collection-playstation-4-ps4",
      "nintendo-switch-joy-con-sinii-zheltyi",
      "zarjadnaja-stantsija-dobe-playstation-5-dualsense-charging-dock-belyi",
      "lugx-pylesos-vytjazhka-lg-622-48-vt",
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
  it("model key drops the trailing colour and gift tag", () => {
    expect(modelKey("apple-iphone-18-pro-256gb-nanosim-esim-serebristyi")).toBe(modelKey("apple-iphone-18-pro-256gb-nanosim-esim-goluboi"));
    expect(modelKey("apple-iphone-16-128gb-chernyi-podarok")).toBe(modelKey("apple-iphone-16-128gb-belyi-podarok"));
  });
  it("keeps consoles, sized monitors and brand-first names", () => {
    expect(seedCategory("sony-playstation-5-slim-digital-edition-geimpad-charging-station-pulse-3d")).toBe("consoles");
    expect(seedCategory("27-xiaomi-gaming-monitor-g27qi-p27qca-rggl-chernyi")).toBe("monitors");
    expect(seedCategory("dyson-hd19-supersonic-travel-kompaktnyi-fen-rozovyi")).toBe("beauty");
  });
  it("recognises categories Kaspi names without a category word (captured slugs, 2 Nov 2026)", () => {
    expect(seedCategory("artel-55au20h-140-sm-chernyi")).toBe("tvs");
    expect(seedCategory("lg-43lm5772pla-109-sm-chernyi")).toBe("tvs");
    expect(seedCategory("27-lg-27gp750-b-chernyi")).toBe("monitors");
    expect(seedCategory("24-5-asus-tuf-gaming-vg259qm-chernyi")).toBe("monitors");
    expect(seedCategory("atlant-hm-4623-101-belyi")).toBe("fridges");
    expect(seedCategory("samsung-rb33a32n0el-wt-bezhevyi")).toBe("fridges");
    expect(seedCategory("bosch-smv4hvx31e-belyi")).toBe("dishwashers");
    expect(seedCategory("roborock-q7-plus-belyi-chernyi")).toBe("vacuums");
    expect(seedCategory("dyson-v12-detect-slim-absolute-fioletovyi-serebristyi")).toBe("vacuums");
    expect(seedCategory("dreame-grand-fen-belyi")).toBe("beauty");
    for (const s of ["atlant-vaz-2112-1-1-econom", "samsung-bn59-01385a", "dreamee-trimmer-universal-noe", "kronshtein-dlja-televizora-c3-nastennyi-naklonnyi-40-75"]) {
      expect(seedCategory(s), s).toBeNull();
    }
  });
  it("caps one product line (captured MacBook Air M5 configurations)", () => {
    const air = ["mdhj4-goluboi", "mdhc4-zolotistyi", "mdhg4-temno-sinii", "mdhh4-goluboi", "mdha4-zolotistyi"].map((c, i) => ({
      productId: String(170000000 + i), slug: `apple-macbook-air-13-2026-13-6-apple-m5-16-gb-ssd-512-gb-apple-m5-macos-${c}`,
    }));
    expect(familyKey(air[0]!.slug, "laptops")).toBe("laptops:apple-macbook-air");
    expect(pickSeedProducts(air, 70).get("laptops")).toHaveLength(FAMILY_CAP);
  });
});
