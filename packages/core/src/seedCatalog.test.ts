import { describe, expect, it } from "vitest";
import { seedCategory, pickSeedProducts } from "./seedCatalog";

describe("seedCategory", () => {
  it("reads the category from the link words", () => {
    expect(seedCategory("apple-iphone-18-pro-256gb-nanosim-esim-serebristyi")).toBe("phones");
    expect(seedCategory("apple-macbook-pro-14-2025-14-2-apple-m5-16-gb-ssd-1000-gb-chernyi")).toBe("laptops");
    expect(seedCategory("blender-statsionarnyi-white-wave-ww-grinder-serebristyi")).toBe("kitchen");
    expect(seedCategory("stiral-naya-mashina-lg-f2v5hs0w-belyi")).toBe("washers");
    expect(seedCategory("televizor-samsung-ue55du7100uxce-55-chernyi")).toBe("tvs");
  });
  it("puts tablets and watches before phones", () => {
    expect(seedCategory("planshet-apple-ipad-air-11-2025-wi-fi-128gb-seryi")).toBe("tablets");
    expect(seedCategory("smart-chasy-apple-watch-series-11-46-mm-chernyi")).toBe("watches");
  });
  it("skips accessories and unknown products", () => {
    expect(seedCategory("chehol-dlya-apple-iphone-18-pro-prozrachnyi")).toBeNull();
    expect(seedCategory("zashchitnoe-steklo-dlya-samsung-galaxy-a56")).toBeNull();
    expect(seedCategory("filtr-dlya-pylesosa-dyson-v15")).toBeNull();
    expect(seedCategory("kreslo-ofisnoe-chernoe")).toBeNull();
  });
  it("matches short words only as whole words", () => {
    expect(seedCategory("fen-dyson-supersonic-hd16-fioletovyi")).toBe("beauty");
    expect(seedCategory("fenix-ryukzak")).toBeNull();
  });
});

describe("pickSeedProducts", () => {
  it("dedupes, caps per category and spreads evenly", () => {
    const phones = Array.from({ length: 10 }, (_, i) => ({ productId: String(100000 + i), slug: `apple-iphone-${i}` }));
    const got = pickSeedProducts([...phones, phones[0]!, { productId: "200000", slug: "kreslo" }], 5);
    expect([...got.keys()]).toEqual(["phones"]);
    expect(got.get("phones")!.map((p) => p.productId)).toEqual(["100000", "100002", "100004", "100006", "100008"]);
  });
});
