/**
 * List price vs cheapest seller, live (6 Nov follow-up to probe:scale --set L). Does the price on Kaspi's JSON product
 * list equal the cheapest seller? On 6 Nov 2 of 3 live checks matched; on 177318958 the list showed TECHNODOM's
 * 909,990 ₸ (first on the page) while four sellers were cheaper (904,219 ₸). This measures how often that happens.
 *
 * Runs after the collector's last request of the day and inside Kaspi's Visit-time: from collectEndMinute + 1 until
 * 08:43:30 UTC, one request at a time, ≥11 s apart, the collector's User-Agent and headers, no cookies. Stops on
 * 403/429. Nothing is written to the database (prices of products the collector checked in the last hour are compared
 * read-only as a free extra).
 *
 *   1. Page size: a few names for a size setting on one list page (does any give more than 12?).
 *   2. Pairs, in rounds over categories: one list page, then the sellers of 3 of its products right after (≤40 s lag).
 *      Each pair: list price, Kaspi's chosen shop (bestMerchant) and big chains (majorMerchants) vs the cheapest seller.
 *
 *   pnpm --filter @baga/worker probe:pairs           (in the window; --dry prints the plan)
 * Output: tmpdir/kaspi-P.jsonl (one line per request) and a summary.
 */
import { appendFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KASPI_VISIT_WINDOW_UTC, collectEndMinute } from "@baga/core";
import { getSql } from "@baga/db";
import { parseOffers } from "@baga/kaspi";

const CITY = "750000000";
const SPACING_MS = 11_000;
const ua = process.env.KASPI_USER_AGENT ?? "BAGA price history bot (+contact: hello@baga.app)";
const LAST_START_MINUTE = KASPI_VISIT_WINDOW_UTC.endMinute - 1.5; // 08:43:30 UTC
const OUT = join(tmpdir(), "kaspi-P.jsonl");

// Kaspi's English category codes seen in list items (5–6 Nov), leaves and parents, for variety.
const CATEGORIES = [
  "Smartphones", "Monitors", "Vacuum cleaners", "Air fryers", "Kettles", "Steam cleaners", "Stoves and grills",
  "Air coolers", "Cleaners and humidifiers", "Peripherals", "Computers", "Kitchen appliances", "Climate equipment",
  "Small home appliances", "Home equipment", "Smartphones and gadgets",
];
const SIZE_TRIES = ["pageSize=24", "per_page=24", "rows=24", "count=24", "itemsPerPage=24", "ps=24"];
const PAIRS_PER_PAGE = 3;

const minuteNow = () => { const d = new Date(); return d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60; };
const startMinute = collectEndMinute(new Date()) + 1;
const listUrl = (code: string, page: number, extra = "") =>
  `https://kaspi.kz/yml/product-view/pl/results?page=${page}&q=${encodeURIComponent(`:category:${code}`)}&text&sort=relevance&qs&c=${CITY}${extra ? `&${extra}` : ""}`;

if (process.argv.includes("--dry")) {
  console.log(`window ${startMinute}–${LAST_START_MINUTE} (UTC minutes), spacing ${SPACING_MS} ms → ≤${Math.floor(((LAST_START_MINUTE - startMinute) * 60_000) / SPACING_MS)} requests`);
  console.log(SIZE_TRIES.map((x) => listUrl("Smartphones", 0, x)).join("\n"));
  console.log(CATEGORIES.map((c) => listUrl(c, 0)).join("\n"));
  process.exit(0);
}
if (minuteNow() < startMinute || minuteNow() >= LAST_START_MINUTE) {
  console.log(`Run between UTC minute ${startMinute} and ${LAST_START_MINUTE} (after the collector, inside Kaspi's Visit-time).`);
  process.exit(0);
}

let last = 0;
let stopped: string | null = null;
let count = 0;
async function get(kind: string, url: string, init: RequestInit): Promise<unknown | null> {
  const wait = last + SPACING_MS + Math.round(Math.random() * 1000) - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  if (minuteNow() >= LAST_START_MINUTE) { stopped = "window end"; return null; }
  last = Date.now();
  count++;
  let status = 0;
  let body = "";
  try {
    const res = await fetch(url, { ...init, headers: { "User-Agent": ua, ...(init.headers ?? {}) }, redirect: "manual", signal: AbortSignal.timeout(20_000) });
    status = res.status;
    body = await res.text();
  } catch (e) {
    body = String(e);
  }
  appendFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), kind, url, status, ms: Date.now() - last, body: body.slice(0, 200_000) }) + "\n");
  if (status === 403 || status === 429) { stopped = `Kaspi answered ${status}`; return null; }
  if (status !== 200) return null;
  try { return JSON.parse(body); } catch { return null; }
}

type Item = { id: string; unitPrice?: number; bestMerchant?: string; majorMerchants?: unknown; stock?: number; categoryCodes?: string[] };
const list = (code: string, page: number, extra = "") =>
  get(extra ? `size:${extra}` : `list:${code}:${page}`, listUrl(code, page, extra), {
    headers: { Accept: "application/json, text/*", Referer: `https://kaspi.kz/shop/c/${encodeURIComponent(code.toLowerCase())}/` },
  }) as Promise<{ data?: Item[] } | null>;
