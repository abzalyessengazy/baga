import { describe, expect, it } from "vitest";
import { siteUrl } from "./site";

describe("siteUrl", () => {
  it("uses SITE_URL as given", () => {
    expect(siteUrl({ SITE_URL: "https://baga.kz" })).toBe("https://baga.kz");
  });
  it("adds https:// and drops paths and trailing slashes", () => {
    expect(siteUrl({ SITE_URL: "baga-xyz.vercel.app/" })).toBe("https://baga-xyz.vercel.app");
    expect(siteUrl({ SITE_URL: "  https://baga.kz/ru  " })).toBe("https://baga.kz");
  });
  it("ignores an empty or broken SITE_URL and uses Vercel's production domain", () => {
    expect(siteUrl({ SITE_URL: "", VERCEL_PROJECT_PRODUCTION_URL: "baga-xyz.vercel.app" })).toBe("https://baga-xyz.vercel.app");
    expect(siteUrl({ SITE_URL: "http://", VERCEL_PROJECT_PRODUCTION_URL: "baga-xyz.vercel.app" })).toBe("https://baga-xyz.vercel.app");
  });
  it("falls back to localhost", () => {
    expect(siteUrl({})).toBe("http://localhost:3000");
    expect(siteUrl({ SITE_URL: "" })).toBe("http://localhost:3000");
  });
});
