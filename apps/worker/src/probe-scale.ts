/**
 * Scale experiments (DECISIONS.md, 2026-11-03 "More products in the same Kaspi budget"): can one request to Kaspi give
 * the prices of many products? A fixed list of experiments, one request each, ≥10 s apart, honest User-Agent, inside
 * robots.txt's Visit-time and after the collector's last request (08:31–08:43 UTC). Only addresses robots.txt allows; no
 * cookies, tokens or browser imitation: an experiment that needs them has failed. Stops on 403/429. Responses are saved to
 * tmpdir for review; nothing is written to the database (with DATABASE_URL, prices found are compared read-only with the
 * prices the collector took today).
 *
 *   pnpm --filter @baga/worker probe:scale            run all experiments (in the window)
 *   pnpm --filter @baga/worker probe:scale --list     print the experiments, no requests
 *   pnpm --filter @baga/worker probe:scale --only E2,E4
 *   pnpm --filter @baga/worker probe:scale --set L    the follow-up on the JSON list (6 Nov): L1–L7
 *   pnpm --filter @baga/worker probe:scale --set C    what else the list can do (9 Nov, the owner's go): C1–C14
 *   pnpm --filter @baga/worker probe:scale --set Y    which goods depend on the city (10 Nov, the owner's go): Y1–Y26
 *   pnpm --filter @baga/worker probe:scale --set K    list coverage (11 Nov, the owner's go for a list tier): how many of
 *                                                      our stable products one list page holds, and their list prices
 *   --wait   started early by collect.yml: waits for 08:31 UTC (only if started after 08:15)
 */
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KASPI_CRAWL_DELAY_MS } from "@baga/core";
import { getSql } from "@baga/db";

const CITY = "750000000";
const A = "177318181"; // Apple iPhone 18 Pro, already collected daily
const B = "121772187"; // DREAME H13 Pro Plus Mix, from the user's category page
const CATEGORY = "https://kaspi.kz/shop/c/home%20equipment/";
const ua = process.env.KASPI_USER_AGENT ?? "BAGA price history bot (+contact: hello@baga.app)";

type Found = { prices: Map<string, number>; note: string };
type Experiment = {
  id: string;
  question: string;
  request: () => { url: string; init?: RequestInit };
  /** Skip unless an earlier experiment's result allows it (e.g. robots.txt). */
  when?: (results: Map<string, Result>) => string | null;
  read: (body: string, status: number) => Found;
};
type Result = { status: number; bytes: number; ms: number; body: string; found: Found };

