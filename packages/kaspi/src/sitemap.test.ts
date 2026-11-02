import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  it("parses the captured Kaspi index (2 Nov 2026): 350 product + 320 category files, all allowed", () => {
    const real = parseSitemap(readFileSync(join(__dirname, "../fixtures/sitemap-index.xml"), "utf8"));
    expect(real.kind).toBe("index");
    expect(real.locs.filter((l) => l.includes("/Product-ru-KZT-"))).toHaveLength(350);
    expect(real.locs.every(isKaspiSitemapUrl)).toBe(true);
  });

  it("parses an index and a URL list", () => {
    expect(parseSitemap(index)).toEqual({ kind: "index", locs: ["https://kaspi.kz/shop/sitemap-products-1.xml.gz", "https://kaspi.kz/shop/sitemap-categories.xml"] });
    expect(parseSitemap(urlset).locs).toEqual(["https://kaspi.kz/shop/p/apple-iphone-duo-256gb-dual-esim-sinii-180533183/", "https://kaspi.kz/shop/p/x-151699831/?a=1&b=2"]);
    expect(() => parseSitemap("<html></html>")).toThrow();
  });
  it("fetches only kaspi.kz/shop sitemap files and unpacks gzip", async () => {
    expect(isKaspiSitemapUrl("https://kaspi.kz/shop/sitemap.xml")).toBe(true);
    expect(isKaspiSitemapUrl("https://evil.example/shop/sitemap.xml")).toBe(false);
    expect(isKaspiSitemapUrl("https://kaspi.kz/shop/p/x-1/")).toBe(false);
    // Kaspi's index lists files on its CDN (seen 2 Nov 2026); only that folder pattern is allowed there.
    expect(isKaspiSitemapUrl("https://resources.cdn-kaspi.kz/img/cnt/s/m/20261102070000/Product-ru-KZT-3830971e-c46f-41ba-a1ce-393ad6b8a6f9.xml")).toBe(true);
    expect(isKaspiSitemapUrl("https://resources.cdn-kaspi.kz/img/m/p/p6a/p37/179848971.xml")).toBe(false);
    expect(isKaspiSitemapUrl("https://resources.cdn-kaspi.kz/img/cnt/s/m/20261102070000/../../x.xml")).toBe(false);
    expect(isKaspiSitemapUrl("https://resources.cdn-kaspi.kz.evil.example/img/cnt/s/m/20261102070000/a.xml")).toBe(false);
    const client = createKaspiClient({ fetch: (async () => new Response(gzipSync(urlset))) as unknown as typeof fetch });
    expect((await client.fetchSitemap("https://kaspi.kz/shop/sitemap-products-1.xml.gz")).locs).toHaveLength(2);
    await expect(client.fetchSitemap("https://example.com/shop/a.xml")).rejects.toThrow();
  });
});
