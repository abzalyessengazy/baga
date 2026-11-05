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
  return { prices: jsonPrices(v), note: `JSON, top-level keys: ${Object.keys(v as object).join(", ")}${extra}${keys.length ? `; other fields: ${keys.join(", ")}` : ""}` };
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

if (process.argv.includes("--list")) {
  for (const e of EXPERIMENTS) console.log(`${e.id}  ${e.question}\n    ${e.request().url}`);
  process.exit(0);
}

const now = new Date();
const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
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
  const { url, init } = e.request();
  const t0 = Date.now();
  last = t0;
  let status = 0;
  let body = "";
  try {
    const res = await fetch(url, { ...init, headers: { "User-Agent": ua, ...(init?.headers ?? {}) }, redirect: "manual", signal: AbortSignal.timeout(30_000) });
    status = res.status;
    body = await res.text();
  } catch (err) {
    body = String(err);
  }
  const found = status >= 200 && status < 300 ? e.read(body, status) : { prices: new Map<string, number>(), note: body.slice(0, 200) };
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