const tenge = (s: string) => Number(s.replace(/[^\d]/g, ""));
const ids = (html: string) => new Set([...html.matchAll(/\/shop\/p\/[^"'\s]*?-(\d{6,12})\/?/g)].map((m) => m[1]!));
const json = (body: string): unknown => {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
};
/** Every {id|masterSku|productId, price|unitPrice} pair anywhere in a JSON value. */
function jsonPrices(v: unknown, out = new Map<string, number>()): Map<string, number> {
  if (Array.isArray(v)) v.forEach((x) => jsonPrices(x, out));
  else if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const id = o.masterSku ?? o.productId ?? o.id;
    const price = o.unitSalePrice ?? o.unitPrice ?? o.price;
    if ((typeof id === "string" || typeof id === "number") && /^\d{6,12}$/.test(String(id)) && typeof price === "number") {
      const prev = out.get(String(id));
      if (prev === undefined || price < prev) out.set(String(id), price);
    }
    Object.values(o).forEach((x) => jsonPrices(x, out));
  }
  return out;
}
/** Rendered cards: data-product-id + «Цена»; kept only when price ÷ months matches the instalment. */
function cardPrices(html: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const card of html.split('data-product-id="').slice(1)) {
    const p = [...card.matchAll(/item-card__prices-price">([^<]*)</g)].map((m) => tenge(m[1]!));
    const months = Number(card.match(/item-card__add-info">x(\d+)/)?.[1] ?? 0);
    const id = card.match(/^(\d+)/)?.[1];
    if (id && p[0] && (!months || !p[1] || Math.abs(Math.ceil(p[0] / months) - p[1]) <= 1)) out.set(id, p[0]);
  }
  return out;
}
const htmlFound = (body: string): Found => {
  const prices = cardPrices(body);
  for (const [k, v] of jsonPrices(json(body))) if (!prices.has(k)) prices.set(k, v);
  for (const m of body.matchAll(/"(?:id|productId|masterSku)"\s*:\s*"?(\d{6,12})"?[^{}]{0,400}?"(?:unitSalePrice|unitPrice|price)"\s*:\s*(\d+)/g))
    if (!prices.has(m[1]!)) prices.set(m[1]!, Number(m[2]));
  return { prices, note: `${ids(body).size} product links in raw HTML` };
};
const offersBody = (id: unknown) =>
  JSON.stringify({ cityId: CITY, id, merchantUID: [], limit: 50, page: 0, sortOption: "PRICE", highRating: null, searchText: null, isExcellentMerchant: false, zoneId: [], installationId: "-1" });
const offersInit = (id: unknown, referer: string): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json, text/*", "X-KS-City": CITY, Referer: referer },
  body: offersBody(id),
});
const offersFound = (body: string): Found => {
  const v = json(body) as { offers?: Array<{ masterSku?: string; price?: number }> } | null;
  const skus = new Set((v?.offers ?? []).map((o) => o.masterSku));
  return { prices: jsonPrices(v), note: v ? `${v.offers?.length ?? 0} offers, products: ${[...skus].join(", ")}` : "not JSON" };
};
const listingJson = (q: string, page = 0, extra = "") =>
  `https://kaspi.kz/yml/product-view/pl/results?page=${page}&q=${encodeURIComponent(q)}&text&sort=relevance&qs&c=${CITY}${extra}`;
const listingFound = (body: string): Found => {
  const v = json(body);
  if (!v) return htmlFound(body);
  const items = (v as { data?: Array<{ id?: string; stock?: number; categoryCodes?: string[] }> }).data;
  const extra = Array.isArray(items)
    ? `; ${items.length} items, out of stock: ${items.filter((i) => !i.stock).length}, categories: ${[...new Set(items.map((i) => i.categoryCodes?.[0]))].join(" | ")}`
    : "";
  const keys = Object.entries(v as object).filter(([, x]) => !Array.isArray(x)).map(([k, x]) => `${k}=${JSON.stringify(x).slice(0, 60)}`);
  // What one item carries (rating, reviews, sellers count, image…), and the order of prices (does a sort work?).
  const first = Array.isArray(items) && items[0] ? Object.entries(items[0] as object).map(([k, x]) => `${k}:${JSON.stringify(x).slice(0, 40)}`).join(" ") : "";
  const order = Array.isArray(items) ? items.map((i) => Math.round((i as { unitPrice?: number }).unitPrice ?? -1)).join(",") : "";
  const ids12 = Array.isArray(items) ? items.map((i) => i.id).join(",") : "";
  const arrays = Object.entries(v as object).filter(([k, x]) => Array.isArray(x) && k !== "data").map(([k, x]) => `${k}[${(x as unknown[]).length}]=${JSON.stringify((x as unknown[])[0] ?? null).slice(0, 160)}`);
  return { prices: jsonPrices(v), note: `JSON, top-level keys: ${Object.keys(v as object).join(", ")}${extra}${keys.length ? `; other fields: ${keys.join(", ")}` : ""}`
    + `${arrays.length ? `; other lists: ${arrays.join(" ; ")}` : ""}; prices in order: ${order}; ids: ${ids12}${first ? `; first item: ${first}` : ""}` };
};
const listReq = (code: string, page = 0, extra = "") => () => ({
  url: listingJson(`:category:${code}`, page, extra),
  init: { headers: { Accept: "application/json, text/*", Referer: `https://kaspi.kz/shop/c/${encodeURIComponent(code.toLowerCase())}/` } },
});

const EXPERIMENTS: Experiment[] = [
  {
    id: "E1",
    question: "Category page as our collector receives it: are product ids or prices in the raw HTML? (the user's browser check said no)",
    request: () => ({ url: `${CATEGORY}?c=${CITY}`, init: { headers: { Accept: "text/html" } } }),
    read: (b) => htmlFound(b),
  },
  {
    id: "E2",
    question: "Does a JSON product-list address answer for a category (the kind of address Kaspi's listing script could use)?",
    request: () => ({ url: listingJson(":category:Home equipment:availableInZones:Magnum_ZONE1"), init: { headers: { Accept: "application/json, text/*", Referer: CATEGORY } } }),
    read: (b) => listingFound(b),
  },
  {
    id: "E3",
    question: "Same JSON list address without the zone filter (in case the zone name differs).",
    request: () => ({ url: listingJson(":category:Home equipment"), init: { headers: { Accept: "application/json, text/*", Referer: CATEGORY } } }),
    read: (b) => listingFound(b),
  },
  {
    id: "E4",
    question: "Sellers address with two product ids as a list: does one request return offers for both?",
    request: () => ({ url: `https://kaspi.kz/yml/offer-view/offers/${A}`, init: offersInit([A, B], `https://kaspi.kz/shop/p/-${A}/`) }),
    read: (b) => offersFound(b),
  },
  {
    id: "E5",
    question: "Sellers address with two ids comma-separated: does one request return offers for both?",
    request: () => ({ url: `https://kaspi.kz/yml/offer-view/offers/${A}`, init: offersInit(`${A},${B}`, `https://kaspi.kz/shop/p/-${A}/`) }),
    read: (b) => offersFound(b),
  },
  {
    id: "E6",
    question: "Full product page: is the cheapest price in it (one request per check instead of page + sellers), and does it carry prices of other products (similar / bought together)?",
    request: () => ({ url: `https://kaspi.kz/shop/p/-${B}/?c=${CITY}`, init: { headers: { Accept: "text/html" } } }),
    read: (b) => {
      const f = htmlFound(b);
      const main = b.match(/"price"\s*:\s*(\d+)\s*,\s*"discount"/)?.[1];
      if (main) f.prices.set(B, Number(main));
      return { prices: f.prices, note: `${f.note}; main price field: ${main ?? "none"}` };
    },
  },
  {
    id: "E7",
    question: "Sellers for the same product as E6: does the page price equal the cheapest seller?",
    request: () => ({ url: `https://kaspi.kz/yml/offer-view/offers/${B}`, init: offersInit(B, `https://kaspi.kz/shop/p/-${B}/`) }),
    read: (b) => offersFound(b),
  },
  {
    id: "E8",
    question: "Mobile site robots.txt: does m.kaspi.kz exist, and what does it allow?",
    request: () => ({ url: "https://m.kaspi.kz/robots.txt", init: { headers: { Accept: "text/plain" } } }),
    read: (b, s) => ({ prices: new Map(), note: s === 200 ? b.replace(/\s+/g, " ").slice(0, 300) : `status ${s}` }),
  },
  {
    id: "E9",
    question: "Mobile category page: are product ids and prices in its raw HTML?",
    when: (r) => {
      const robots = r.get("E8");
      if (!robots || robots.status !== 200) return "m.kaspi.kz robots.txt not readable";
      if (/Disallow:\s*\/\s*$/m.test(robots.body) || /Disallow:\s*\/shop\/c\//.test(robots.body)) return "robots.txt disallows it";
      return null;
    },
    request: () => ({ url: `https://m.kaspi.kz/shop/c/home%20equipment/?c=${CITY}`, init: { headers: { Accept: "text/html" } } }),
    read: (b) => htmlFound(b),
  },
];

// Follow-up on E2 (6 Nov): does the list price equal the cheapest seller for products we checked today (the categories
// where we hold the most), can a page hold more than 12, and how deep do pages go. The codes are Kaspi's English
// category codes, as in the list items' categoryCodes ("Vacuum cleaners" was seen on 5 Nov; the others are likely).
EXPERIMENTS.push(
  { id: "L1", question: "List: smartphones page 1. Prices vs our checks today.", request: listReq("Smartphones"), read: listingFound },
  { id: "L2", question: "List: monitors page 1. Prices vs our checks today.", request: listReq("Monitors"), read: listingFound },
  { id: "L3", question: "List: vacuum cleaners page 1 (a code seen in 5 Nov's answer).", request: listReq("Vacuum cleaners"), read: listingFound },
  { id: "L4", question: "List: smartphones page 2 — a different 12?", request: listReq("Smartphones", 1), read: listingFound },
  { id: "L5", question: "Page size: smartphones page 1 with limit=48 — more than 12 items?", request: listReq("Smartphones", 0, "&limit=48"), read: listingFound },
  { id: "L6", question: "Page size: smartphones page 1 with size=48 — more than 12 items?", request: listReq("Smartphones", 0, "&size=48"), read: listingFound },
  { id: "L7", question: "Depth: smartphones page 60 (items 721–732) — does it still answer?", request: listReq("Smartphones", 60), read: listingFound },
);

// What else the list can do (9 Nov 2026, the owner's go after the 8 Nov list test): sorting (price low to high would
// make the shown price the cheapest one more often), brand and price filters, totals and the category tree (facets),
// how deep pages go, and what one item carries. Smartphones is the baseline; every guess is one request.
const listQ = (q: string, page = 0, sort = "relevance", ref = "smartphones") => () => ({
  url: `https://kaspi.kz/yml/product-view/pl/results?page=${page}&q=${encodeURIComponent(q)}&text&sort=${sort}&qs&c=${CITY}`,
  init: { headers: { Accept: "application/json, text/*", Referer: `https://kaspi.kz/shop/c/${ref}/` } },
});
const robotsDisallows = (r: Map<string, Result>) => {
  const b = r.get("C1");
  if (!b || b.status !== 200) return "robots.txt not read";
  return /^Disallow:\s*\/yml\b/m.test(b.body) ? "robots.txt disallows /yml/" : null;
};
EXPERIMENTS.push(
  { id: "C1", question: "robots.txt today: every Disallow, Crawl-delay and Visit-time.", request: () => ({ url: "https://kaspi.kz/robots.txt", init: { headers: { Accept: "text/plain" } } }),
    read: (b) => ({ prices: new Map(), note: b.split("\n").filter((l) => /^(User-agent|Disallow|Allow|Crawl-delay|Visit-time|Sitemap)/i.test(l.trim())).map((l) => l.trim()).join(" | ") }) },
  { id: "C2", question: "Baseline: smartphones, relevance, page 0: fields of an item, totals, facets.", when: robotsDisallows, request: listQ(":category:Smartphones"), read: listingFound },
  { id: "C3", question: "Sort price-asc: cheapest products first?", when: robotsDisallows, request: listQ(":category:Smartphones", 0, "price-asc"), read: listingFound },
  { id: "C4", question: "Sort price-desc.", when: robotsDisallows, request: listQ(":category:Smartphones", 0, "price-desc"), read: listingFound },
  { id: "C5", question: "Sort popularity.", when: robotsDisallows, request: listQ(":category:Smartphones", 0, "popularity"), read: listingFound },
  { id: "C6", question: "Sort rating.", when: robotsDisallows, request: listQ(":category:Smartphones", 0, "rating"), read: listingFound },
  { id: "C7", question: "Sort by newest (\"new\").", when: robotsDisallows, request: listQ(":category:Smartphones", 0, "new"), read: listingFound },
  { id: "C8", question: "Brand filter, form 1: :category:Smartphones:manufacturerName:Samsung.", when: robotsDisallows, request: listQ(":category:Smartphones:manufacturerName:Samsung"), read: listingFound },
  { id: "C9", question: "Brand filter, form 2: :manufacturerName:Apple:category:Smartphones.", when: robotsDisallows, request: listQ(":manufacturerName:Apple:category:Smartphones"), read: listingFound },
  { id: "C10", question: "Price filter: :category:Smartphones:price:400000 - 600000 (a guess at the facet form).", when: robotsDisallows, request: listQ(":category:Smartphones:price:400000 - 600000"), read: listingFound },
  { id: "C11", question: "The whole catalog: :category:Categories (total count, top-level categories as facets?).", when: robotsDisallows, request: listQ(":category:Categories", 0, "relevance", "categories"), read: listingFound },
  { id: "C12", question: "Another big category: TVs (code TV_Audio guess; the item categoryCodes in C2 tell the real form).", when: robotsDisallows, request: listQ(":category:TV_Audio", 0, "relevance", "tv_audio"), read: listingFound },
  { id: "C13", question: "Depth: smartphones page 150 (items 1801–1812).", when: robotsDisallows, request: listQ(":category:Smartphones", 150), read: listingFound },
  { id: "C14", question: "Same as C2 again: is the order stable between two requests a few minutes apart?", when: robotsDisallows, request: listQ(":category:Smartphones"), read: listingFound },
);

// Which goods depend on the city (10 Nov 2026): rule 7 ("one national price") was tested on 3 electronics products;
// on 9 Nov a medicine (Виусид) was on sale in Atyrau and had no sellers in Almaty. The same sellers request for 6 of
// our products in 4 cities: sellers, lowest price, and whether the sellers are the same. City ids: Almaty is ours;
// Astana, Shymkent and Atyrau follow Kaspi's code form (KATO-like) and are checked by the answers themselves (an
// unknown id should answer with no sellers or an error, also for the iPhone). Shymkent gets its newer code too.
const CITY_IDS: Record<string, string> = { almaty: "750000000", astana: "710000000", shymkent: "511010000", shymkent2: "790000000", atyrau: "231010000" };
const CITY_PRODUCTS: [string, string][] = [
  ["102017103", "Виусид саше (аптека; на 9 ноя нет в Алматы)"], ["101095688", "Виферон (аптека)"], ["102513315", "Подгузники Мама Знает (детские)"],
  ["100013906", "Philips фен-щётка (красота)"], ["166753901", "Сервиз VILLAGIO (дом)"], ["177318181", "iPhone 18 Pro (контроль: техника)"],
];
// The owner's city pages (9 Nov): kaspi.kz/shop/<city>/ (Astana is still "nur-sultan"). Y0x reads each page first and
// takes the city code it carries (the most frequent 9-digit code ending in 0000); Almaty's page must give ours,
// which checks the method. A code read there replaces the guess for that city's sellers requests below.
const CITY_PAGES: Record<string, string> = { almaty: "almaty", astana: "nur-sultan", shymkent: "shymkent", atyrau: "atyrau" };
const pageCityCode = (html: string): string | null => {
  const n = new Map<string, number>();
  for (const m of html.matchAll(/(?<!\d)(\d{5}0000)(?!\d)/g)) n.set(m[1]!, (n.get(m[1]!) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};
const cityCodes = new Map<string, string>();
for (const [city, slug] of Object.entries(CITY_PAGES)) {
  EXPERIMENTS.push({ id: `Y0${city}`, question: `City page kaspi.kz/shop/${slug}/: its city code`,
    request: () => ({ url: `https://kaspi.kz/shop/${slug}/`, init: { headers: { Accept: "text/html" } } }),
    read: (b) => {
      const code = pageCityCode(b);
      if (code) cityCodes.set(city, code);
      const near = [...b.matchAll(/.{0,40}(?<!\d)\d{5}0000(?!\d).{0,40}/g)].slice(0, 3).map((m) => m[0].replace(/\s+/g, " ")).join(" | ");
      return { prices: new Map(), note: `code ${code ?? "none"} (guess ${CITY_IDS[city]}); around: ${near.slice(0, 300)}` };
    } });
}
const cityOffers = (id: string, cityName: string): Experiment["request"] => () => { const city = cityCodes.get(cityName) ?? CITY_IDS[cityName]!; return {
  url: `https://kaspi.kz/yml/offer-view/offers/${id}`,
  init: { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/*", "X-KS-City": city, Referer: `https://kaspi.kz/shop/p/-${id}/?c=${city}` },
    body: JSON.stringify({ cityId: city, id, merchantUID: [], limit: 50, page: 0, sortOption: "PRICE", highRating: null, searchText: null, isExcellentMerchant: false, zoneId: [], installationId: "-1" }) },
}; };
const cityRead = (b: string): Found => {
  const v = json(b) as { offers?: Array<{ merchantName?: string; merchantId?: string; price?: number }>; offersCount?: number; total?: number } | null;
  if (!v) return { prices: new Map(), note: `not JSON: ${b.slice(0, 120)}` };
  const offers = v.offers ?? [];
  const prices = offers.map((o) => o.price).filter((p): p is number => typeof p === "number");
  return { prices: new Map(), note: `sellers ${offers.length}${v.offersCount !== undefined ? ` (count ${v.offersCount})` : ""}, lowest ${prices.length ? Math.min(...prices) : "-"}, first: ${offers.slice(0, 4).map((o) => `${o.merchantName ?? o.merchantId}:${o.price}`).join(", ")}` };
};
let y = 0;
for (const [id, label] of CITY_PRODUCTS) {
  for (const city of ["almaty", "astana", "shymkent", "atyrau"]) {
    EXPERIMENTS.push({ id: `Y${++y}`, question: `${label} · ${city}`, request: cityOffers(id, city), read: cityRead });
  }
}
for (const id of ["102017103", "177318181"]) EXPERIMENTS.push({ id: `Y${++y}`, question: `${id} · Shymkent with the other code 790000000`, request: cityOffers(id, "shymkent2"), read: cityRead });

// Clothes and shoes (9 Nov, the owner's coat): each size and colour is a variant. A coat link carries a numeric id
// (176841728 = grey XS); a shoe link carried a code with a letter (15956323b) that we cannot resolve: on 9 Nov
// kaspi.kz/shop/p/-15956323b/ redirected back to the same variant address. Can the page and the sellers request take
// these as they are, and do the pages name the other sizes?
const variantPage = (path: string): Experiment["request"] => () => ({ url: `https://kaspi.kz/shop/p/${path}/?c=${CITY}`, init: { headers: { Accept: "text/html" } } });
const variantRead = (b: string, s: number): Found => {
  const ids = [...new Set([...b.matchAll(/"(?:id|productId|configSku|masterSku|sku)"\s*:\s*"?([0-9]{5,12}[a-z]?)"?/g)].map((m) => m[1]!))].slice(0, 12);
  const price = b.match(/"price"\s*:\s*(\d+)/)?.[1];
  const sizes = [...new Set([...b.matchAll(/"(?:size|razmer|value)"\s*:\s*"([^"]{1,8})"/gi)].map((m) => m[1]!))].slice(0, 12);
  return { prices: new Map(), note: `${s}; ids in page: ${ids.join(",")}; price field: ${price ?? "none"}; size-like values: ${sizes.join(",")}; variants word: ${/variant/i.test(b)}` };
};
EXPERIMENTS.push(
  { id: "Yc1", question: "Coat page, numeric id (demisezonnaja-kurtka-adidas-kf1524-seryi-xs-176841728)", request: variantPage("demisezonnaja-kurtka-adidas-kf1524-seryi-xs-176841728"), read: variantRead },
  { id: "Yc2", question: "Coat sellers with the numeric id", request: cityOffers("176841728", "almaty"), read: cityRead },
  { id: "Yc3", question: "Shoe page with the letter code (-15956323b)", request: variantPage("-15956323b"), read: variantRead },
  { id: "Yc4", question: "Shoe sellers with the letter code as the id", request: cityOffers("15956323b", "almaty"), read: cityRead },
  { id: "Yc5", question: "The owner's coat short link from the phone (l.kaspi.kz/shop/BGBmhEPhiHA2Uc1): where it points (not followed)",
    request: () => ({ url: "https://l.kaspi.kz/shop/BGBmhEPhiHA2Uc1", init: { headers: { Accept: "text/html" } } }), read: (b, s) => ({ prices: new Map(), note: `${s} ${b.slice(0, 200)}` }) },
);

// --set K (11 Nov 2026, the owner's go for a "list tier"): before building it, measure what decides it. A list page
// returns 12 products in Kaspi's order for a category, not the ones we ask for; the tier only pays if our stable
// (catalog-tier) products fill those pages. For the 8 categories holding most of them: one product page each for
// Kaspi's category code (its breadcrumb), then 5 list pages each (relevance pages 0-3, popularity page 0), counting
// ours, ours on the catalog tier, and list price vs our stored lowest; plus two brand-filter forms. Read-only DB.
type Ours = { min: number | null; tier: string };
const ours = new Map<string, Ours>();
if (process.argv.includes("--set") && process.argv[process.argv.indexOf("--set") + 1] === "K") {
  const db = getSql();
  if (db) {
    const rows = await db<{ id: string; min: number | null; tier: string; cat: string | null }[]>`
      select p.external_id as id, s.current_min_price as min, c.priority as tier, p.category_path[array_length(p.category_path, 1)] as cat
      from products p join product_state s on s.product_id = p.id join collection_schedule c on c.product_id = p.id where p.status = 'active'`;
    for (const r of rows) ours.set(r.id, { min: r.min, tier: r.tier });
    const counts = new Map<string, { n: number; sample: string }>();
    for (const r of rows) if (r.tier === "catalog" && r.cat) {
      const c = counts.get(r.cat) ?? { n: 0, sample: r.id };
      c.n++; counts.set(r.cat, c);
    }
    const top = [...counts].sort((a, b) => b[1].n - a[1].n).slice(0, 8);
    const codes = new Map<string, string>();
    const lastCrumb = (html: string) => [...html.matchAll(/"link":"\/shop\/c\/[^"]*","id":"([^"]+)"\}\]/g)].at(-1)?.[1] ?? null;
    const coverage = (cat: string, n: number) => (body: string): Found => {
      const v = json(body) as { data?: Array<{ id?: string; unitPrice?: number }> } | null;
      const items = v?.data ?? [];
      const mine = items.filter((i) => i.id && ours.has(String(i.id)));
      const stable = mine.filter((i) => ours.get(String(i.id))!.tier === "catalog");
      const cmp = { same: 0, higher: 0, lower: 0 };
      for (const i of mine) {
        const o = ours.get(String(i.id))!;
        if (o.min === null || typeof i.unitPrice !== "number") continue;
        const p = Math.round(i.unitPrice);
        if (p === o.min) cmp.same++; else if (p > o.min) cmp.higher++; else cmp.lower++;
      }
      return { prices: new Map(), note: `«${cat}» (${n} stable of ours): ${items.length} items, ours ${mine.length}, stable ${stable.length}; list vs ours: same ${cmp.same}, higher ${cmp.higher}, lower ${cmp.lower}` };
    };
    top.forEach(([cat, c], k) => {
      EXPERIMENTS.push({ id: `K0${k}`, question: `Category code of «${cat}» from product ${c.sample}'s breadcrumb`,
        request: () => ({ url: `https://kaspi.kz/shop/p/-${c.sample}/?c=${CITY}`, init: { headers: { Accept: "text/html" } } }),
        read: (b) => { const code = lastCrumb(b); if (code) codes.set(cat, code); return { prices: new Map(), note: `«${cat}» → ${code ?? "none"}` }; } });
    });
    top.forEach(([cat, c], k) => {
      const pages: [number, string][] = [[0, "relevance"], [1, "relevance"], [2, "relevance"], [3, "relevance"], [0, "popularity"]];
      pages.forEach(([page, sort], j) => EXPERIMENTS.push({
        id: `K${k + 1}${j}`, question: `«${cat}» list, ${sort} page ${page}`,
        when: () => (codes.has(cat) ? null : "no category code"),
        request: () => { const code = codes.get(cat) ?? "(code)"; return { url: `https://kaspi.kz/yml/product-view/pl/results?page=${page}&q=${encodeURIComponent(`:category:${code}`)}&text&sort=${sort}&qs&c=${CITY}`,
          init: { headers: { Accept: "application/json, text/*", Referer: `https://kaspi.kz/shop/c/${encodeURIComponent(code.toLowerCase())}/` } } }; },
        read: coverage(cat, c.n) }));
    });
    // Brand filter, two forms, on the biggest category with its most common brand among our stable products.
    const [bigCat] = top[0] ?? [];
    if (bigCat) {
      const brands = new Map<string, number>();
      for (const r of await db<{ t: string }[]>`select p.title as t from products p join collection_schedule c on c.product_id = p.id
        where c.priority = 'catalog' and p.category_path[array_length(p.category_path, 1)] = ${bigCat}`) {
        const b = r.t.split(/\s+/).find((w) => /^[A-Za-z][A-Za-z0-9-]{2,}$/.test(w)); // the first Latin word: the brand
        if (b) brands.set(b, (brands.get(b) ?? 0) + 1);
      }
      const brand = [...brands].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Samsung";
      for (const [id, q] of [["KB1", (code: string) => `:category:${code}:manufacturerName:${brand}`], ["KB2", (code: string) => `:manufacturerName:${brand}:category:${code}`]] as const) {
        EXPERIMENTS.push({ id, question: `Brand filter «${brand}» in «${bigCat}», form ${id}`, when: () => (codes.has(bigCat) ? null : "no category code"),
          request: () => ({ url: `https://kaspi.kz/yml/product-view/pl/results?page=0&q=${encodeURIComponent(q(codes.get(bigCat) ?? "(code)"))}&text&sort=relevance&qs&c=${CITY}`,
            init: { headers: { Accept: "application/json, text/*" } } }),
          read: coverage(`${bigCat} · ${brand}`, top[0]![1].n) });
      }
    }
  }
}

if (process.argv.includes("--list")) {
  for (const e of EXPERIMENTS) console.log(`${e.id}  ${e.question}\n    ${e.request().url}`);
  process.exit(0);
}

const utcMinute = () => { const d = new Date(); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
if (process.argv.includes("--wait") && utcMinute() >= 8 * 60 + 15 && utcMinute() < 8 * 60 + 31) {
  const d = new Date(); d.setUTCHours(8, 31, 0, 0);
  console.log(`Waiting for 08:31 UTC (${Math.round((d.getTime() - Date.now()) / 1000)} s): the collector's last request is before 08:30.`);
  await new Promise((r) => setTimeout(r, d.getTime() - Date.now()));
}
// collect.yml can start a queued second run as the first ends (~08:43): with --wait, only a start by 08:32 probes.
if (process.argv.includes("--wait") && utcMinute() > 8 * 60 + 32) {
  console.log("Started after 08:32 UTC: another run already had the probe's minutes. No requests.");
  process.exit(0);
}
const minutes = utcMinute();
if ((minutes < 8 * 60 + 31 || minutes > 8 * 60 + 43) && !process.argv.includes("--in-window")) {
  console.log("Run between 08:31 and 08:43 UTC (13:31-13:43 Almaty), after the collector's last request and inside Kaspi's Visit-time. --list shows the experiments.");
  process.exit(0);
}

const only = process.argv[process.argv.indexOf("--only") + 1]?.split(",");
const set = process.argv.includes("--set") ? process.argv[process.argv.indexOf("--set") + 1] ?? "E" : "E";
const run = process.argv.includes("--only") && only ? EXPERIMENTS.filter((e) => only.includes(e.id)) : EXPERIMENTS.filter((e) => e.id.startsWith(set));
const results = new Map<string, Result>();
const all = new Map<string, number>();
let last = 0;
for (const e of run) {
  const skip = e.when?.(results);
  if (skip) {
    console.log(`\n${e.id} SKIPPED: ${skip}`);
    continue;
  }
  const wait = last + KASPI_CRAWL_DELAY_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  // Never past 08:43 UTC: Kaspi's Visit-time ends at 08:45.
  if (utcMinute() > 8 * 60 + 43 && !process.argv.includes("--in-window")) { console.log(`\nStopped at ${e.id}: 08:43 UTC reached.`); break; }
  const { url, init } = e.request();
  const t0 = Date.now();
  last = t0;
  let status = 0;
  let body = "";
  let location: string | null = null;
  try {
    const res = await fetch(url, { ...init, headers: { "User-Agent": ua, ...(init?.headers ?? {}) }, redirect: "manual", signal: AbortSignal.timeout(30_000) });
    status = res.status;
    location = res.headers.get("location");
    body = await res.text();
  } catch (err) {
    body = String(err);
  }
  const found = status >= 200 && status < 300 ? e.read(body, status)
    : { prices: new Map<string, number>(), note: `${location ? `redirect to ${location}; ` : ""}${body.slice(0, 200)}` };
  const r: Result = { status, bytes: body.length, ms: Date.now() - t0, body, found };
  results.set(e.id, r);
  writeFileSync(join(tmpdir(), `kaspi-${e.id}.txt`), body);
  for (const [k, v] of found.prices) if (!all.has(k)) all.set(k, v);
  console.log(`\n${e.id} ${e.question}\n  ${status} · ${r.ms} ms · ${r.bytes} bytes · ${url}\n  ${found.note}\n  prices found: ${found.prices.size} ${JSON.stringify([...found.prices].slice(0, 6))}`);
  if (status === 403 || status === 429) {
    console.log(`\nStopped: Kaspi answered ${status}. Nothing more is requested.`);
    break;
  }
}
console.log(`\nResponses saved as ${join(tmpdir(), `kaspi-${set}*.txt`)}`);
// In GitHub Actions: one annotation with every result, readable without a login (job logs are not).
if (process.env.GITHUB_ACTIONS) {
  const esc = (x: string) => x.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  // GitHub keeps ~4 KB of an annotation and 10 notices per step (9 Nov: one long notice was cut after 4 of 14):
  // short lines, packed into up to 9 notices of ≤3,900 characters.
  const lines = [...results].map(([id, r]) => `${id} ${r.status}: ${r.found.note.slice(0, set === "C" ? 600 : 300)}`);
  const parts: string[] = [];
  for (const l of lines) {
    if (parts.length && parts[parts.length - 1]!.length + l.length + 1 <= 3_900) parts[parts.length - 1] += `\n${l}`;
    else parts.push(l.slice(0, 3_900));
  }
  parts.slice(0, 9).forEach((p, i) => console.log(`::notice title=Kaspi probe ${set} ${i + 1}/${Math.min(parts.length, 9)}::${esc(p)}`));
}

const e6 = results.get("E6")?.found.prices.get(B);
const e7 = results.get("E7")?.found.prices.get(B);
if (e6 !== undefined && e7 !== undefined) console.log(`Page price vs cheapest seller for ${B}: ${e6} vs ${e7} → ${e6 === e7 ? "SAME" : "DIFFERENT"}`);

const sql = getSql();
if (sql && all.size) {
  const rows = await sql<{ external_id: string; current_min_price: number | null; offer_count: number; in_stock: boolean; last_checked_at: Date }[]>`
    select p.external_id, s.current_min_price, s.offer_count, s.in_stock, s.last_checked_at
    from products p join product_state s on s.product_id = p.id
    where p.external_id = any(${[...all.keys()]}) and s.last_checked_at > now() - interval '12 hours'`;
  const diff = rows.filter((r) => r.current_min_price !== all.get(r.external_id));
  console.log(JSON.stringify({ found: all.size, comparedWithToday: rows.length, same: rows.length - diff.length,
    different: diff.map((r) => ({ id: r.external_id, ours: r.current_min_price, list: all.get(r.external_id), sellers: r.offer_count, inStock: r.in_stock,
      checkedMinAgo: Math.round((Date.now() - r.last_checked_at.getTime()) / 60_000) })) }, null, 1));
  await sql.end();
}
if (ours.size) await getSql()?.end({ timeout: 5 }).catch(() => {});