const offers = (id: string) =>
  get(`offers:${id}`, `https://kaspi.kz/yml/offer-view/offers/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/*", "X-KS-City": CITY, Referer: `https://kaspi.kz/shop/p/-${id}/` },
    body: JSON.stringify({ cityId: CITY, id, merchantUID: [], limit: 50, page: 0, sortOption: "PRICE", highRating: null, searchText: null, isExcellentMerchant: false, zoneId: [], installationId: "-1" }),
  });

writeFileSync(OUT, "");
const sizes: Record<string, number | null> = {};
for (const x of SIZE_TRIES) {
  if (stopped) break;
  const r = await list("Smartphones", 0, x);
  sizes[x] = r?.data?.length ?? null;
}

type Pair = {
  id: string; category: string; listPrice: number; cheapest: number; cheapestMerchant: string; sellers: number;
  bestMerchant: string | null; bestIsCheapest: boolean; bestPrice: number | null; bestRank: number | null; major: string[]; lagS: number;
};
const pairs: Pair[] = [];
const listed = new Map<string, number>();
for (let page = 0; !stopped; page++) {
  for (const code of CATEGORIES) {
    if (stopped) break;
    const t = Date.now();
    const r = await list(code, page);
    const items = (r?.data ?? []).filter((i) => i.stock !== 0 && typeof i.unitPrice === "number");
    for (const i of items) listed.set(String(i.id), Math.round(i.unitPrice!));
    // Spread the picks over the page: first, middle and last positions.
    const picks = items.length <= PAIRS_PER_PAGE ? items : [0, Math.floor(items.length / 2), items.length - 1].map((k) => items[k]!);
    for (const it of picks) {
      if (stopped) break;
      const o = await offers(String(it.id));
      if (!o) continue;
      let sellers;
      try { sellers = parseOffers(o); } catch { continue; }
      if (!sellers.length) continue;
      const best = it.bestMerchant ? String(it.bestMerchant) : null;
      const rank = best ? sellers.findIndex((s) => s.sellerId === best) : -1;
      const major = Array.isArray(it.majorMerchants) ? it.majorMerchants.map(String) : [];
      pairs.push({
        id: String(it.id), category: code, listPrice: Math.round(it.unitPrice!), cheapest: sellers[0]!.price, cheapestMerchant: sellers[0]!.sellerId,
        sellers: sellers.length, bestMerchant: best, bestIsCheapest: rank === 0 || (rank > 0 && sellers[rank]!.price === sellers[0]!.price),
        bestPrice: rank >= 0 ? sellers[rank]!.price : null, bestRank: rank >= 0 ? rank + 1 : null, major, lagS: Math.round((Date.now() - t) / 1000),
      });
    }
  }
}

const same = pairs.filter((p) => p.listPrice === p.cheapest);
const near = pairs.filter((p) => p.listPrice !== p.cheapest && Math.abs(p.listPrice - p.cheapest) / p.cheapest <= 0.001);
const higher = pairs.filter((p) => p.listPrice > p.cheapest && Math.abs(p.listPrice - p.cheapest) / p.cheapest > 0.001);
const lower = pairs.filter((p) => p.listPrice < p.cheapest && Math.abs(p.listPrice - p.cheapest) / p.cheapest > 0.001);
const pct = (n: number) => (pairs.length ? `${((100 * n) / pairs.length).toFixed(1)}%` : "-");
console.log(JSON.stringify({
  requests: count, stopped, pageSize: sizes, pairs: pairs.length,
  listEqualsCheapest: `${same.length} (${pct(same.length)})`,
  within0_1pct: `${near.length} (${pct(near.length)})`,
  listHigher: `${higher.length} (${pct(higher.length)})`,
  listLower: `${lower.length} (${pct(lower.length)})`,
  chosenShopIsCheapest: pairs.filter((p) => p.bestIsCheapest).length,
  chosenShopIsMajorWhenHigher: higher.filter((p) => p.bestMerchant && p.major.includes(p.bestMerchant)).length,
  mismatches: [...higher, ...lower, ...near].map((p) => ({ id: p.id, list: p.listPrice, cheapest: p.cheapest, gapPct: +((100 * (p.listPrice - p.cheapest)) / p.cheapest).toFixed(2),
    chosen: p.bestMerchant, chosenPrice: p.bestPrice, chosenRank: p.bestRank, major: p.major.includes(p.bestMerchant ?? "-"), sellers: p.sellers, lagS: p.lagS })),
}, null, 1));
writeFileSync(join(tmpdir(), "kaspi-P-pairs.json"), JSON.stringify(pairs, null, 1));

// Free extra: list prices vs the collector's checks from the last hour (read-only).
const sql = getSql();
if (sql && listed.size) {
  const rows = await sql<{ external_id: string; current_min_price: number | null; last_checked_at: Date }[]>`
    select p.external_id, s.current_min_price, s.last_checked_at from products p join product_state s on s.product_id = p.id
    where p.external_id = any(${[...listed.keys()]}) and s.last_checked_at > now() - interval '60 minutes'`;
  const diff = rows.filter((r) => r.current_min_price !== listed.get(r.external_id));
  console.log(JSON.stringify({ listedProducts: listed.size, checkedByCollectorLastHour: rows.length, same: rows.length - diff.length,
    different: diff.map((r) => ({ id: r.external_id, ours: r.current_min_price, list: listed.get(r.external_id), minAgo: Math.round((Date.now() - r.last_checked_at.getTime()) / 60_000) })) }, null, 1));
  await sql.end();
}
console.log(`Responses: ${OUT}`);
