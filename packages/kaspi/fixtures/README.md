Real Kaspi responses captured on 1 Nov 2026 (offers trimmed to 3 of 30, product page trimmed to the data line).
Parser tests run against these. When Kaspi changes its format, capture new fixtures and update the parser together.
`sitemap-index.xml` (captured 2 Nov 2026: 350 `Product-ru-KZT-<uuid>.xml` + 320 per-city `Category-…` files, all in one dated folder on resources.cdn-kaspi.kz) and `sitemap-sample.xml` (first 200 URLs of one product sitemap) are written by `pnpm --filter @baga/worker discover`.
