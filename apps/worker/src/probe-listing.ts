/**
 * One-off research probe (DECISIONS.md, 2026-11-03 "More products in the same Kaspi budget", stage B): does one
 * Kaspi category page carry the prices of many products? Two requests at most, 10 s apart, inside robots.txt's
 * Visit-time and after the collector's last request (08:30 UTC): the Almaty category sitemap on Kaspi's CDN,
 * then one category page on kaspi.kz. No database; the page is saved for review, nothing is stored as a price.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KASPI_CRAWL_DELAY_MS } from "@baga/core";

const now = new Date();
const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
// After the collector stops (08:30) and before Kaspi's Visit-time ends (08:45).
if ((minutes < 8 * 60 + 31 || minutes > 8 * 60 + 43) && !process.argv.includes("--in-window")) {
  console.log("Run between 08:31 and 08:43 UTC (13:31-13:43 Almaty), after the collector's last request and inside Kaspi's Visit-time.");
  process.exit(0);
}

const ua = process.env.KASPI_USER_AGENT ?? "BAGA price history bot (+contact: hello@baga.app)";
const get = async (url: string, accept: string) => {
  const t0 = Date.now();
  const res = await fetch(url, { headers: { "User-Agent": ua, Accept: accept }, redirect: "manual", signal: AbortSignal.timeout(30_000) });
  const body = await res.text();
  console.log(`${res.status} ${Date.now() - t0} ms ${body.length} bytes  ${url}`);
  return { status: res.status, body };
};

// The Almaty category sitemap, at the address the sitemap index fixture lists (Kaspi's CDN, not kaspi.kz).
const index = readFileSync(join(import.meta.dirname, "../../../packages/kaspi/fixtures/sitemap-index.xml"), "utf8");
const catMap = [...index.matchAll(/<loc>([^<]*Category-ru-KZT-almaty\.xml)<\/loc>/g)][0]?.[1];
let category = process.argv.slice(2).find((a) => a.startsWith("https://kaspi.kz/shop/c/"));
if (!category && catMap) {
  const m = await get(catMap, "application/xml");
  const locs = [...m.body.matchAll(/<loc>(https:\/\/kaspi\.kz\/shop\/c\/[^<]+)<\/loc>/g)].map((x) => x[1]!);
  category = locs.find((u) => /\/smartphones\/?(\?|$)/.test(u)) ?? locs.find((u) => /smartfon|smartphone/.test(u));
  console.log(`category sitemap: ${locs.length} category links; picked ${category ?? "none"}`);
  await new Promise((r) => setTimeout(r, KASPI_CRAWL_DELAY_MS));
}
category ??= "https://kaspi.kz/shop/c/smartphones/";

const page = await get(category, "text/html");
const saved = join(tmpdir(), "kaspi-probe-listing.html");
writeFileSync(saved, page.body);

// What a listing pass could use: product links, and prices next to them in embedded data.
const ids = new Set([...page.body.matchAll(/\/shop\/p\/[^"'\s]*?-(\d{6,12})\/?/g)].map((x) => x[1]));
const priced = [...page.body.matchAll(/"(?:unitPrice|price|priceFormatted|unitSalePrice)"\s*:\s*"?([\d\s]+)/g)].length;
const markers = ["BACKEND.components", "catalog", "products", "unitPrice", "cardsGrid", "__NEXT_DATA__", "window.digitalData"]
  .filter((m) => page.body.includes(m));
console.log(JSON.stringify({ status: page.status, productLinks: ids.size, priceFields: priced, markers, saved }, null, 2));
