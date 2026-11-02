import { describe, expect, it } from "vitest";
import { searchTokens, isValidSlug, slugWords, slugTokens, slugName } from "./search";

describe("searchTokens", () => {
  it("lowercases and splits on anything that is not a letter or digit", () => {
    expect(searchTokens("Apple  iPhone-18, Pro!")).toEqual(["apple", "iphone", "18", "pro"]);
  });
  it("keeps Cyrillic and Kazakh letters", () => {
    expect(searchTokens("Блендер ақ түсті")).toEqual(["блендер", "ақ", "түсті"]);
  });
  it("drops one-letter words and duplicates, and caps the count", () => {
    expect(searchTokens("a b tv tv")).toEqual(["tv"]);
    expect(searchTokens("one two three four five six seven")).toHaveLength(6);
  });
  it("returns nothing for punctuation only", () => {
    expect(searchTokens("  -- !! ")).toEqual([]);
  });
});

describe("slugs", () => {
  it("accepts Kaspi-style slugs only", () => {
    expect(isValidSlug("blender-statsionarnyi-white-wave-ww-grinder-serebristyi")).toBe(true);
    expect(isValidSlug("Bad Slug")).toBe(false);
    expect(isValidSlug("<script>")).toBe(false);
    expect(isValidSlug("")).toBe(false);
    expect(isValidSlug(null)).toBe(false);
    expect(isValidSlug("a".repeat(201))).toBe(false);
  });
  it("splits a slug into words and search tokens", () => {
    expect(slugWords("apple-iphone-18-pro-256gb")).toEqual(["apple", "iphone", "18", "pro", "256gb"]);
    expect(slugTokens("ww-grinder-ww-x")).toEqual(["ww", "grinder"]);
    expect(slugWords("not a slug")).toEqual([]);
  });
  it("makes a readable name from a slug", () => {
    expect(slugName("27-xiaomi-redmi-g27q-2026-p27qdb-rg-chernyi")).toBe("27 Xiaomi Redmi G27Q 2026 P27QDB RG черный");
    expect(slugName("apple-iphone-18-pro-256gb")).toBe("Apple Iphone 18 Pro 256GB");
    expect(slugName("not a slug")).toBe("");
  });
});
