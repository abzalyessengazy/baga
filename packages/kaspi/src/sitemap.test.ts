import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { parseSitemap, isKaspiSitemapUrl } from "./sitemap";
import { createKaspiClient } from "./client";

// Generic sitemaps.org samples. Replace with captured Kaspi files in fixtures/ once inspected in the visit window.
const index = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://kaspi.kz/shop/sitemap-products-1.xml.gz</loc><lastmod>2026-10-31</lastmod></sitemap>
  <sitemap><loc><![CDATA[https://kaspi.kz/shop/sitemap-categories.xml]]></loc></sitemap>
</sitemapindex>`;
const urlset = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://kaspi.kz/shop/p/apple-iphone-duo-256gb-dual-esim-sinii-180533183/</loc></url>
  <url><loc> https://kaspi.kz/shop/p/x-151699831/?a=1&amp;b=2 </loc></url>
</urlset>`;

describe("sitemap", () => {
  it("parses an index and a URL list", () => {
    expect(parseSitemap(index)).toEqual({ kind: "index", locs: ["https://kaspi.kz/shop/sitemap-products-1.xml.gz", "https://kaspi.kz/shop/sitemap-categories.xml"] });
    expect(parseSitemap(urlset).locs).toEqual(["https://kaspi.kz/shop/p/apple-iphone-duo-256gb-dual-esim-sinii-180533183/", "https://kaspi.kz/shop/p/x-151699831/?a=1&b=2"]);
    expect(() => parseSitemap("<html></html>")).toThrow();
  });
  it("fetches only kaspi.kz/shop sitemap files and unpacks gzip", async () => {
    expect(isKaspiSitemapUrl("https://kaspi.kz/shop/sitemap.xml")).toBe(true);
    expect(isKaspiSitemapUrl("https://evil.example/shop/sitemap.xml")).toBe(false);
    expect(isKaspiSitemapUrl("https://kaspi.kz/shop/p/x-1/")).toBe(false);
    const client = createKaspiClient({ fetch: (async () => new Response(gzipSync(urlset))) as unknown as typeof fetch });
    expect((await client.fetchSitemap("https://kaspi.kz/shop/sitemap-products-1.xml.gz")).locs).toHaveLength(2);
    await expect(client.fetchSitemap("https://example.com/shop/a.xml")).rejects.toThrow();
  });
});
