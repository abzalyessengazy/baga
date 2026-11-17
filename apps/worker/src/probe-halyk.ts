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

/** Nuxt's page payload (`__NUXT_DATA__`, devalue's flat array) back to plain objects. */
export function nuxtData(html: string): Record<string, unknown> | null {
  const m = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  const arr = JSON.parse(m[1]!) as unknown[];
  const memo = new Map<number, unknown>();
  const WRAP = new Set(["Reactive", "ShallowReactive", "Ref", "ShallowRef", "EmptyRef", "EmptyShallowRef", "Set", "Map", "Date"]);
  const un = (i: unknown): unknown => {
    if (typeof i !== "number" || i < 0) return i === -1 ? null : i;
    if (memo.has(i)) return memo.get(i);
    const v = arr[i];
    if (Array.isArray(v)) {
      if (typeof v[0] === "string" && WRAP.has(v[0])) { const r = v.length > 1 ? un(v[1]) : null; memo.set(i, r); return r; }
      const r: unknown[] = []; memo.set(i, r); for (const x of v) r.push(un(x)); return r;
    }
    if (v && typeof v === "object") {
      const r: Record<string, unknown> = {}; memo.set(i, r);
      for (const [k, x] of Object.entries(v)) r[k] = un(x);
      return r;
    }
    memo.set(i, v); return v;
  };
  return (un(0) as { data?: Record<string, unknown> }).data ?? null;
}

type Item = { title: string; price: number | null; url: string; available?: boolean; offers?: number | null };

// Our category (Kaspi's leaf) → Halyk Market's category path (their category tree, 17 Nov 2026).
const CATS: Record<string, string> = {
  "Смартфоны": "smartfony", "Ноутбуки": "noutbuki", "Мониторы": "monitori", "Наушники": "naushniki", "Планшеты": "plansheti",
  "Смарт-часы": "smart-chasi", "Портативные колонки": "portativnyye-kolonki", "Мыши": "kompyuternie-mishi",
  "Клавиатуры": "klaviaturi", "Видеокарты": "videokarti", "Телевизоры": "televizori", "Игровые приставки": "igrovie-pristavki",
  "Фены": "feni", "Кофеварки и кофемашины": "kofevarki", "Пылесосы": "pilesosi", "Холодильники": "holodilniki",
  "Дроны и квадрокоптеры": "droni-i-kvadrokopteri", "Материнские платы": "materinskie-plati", "Фитнес-браслеты": "fitnes-braslety",
  "Объективы": "obektivi", "Системные блоки": "sistemnye-bloki", "Электрочайники и термопоты": "elektrochainiki",
  "Коляски": "detskie-kolyaski", "Док-станции и переходники": "dok-stantsii-dlya-noutbukov",
};
const COLOURS: Record<string, string[]> = {
  "черный": ["black", "midnight", "graphite", "space"], "белый": ["white", "starlight"], "серебристый": ["silver"],
  "серый": ["gray", "grey", "graphite", "titanium"], "темно-синий": ["deepblue", "navy", "darkblue", "deep"], "синий": ["blue"],
  "голубой": ["lightblue", "skyblue", "blue", "mist"], "оранжевый": ["orange", "cosmicorange"], "розовый": ["pink"],
  "фиолетовый": ["purple", "violet", "lavender"], "зеленый": ["green", "sage", "mint"], "желтый": ["yellow"], "красный": ["red"],
  "бордовый": ["burgundy", "bordeaux", "wine", "red"], "бежевый": ["beige"], "золотистый": ["gold"],
};
const STOP = new Set(["смартфон", "ноутбук", "монитор", "наушники", "планшет", "телевизор", "клавиатура", "мышь", "смарт", "часы",
  "фитнес", "браслет", "материнская", "плата", "игровой", "системный", "блок", "видеокарта", "with", "и", "для", "nanosim", "esim", "dual", "sim", "гб", "gb", "дюйм", "см"]);

