/**
 * Halyk Market probe, step 0 of docs/ROADMAP_BEYOND_KASPI.md (the owner, 17 Nov 2026: «Halyk first, start the
 * probes»). Research only: nothing is written to the database and nothing is shown on the site.
 *
 * Rules (CLAUDE.md 6a): halykmarket.kz/robots.txt is read first and obeyed (on 17 Nov it disallows /api/, /cms/,
 * /profile, /checkout, /login; no Crawl-delay); one request at a time, ≥11 s apart; the same honest User-Agent as
 * our other bots; never inside Kaspi's collector minutes (store window only); the first 403/429 stops the probe; no
 * cookies, no login, no browser imitation; only the sitemaps and product pages.
 *
 *   pnpm --filter @baga/worker probe:halyk look        robots, sitemap index, 2 product sitemaps, 6 product pages
 *   pnpm --filter @baga/worker probe:halyk --dry ...   prints the plan, sends nothing
 * Output: tmpdir/halyk/ (raw pages and sitemaps) and a summary per page: what a product page carries (price,
 * sellers, barcode/GTIN, model code, structured data).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isInStoreWindow } from "@baga/core";

const BASE = "https://halykmarket.kz";
const SPACING_MS = 11_000;
const ua = process.env.KASPI_USER_AGENT ?? "BAGA price history bot (+contact: hello@bagaapp.com)";
const OUT = join(tmpdir(), "halyk");
const DRY = process.argv.includes("--dry");
const DISALLOWED = ["/api/", "/cms/", "/profile", "/checkout", "/login"];

let last = 0;
let requests = 0;
class Stop extends Error {}

async function get(url: string): Promise<{ status: number; body: string; type: string }> {
  const path = new URL(url).pathname;
  if (new URL(url).host !== "halykmarket.kz") throw new Stop(`not Halyk Market: ${url}`);
  if (DISALLOWED.some((d) => path.startsWith(d))) throw new Stop(`robots.txt disallows ${path}`);
  if (!isInStoreWindow(new Date(), 60_000)) throw new Stop("inside Kaspi's collector minutes");
  const wait = last + SPACING_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  if (DRY) { console.log(`would GET ${url}`); return { status: 0, body: "", type: "" }; }
  requests++;
  const res = await fetch(url, { headers: { "User-Agent": ua, Accept: "text/html,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "ru-RU,ru;q=0.9" }, redirect: "manual", signal: AbortSignal.timeout(30_000) });
  const body = await res.text();
  console.log(`${res.status} ${url} (${body.length} bytes)`);
  if (res.status === 403 || res.status === 429) throw new Stop(`${res.status} on ${url}: probe stopped (rule 6a)`);
  return { status: res.status, body, type: res.headers.get("content-type") ?? "" };
}

const locs = (xml: string) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]!.replace(/&amp;/g, "&"));

/** What a product page carries, read without running its scripts. */
export function describePage(html: string) {
  const ld = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]!.trim());
  const ldText = ld.join("\n");
  const pick = (re: RegExp, s = html) => s.match(re)?.[1] ?? null;
  const prices = [...html.matchAll(/"(?:price|minPrice|salePrice|finalPrice)"\s*:\s*"?(\d{3,9})/g)].map((m) => Number(m[1]));
  return {
    title: pick(/<title>([^<]{0,200})<\/title>/i),
    jsonLd: ld.length,
    ldProduct: /"@type"\s*:\s*"Product"/.test(ldText),
    ldPrice: pick(/"price"\s*:\s*"?([\d.]+)/, ldText),
    gtin: pick(/"gtin(?:13|8|12|14)?"\s*:\s*"?(\d{8,14})/) ?? pick(/(?:штрихкод|штрих-код|barcode|EAN)[^0-9]{0,40}(\d{8,14})/i),
    mpn: pick(/"mpn"\s*:\s*"([^"]{2,60})"/),
    sku: pick(/"sku"\s*:\s*"([^"]{1,60})"/),
    brand: pick(/"brand"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]{1,60})"/),
    nextData: html.includes("__NEXT_DATA__"),
    nuxt: /__NUXT__|window\.__INITIAL_STATE__/.test(html),
    pricesInPage: [...new Set(prices)].slice(0, 12),
    sellersHint: (html.match(/merchant|продав/gi) ?? []).length,
    tenge: (html.match(/₸|&#8376;|тг\b/g) ?? []).length,
  };
}

async function look() {
  mkdirSync(OUT, { recursive: true });
  const robots = await get(`${BASE}/robots.txt`);
  writeFileSync(join(OUT, "robots.txt"), robots.body);
  if (!DRY && /Crawl-delay/i.test(robots.body)) console.log("robots.txt now sets a Crawl-delay: check SPACING_MS before going on");
  const index = await get(`${BASE}/sitemap-service/sitemap.xml`);
  writeFileSync(join(OUT, "sitemap.xml"), index.body);
  const maps = locs(index.body);
  const products = maps.filter((u) => /products-\d+\.xml$/.test(u));
  console.log(`sitemap index: ${maps.length} sitemaps, ${products.length} of them product sitemaps`);
  const sample = DRY ? [] : [products[0], products[Math.floor(products.length / 2)]].filter(Boolean) as string[];
  const pages: string[] = [];
  for (const [i, m] of sample.entries()) {
    const sm = await get(m);
    writeFileSync(join(OUT, `products-sample-${i}.xml`), sm.body);
    const urls = locs(sm.body);
    console.log(`${m}: ${urls.length} URLs, e.g. ${urls.slice(0, 3).join("  ")}`);
    // Electronics first, our core; otherwise the first ones.
    const pref = urls.filter((u) => /smartfon|iphone|samsung|noutbuk|televizor|naushnik|planshet/i.test(u));
    pages.push(...(pref.length ? pref : urls).slice(0, 3));
  }
  const report = [];
  for (const [i, u] of pages.entries()) {
    const p = await get(u);
    writeFileSync(join(OUT, `page-${i}.html`), p.body);
    report.push({ url: u, status: p.status, type: p.type, bytes: p.body.length, ...describePage(p.body) });
  }
  writeFileSync(join(OUT, "look.json"), JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report, null, 1));
}

/** One product page, saved as page-<name>.html: `page <path> <name>`. */
async function page() {
  const [, path, name] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!path || !name || !/^[\w-]+$/.test(name)) throw new Error("usage: page <path> <name>");
  mkdirSync(OUT, { recursive: true });
  const p = await get(new URL(path, BASE).toString());
  writeFileSync(join(OUT, `page-${name}.html`), p.body);
  console.log(JSON.stringify({ status: p.status, bytes: p.body.length, ...describePage(p.body) }, null, 1));
}

const step = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "look";
(step === "look" ? look() : step === "page" ? page() : Promise.reject(new Error(`unknown step ${step}`)))
  .catch((e) => { console.error(e instanceof Stop ? `STOP: ${e.message}` : e); process.exitCode = e instanceof Stop ? 0 : 1; })
  .finally(() => console.log(JSON.stringify({ requests, out: OUT })));
