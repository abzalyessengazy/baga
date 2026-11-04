/**
 * One-off research probe (DECISIONS.md, 2026-11-03 "More products in the same Kaspi budget", stage B): does a Kaspi
 * category page carry the cheapest price of many products in its raw HTML (no scripts run)? Three requests, 10 s apart,
 * inside robots.txt's Visit-time and after the collector's last request (08:30 UTC): page 1, page 2, and a
 * price-filtered page of «Бытовая техника» (addresses as the user's browser showed them; /shop/c/ is allowed by robots.txt,
 * only /search/ is not). Pages are saved for review; nothing is stored as a price. With DATABASE_URL, listing prices are
 * compared read-only with the prices the collector took today for the same products.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KASPI_CRAWL_DELAY_MS } from "@baga/core";
import { getSql } from "@baga/db";

const now = new Date();
const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
// After the collector stops (08:30) and before Kaspi's Visit-time ends (08:45); 3 requests take ~30 s.
if ((minutes < 8 * 60 + 31 || minutes > 8 * 60 + 43) && !process.argv.includes("--in-window") && !process.argv.includes("--file")) {
  console.log("Run between 08:31 and 08:43 UTC (13:31-13:43 Almaty), after the collector's last request and inside Kaspi's Visit-time.");
  process.exit(0);
}

const PAGES: Array<[string, string]> = [
  ["page1", "https://kaspi.kz/shop/c/home%20equipment/"],
  ["page2", "https://kaspi.kz/shop/c/home%20equipment/?page=2"],
  [
    "price100k",
    "https://kaspi.kz/shop/atyrau/c/home%20equipment/?q=%3AavailableInZones%3A231010000%3Acategory%3AHome%20equipment%3Aprice%3A100%20000%20-%20149%20999%20%D1%82&sort=relevance&sc=",
  ],
];

const ua = process.env.KASPI_USER_AGENT ?? "BAGA price history bot (+contact: hello@baga.app)";
const get = async (url: string) => {
  const t0 = Date.now();
  const res = await fetch(url, { headers: { "User-Agent": ua, Accept: "text/html" }, redirect: "manual", signal: AbortSignal.timeout(30_000) });
  const body = await res.text();
  console.log(`${res.status} ${Date.now() - t0} ms ${body.length} bytes  ${url}`);
  return { status: res.status, body, location: res.headers.get("location") };
};

const tenge = (s: string) => Number(s.replace(/[^\d]/g, ""));

/** Rendered cards: `data-product-id`, then «Цена» and the 12-month instalment (price ≈ instalment × 12, a sanity check). */
function cardPrices(html: string) {
  return html
    .split('data-product-id="')
    .slice(1)
    .map((card) => {
      const prices = [...card.matchAll(/item-card__prices-price">([^<]*)</g)].map((m) => tenge(m[1]!));
      const months = Number(card.match(/item-card__add-info">x(\d+)/)?.[1] ?? 0);
      const price = prices[0] ?? 0;
      const instalment = prices[1] ?? 0;
      const consistent = months > 0 && instalment > 0 ? Math.abs(Math.ceil(price / months) - instalment) <= 1 : null;
      return { id: card.match(/^(\d+)/)?.[1] ?? "", price, instalment, months, consistent };
    });
}

/** Product id -> price, from rendered cards or from card objects embedded in the HTML (id before or after the price). */
function listingPrices(html: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of cardPrices(html)) if (c.id && c.price && c.consistent !== false) out.set(c.id, c.price);
  const odd = cardPrices(html).filter((c) => c.consistent === false);
  if (odd.length) console.log(`cards whose price doesn't match instalment × months (skipped): ${JSON.stringify(odd)}`);
  const price = String.raw`"(?:unitSalePrice|unitPrice|price)"\s*:\s*"?(\d[\d\s]*)`;
  const id = String.raw`"id"\s*:\s*"?(\d{6,12})"?`;
  for (const m of html.matchAll(new RegExp(`${id}[^{}]{0,600}?${price}`, "g"))) if (!out.has(m[1]!)) out.set(m[1]!, Number(m[2]!.replace(/\s/g, "")));
  for (const m of html.matchAll(new RegExp(`${price}[^{}]{0,600}?${id}`, "g"))) if (!out.has(m[2]!)) out.set(m[2]!, Number(m[1]!.replace(/\s/g, "")));
  return out;
}

// Offline: parse a saved page (e.g. one copied from the browser) and exit, no requests.
const file = process.argv[process.argv.indexOf("--file") + 1];
if (process.argv.includes("--file") && file) {
  const prices = listingPrices(readFileSync(file, "utf8"));
  console.log(JSON.stringify({ file, priced: prices.size, prices: [...prices] }));
  process.exit(0);
}

const all = new Map<string, number>();
for (const [i, [name, url]] of PAGES.entries()) {
  if (i > 0) await new Promise((r) => setTimeout(r, KASPI_CRAWL_DELAY_MS));
  const page = await get(url);
  if (page.status === 403 || page.status === 429) {
    console.log(`Stopped: Kaspi answered ${page.status}.`);
    break;
  }
  const saved = join(tmpdir(), `kaspi-probe-${name}.html`);
  writeFileSync(saved, page.body);
  const links = new Set([...page.body.matchAll(/\/shop\/p\/[^"'\s]*?-(\d{6,12})\/?/g)].map((x) => x[1]));
  const prices = listingPrices(page.body);
  for (const [k, v] of prices) all.set(k, v);
  const markers = ["BACKEND.components", "catalog", "cards", "unitPrice", "unitSalePrice", "__NEXT_DATA__", "window.digitalData"].filter((m) =>
    page.body.includes(m),
  );
  console.log(JSON.stringify({ name, status: page.status, location: page.location, productLinks: links.size, priced: prices.size, markers, saved, sample: [...prices].slice(0, 5) }));
}

// Read-only check: listing price vs the cheapest offer the collector saw today for the same product.
const sql = getSql();
if (sql && all.size) {
  const rows = await sql<{ external_id: string; current_min_price: number | null; last_checked_at: Date }[]>`
    select p.external_id, s.current_min_price, s.last_checked_at
    from products p join product_state s on s.product_id = p.id
    where p.external_id = any(${[...all.keys()]}) and s.last_checked_at > now() - interval '12 hours'`;
  const diff = rows.filter((r) => r.current_min_price !== all.get(r.external_id));
  console.log(JSON.stringify({ comparedToday: rows.length, same: rows.length - diff.length, different: diff.map((r) => [r.external_id, r.current_min_price, all.get(r.external_id)]) }));
  await sql.end();
} else console.log(sql ? "No listing prices parsed: nothing to compare." : "No DATABASE_URL: skipped the comparison with today's prices.");