/** Comparable tokens: lower case, Latin, memory as "256gb", Kaspi's "12 ГБ/256 ГБ" and Halyk's "12/256Gb" alike. */
export function tokens(title: string): Set<string> {
  let s = title.toLowerCase().replace(/ё/g, "е").replace(/(\d+)\s*(гб|gb)\s*\/\s*(\d+)\s*(гб|gb)/g, "$1/$3gb")
    .replace(/(\d+)\s*\/\s*(\d+)\s*(gb|гб)/g, "$1 $2gb").replace(/(\d+)\s*(гб|gb)\b/g, "$1gb").replace(/(\d+)\s*(тб|tb)\b/g, "$1tb")
    .replace(/1024gb/g, "1tb");
  const out = new Set<string>();
  for (const w of s.split(/[^a-zа-я0-9.]+/)) if (w && !STOP.has(w)) out.add(w.replace(/\.$/, ""));
  for (const [ru, en] of Object.entries(COLOURS)) if (out.has(ru)) { out.delete(ru); out.add(`colour:${en[0]}`); }
  for (const w of [...out]) for (const [, en] of Object.entries(COLOURS)) if (en.includes(w)) { out.delete(w); out.add(`colour:${en[0]}`); }
  return out;
}

/** 0..1: every model token of ours (digits or Latin) must be there; colour and the rest add or subtract. */
export function similarity(ours: string, theirs: string): { score: number; missing: string[] } {
  const a = tokens(ours), b = tokens(theirs);
  const key = [...a].filter((t) => /\d/.test(t) || /^[a-z]/.test(t)).filter((t) => !t.startsWith("colour:"));
  const missing = key.filter((t) => !b.has(t));
  const colourA = [...a].find((t) => t.startsWith("colour:")), colourB = [...b].find((t) => t.startsWith("colour:"));
  const colour = !colourA || !colourB ? 0.5 : colourA === colourB ? 1 : 0;
  const extra = [...b].filter((t) => (/\d/.test(t) || /^[a-z]/.test(t)) && !t.startsWith("colour:") && !a.has(t)).length;
  const score = key.length ? (1 - missing.length / key.length) * 0.8 + colour * 0.2 - Math.min(0.45, extra * 0.15) : 0;
  return { score: Math.round(score * 100) / 100, missing };
}

const listItems = (data: Record<string, unknown> | null): Item[] => {
  if (!data) return [];
  const out: Item[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith("category-products")) for (const it of ((v as { items?: Item[] }).items ?? [])) out.push({ title: it.title, price: it.price, url: it.url, available: it.available });
    if (k.startsWith("web-product-recommendations")) for (const it of (v as { name: string; url: string; city_offer?: { price?: number; merchant_offers?: unknown[] } }[]) ?? [])
      out.push({ title: it.name, price: it.city_offer?.price ?? null, url: `/category${it.url}`, offers: it.city_offer?.merchant_offers?.length ?? null });
  }
  return out;
};
const productOf = (data: Record<string, unknown> | null) => {
  const e = Object.entries(data ?? {}).find(([k]) => k.startsWith("web-product-page"));
  const p = (e?.[1] as { product?: { skuName: string; price: number | null; totalOffersCount: number | null; skuHasOffer: boolean } } | undefined)?.product;
  return p ? { title: p.skuName, price: p.price, offers: p.totalOffersCount, hasOffer: p.skuHasOffer } : null;
};

/**
 * Our most-tracked products (tmpdir/halyk/ours.json: external_id, title, cat, price) looked up on Halyk Market: the
 * brand's category page (popular, then cheapest and dearest first: only the first 12 are in the page, the rest come
 * from /api/, which robots.txt closes), then the best candidate's own page and its "similar products" (Halyk lists a
 * model's other colours and memory sizes there). At most 6 requests a product. Output: tmpdir/halyk/match.json.
 */
async function match() {
  const ours = JSON.parse((await import("node:fs")).readFileSync(join(OUT, "ours.json"), "utf8")) as { external_id: string; title: string; cat: string; price: number }[];
  const results = [];
  for (const o of ours) {
    const cat = CATS[o.cat];
    const words = o.title.split(/\s+/);
    const brand = words.find((w, i) => i > 0 && /^[A-Z]/.test(w)) ?? words[1] ?? "";
    if (!cat) { results.push({ ...o, result: "no Halyk category mapped" }); console.log(`skip ${o.external_id} ${o.cat}`); continue; }
    const seen = new Map<string, Item>();
    let best: { item: Item; score: number; missing: string[] } | null = null;
    const consider = (items: Item[]) => {
      for (const it of items) {
        const key = it.url.replace(/^\/category/, "");
        if (!seen.has(key)) seen.set(key, it);
        const s = similarity(o.title, it.title);
        if (!best || s.score > best.score) best = { item: it, ...s };
      }
    };
    for (const sort of ["popular-desc", "price-asc", "price-desc"]) {
      if (best && (best as { score: number }).score >= 0.95) break;
      const p = await get(`${BASE}/category/${cat}?sort=${sort}&f=brands:${encodeURIComponent(brand)}`);
      consider(listItems(nuxtData(p.body)));
    }
    let confirmed: ReturnType<typeof productOf> = null;
    for (let hop = 0; hop < 3 && best; hop++) {
      const b = best as { item: Item; score: number };
      const p = await get(new URL(b.item.url.startsWith("/category") ? b.item.url : `/category${b.item.url}`, BASE).toString());
      const data = nuxtData(p.body);
      const prod = productOf(data);
      const before = b.item.url;
      consider(listItems(data));
      if ((best as { item: Item }).item.url === before) { confirmed = prod; break; }
    }
    const b = best as { item: Item; score: number; missing: string[] } | null;
    const row = { external_id: o.external_id, ours: o.title, kaspi: o.price, halyk: b?.item.title ?? null, url: b?.item.url ?? null,
      score: b?.score ?? 0, missing: b?.missing ?? [], halykPrice: confirmed?.price ?? b?.item.price ?? null,
      offers: confirmed?.offers ?? b?.item.offers ?? null, confirmedOnPage: !!confirmed, candidates: seen.size };
    results.push(row);
    console.log(`${row.score.toFixed(2)} ${o.external_id} ${o.title.slice(0, 50)} → ${row.halyk?.slice(0, 50)} ${row.halykPrice} vs ${o.price}`);
    writeFileSync(join(OUT, "match.json"), JSON.stringify(results, null, 1));
  }
}

// Kaspi's Russian colour → the English names Halyk Market uses for phones (Apple's and Samsung's own names included).
const PHONE_COLOURS: Record<string, string[]> = {
  "черный": ["black", "midnight", "space black", "titanium black", "jet black", "graphite"], "белый": ["white", "starlight", "cloud white", "titanium white"],
  "серебристый": ["silver", "titanium silver", "silver shadow"], "серый": ["gray", "grey", "titanium gray", "titanium grey"],
  "темно-синий": ["deep blue", "navy", "dark blue", "titanium blue"], "синий": ["blue", "ultramarine", "icy blue", "ice blue"],
  "голубой": ["light blue", "sky blue", "mist blue", "blue"], "оранжевый": ["cosmic orange", "orange"], "розовый": ["pink"],
  "фиолетовый": ["purple", "violet", "lavender", "light violet"], "зеленый": ["green", "sage", "teal", "mint"], "желтый": ["yellow"],
  "бордовый": ["burgundy", "cosmic burgundy", "wine"], "бежевый": ["beige", "sand"], "золотистый": ["gold", "desert"],
};

type Option = { name: string; url: string; current: boolean; available: boolean };
/** A product page's variant pickers: {"Цвет": [...], "Объем памяти": [...]}, each option with its own link. */
export function variantPickers(data: Record<string, unknown> | null): Record<string, Option[]> {
  const out: Record<string, Option[]> = {};
  const walk = (o: unknown, depth: number) => {
    if (!o || typeof o !== "object" || depth > 10) return;
    if (Array.isArray(o)) { for (const x of o) walk(x, depth + 1); return; }
    const r = o as { name?: unknown; values?: unknown };
    if (typeof r.name === "string" && Array.isArray(r.values) && r.values.every((v) => v && typeof v === "object" && "url" in (v as object))) {
      out[r.name] = (r.values as Option[]).map((v) => ({ name: String(v.name), url: String(v.url), current: !!v.current, available: !!v.available }));
      return;
    }
    for (const v of Object.values(o)) walk(v, depth + 1);
  };
  for (const [k, v] of Object.entries(data ?? {})) if (k.startsWith("web-product-page")) walk(v, 0);
  return out;
}

/** Our phone as Halyk would name it: the model words, memory ("256gb", Samsung's "12/256" as "256gb") and colour. */
export function phoneKey(title: string) {
  const t = title.toLowerCase().replace(/ё/g, "е");
  const colour = Object.keys(PHONE_COLOURS).filter((c) => t.includes(c)).sort((a, b) => b.length - a.length)[0] ?? null;
  const mem = t.match(/(\d+)\s*(gb|гб|tb|тб)\s*(?:nanosim|dual|esim|$|\s)/g)?.pop() ?? t.match(/(\d+)\s*(gb|гб|tb|тб)/g)?.pop() ?? null;
  const memory = mem ? mem.replace(/\s*(nanosim|dual|esim).*/, "").replace(/\s+/g, "").replace("гб", "gb").replace("тб", "tb").replace(/^1024gb$/, "1tb") : null;
  const esimOnly = /dual\s*esim|esim\s*only/.test(t) && !/nanosim/.test(t);
  const model = t.replace(/^смартфон\s+/, "").replace(/\d+\s*(gb|гб|tb|тб)[\s\S]*$/, "").replace(/\s+\d+\s*\/\s*$/, "").trim();
  return { model, memory, colour, esimOnly };
}

const sameModel = (ours: string, theirs: string, esimOnly: boolean) => {
  if (theirs.includes(" + ")) return false; // a bundle (phone + earphones + charger) is not the phone
  const t = theirs.toLowerCase().replace(/^смартфон\s+/, "").replace(/\s+\d+\/?\d*\s*(gb|tb)[\s\S]*$/i, "").replace(/\s+\d+\/\d+gb[\s\S]*$/i, "").trim();
  const tm = t.replace(/\besim\b/, "").replace(/\s+/g, " ").trim();
  return tm === ours.replace(/\s+/g, " ").trim() && /\besim\b/.test(t) === esimOnly;
};

/**
 * Phones only (tmpdir/halyk/phones.json): find the model's page on Halyk Market (the brand's phone list, then
 * "similar products"), then step to the exact memory and colour through the page's own variant links. Halyk lists
 * eSIM-only iPhones as their own models; a Kaspi «Dual eSim» phone is matched only to those. Output: phones.json.
 */
async function phones() {
  const fs = await import("node:fs");
  const ours = JSON.parse(fs.readFileSync(join(OUT, "phones.json"), "utf8")) as { external_id: string; title: string; price: number; n: number }[];
  const seen = new Map<string, Item>(); // every phone listing met, by URL without ?sku
  const listed = new Set<string>();
  const add = (items: Item[]) => { for (const it of items) seen.set(it.url.replace(/^\/category/, "").split("?")[0]!, it); };
  const pageData = async (path: string) => {
    // Variant links are /p/<cat>/<model>/<variant>; the page lives at /category/<cat>/<model>?sku=<variant> (the other
    // form answers 301 there, and we do not follow redirects).
    const v = path.match(/^\/p\/([^/]+)\/([^/?]+)\/([^/?]+)$/);
    const url = new URL(v ? `/category/${v[1]}/${v[2]}?sku=${v[3]}` : path.startsWith("/category") ? path : `/category${path}`, BASE).toString();
    const p = await get(url);
    const data = nuxtData(p.body);
    add(listItems(data));
    return data;
  };
  const results = [];
  for (const o of ours) {
    const k = phoneKey(o.title);
    const brand = k.model.split(" ")[0]!;
    if (!listed.has(brand)) {
      for (const sort of ["popular-desc", "price-desc", "price-asc"]) {
        const p = await get(`${BASE}/category/smartfony?sort=${sort}&f=brands:${encodeURIComponent(brand.charAt(0).toUpperCase() + brand.slice(1))}`);
        add(listItems(nuxtData(p.body)));
      }
      listed.add(brand);
    }
    const findFamily = () => [...seen.values()].find((it) => sameModel(k.model, it.title, k.esimOnly));
    let fam = findFamily();
    // Not in the lists: the nearest model's "similar products" (Halyk shows the same line there), up to two hops.
    for (let hop = 0; hop < 2 && !fam; hop++) {
      const near = [...seen.values()].map((it) => ({ it, s: similarity(o.title, it.title).score })).sort((a, b) => b.s - a.s)[0];
      if (!near || near.s < 0.4) break;
      await pageData(near.it.url);
      fam = findFamily();
    }
    let row: Record<string, unknown> = { external_id: o.external_id, ours: o.title, kaspi: o.price, tracked: o.n, model: k.model, memory: k.memory, colour: k.colour };
    if (!fam) { results.push({ ...row, result: "model not found" }); console.log(`--   ${o.title.slice(0, 60)}: model not found`); fs.writeFileSync(join(OUT, "phones-match.json"), JSON.stringify(results, null, 1)); continue; }
    let data = await pageData(fam.url);
    let pick = variantPickers(data);
    const memKey = Object.keys(pick).find((n) => /памят|объем/i.test(n));
    if (memKey && k.memory) {
      const m = pick[memKey]!.find((x) => x.name.toLowerCase().replace(/\s+/g, "").endsWith(k.memory!.replace(/^(\d+)(gb|tb)$/, "$1$2")) || x.url.includes(`/${k.memory}_`) || x.url.endsWith(`/${k.memory}`));
      if (!m) { results.push({ ...row, result: "memory not sold", halykModel: fam.title }); console.log(`mem  ${o.title.slice(0, 60)}: no ${k.memory}`); continue; }
      if (!m.current) { data = await pageData(m.url); pick = variantPickers(data); }
    }
    const colKey = Object.keys(pick).find((n) => /цвет/i.test(n));
    if (colKey && k.colour) {
      const names = PHONE_COLOURS[k.colour] ?? [];
      const opts = pick[colKey]!;
      const c = names.map((nm) => opts.find((x) => x.name.toLowerCase() === nm)).find(Boolean) ?? names.map((nm) => opts.find((x) => x.name.toLowerCase().includes(nm))).find(Boolean);
      if (!c) { results.push({ ...row, result: "colour not sold", colours: opts.map((x) => x.name), halykModel: fam.title }); console.log(`col  ${o.title.slice(0, 60)}: ${opts.map((x) => x.name).join(", ")}`); continue; }
      if (!c.current) { data = await pageData(c.url); pick = variantPickers(data); }
    }
    const prod = productOf(data);
    row = { ...row, result: prod?.hasOffer ? "exact" : "exact, no offers now", halyk: prod?.title, halykPrice: prod?.price ?? null, offers: prod?.offers ?? null,
      diff: prod?.price ? prod.price - o.price : null };
    results.push(row);
    console.log(`ok   ${o.title.slice(0, 55)} → ${prod?.title} ${prod?.price} (${prod?.offers}) vs ${o.price}`);
    fs.writeFileSync(join(OUT, "phones-match.json"), JSON.stringify(results, null, 1));
  }
  fs.writeFileSync(join(OUT, "phones-match.json"), JSON.stringify(results, null, 1));
}

const step = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "look";
// Only when run as the probe, never when a test or script imports its helpers.
if (process.argv[1]?.endsWith("probe-halyk.ts")) (step === "look" ? look() : step === "page" ? page() : step === "match" ? match() : step === "phones" ? phones() : Promise.reject(new Error(`unknown step ${step}`)))
  .catch((e) => { console.error(e instanceof Stop ? `STOP: ${e.message}` : e); process.exitCode = e instanceof Stop ? 0 : 1; })
  .finally(() => console.log(JSON.stringify({ requests, out: OUT })));
