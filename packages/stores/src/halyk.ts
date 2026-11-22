/**
 * Halyk Market (halykmarket.kz), the fourth price source, phones first (DECISIONS.md 2026-11-17 "Halyk Market,
 * display only"; CLAUDE.md rule 6a). Only what its robots.txt allows (it closes /api/, /cms/, /profile, /checkout,
 * /login): category pages and product pages. One request at a time, ≥10 s apart, the honest User-Agent, no cookies.
 *
 * A page carries its data as Nuxt's payload (`__NUXT_DATA__`): a product page has the lowest price, the number of
 * sellers and the variant pickers (memory, colour), each option with its own link; a category page has its first 12
 * products. Halyk's list of individual sellers comes from /api/, so we never read it: we show "from X, N sellers".
 */
import { StoreRequestRefused } from "./technodom";

export const HALYK = {
  code: "halyk",
  base: "https://halykmarket.kz",
  /** A product page: `/category/<category>/<model>?sku=<variant>` (store_slug holds what follows /category/). */
  productUrl: (slug: string) => `https://halykmarket.kz/category/${slug}`,
  phoneList: (brand: string, sort: "popular-desc" | "price-asc" | "price-desc") =>
    `https://halykmarket.kz/category/smartfony?sort=${sort}&f=brands:${encodeURIComponent(brand)}`,
  categoryList: (category: string, brand: string, sort: "popular-desc" | "price-asc" | "price-desc") =>
    `https://halykmarket.kz/category/${category}?sort=${sort}&f=brands:${encodeURIComponent(brand)}`,
  /** Kaspi's leaf category → Halyk Market's (its category tree, 17 Nov 2026), for the matching by model code. */
  codeCategories: { "Мониторы": "monitori", "Ноутбуки": "noutbuki", "Наушники": "naushniki", "Планшеты": "plansheti" } as Record<string, string>,
} as const;

export class HalykHttpError extends Error {
  constructor(public status: number, public url: string) { super(`Halyk Market answered ${status} for ${url}`); this.name = "HalykHttpError"; }
  get isBlocked() { return this.status === 403 || this.status === 429; }
  get isGone() { return this.status === 404 || this.status === 410; }
}
export class HalykParseError extends Error {
  constructor(message: string) { super(message); this.name = "HalykParseError"; }
}

/** Nuxt's payload (devalue's flat array) back to plain objects: the page's `data`. */
export function nuxtData(html: string): Record<string, unknown> {
  const m = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new HalykParseError("no __NUXT_DATA__");
  let arr: unknown[];
  try { arr = JSON.parse(m[1]!) as unknown[]; } catch { throw new HalykParseError("__NUXT_DATA__ is not JSON"); }
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
  const data = (un(0) as { data?: Record<string, unknown> } | null)?.data;
  if (!data || typeof data !== "object") throw new HalykParseError("no data in the payload");
  return data;
}

export interface HalykListItem { title: string; price: number | null; url: string }
/** Products a page lists: a category page's first 12 and a product page's "similar products". URLs as /category/…. */
export function listItems(data: Record<string, unknown>): HalykListItem[] {
  const out: HalykListItem[] = [];
  const tenge = (v: unknown) => (typeof v === "number" && v > 0 ? Math.round(v) : null);
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith("category-products")) {
      for (const it of ((v as { items?: { title: string; price: number; url: string }[] }).items ?? [])) {
        if (typeof it?.title === "string" && typeof it.url === "string") out.push({ title: it.title, price: tenge(it.price), url: it.url });
      }
    }
    if (k.startsWith("web-product-recommendations") && Array.isArray(v)) {
      for (const it of v as { name: string; url: string; city_offer?: { price?: number } }[]) {
        if (typeof it?.name === "string" && typeof it.url === "string") out.push({ title: it.name, price: tenge(it.city_offer?.price), url: `/category${it.url}` });
      }
    }
  }
  return out;
}

export interface HalykProduct {
  /** Halyk's id of this exact variant. */
  skuId: string;
  title: string;
  /** The lowest price among its sellers, integer tenge; null when nobody sells it now. Never adjusted. */
  price: number | null;
  offers: number | null;
  inStock: boolean;
}
export function parseHalykProduct(data: Record<string, unknown>): HalykProduct {
  const e = Object.entries(data).find(([k]) => k.startsWith("web-product-page"));
  const p = (e?.[1] as { product?: Record<string, unknown> } | undefined)?.product;
  if (!p || typeof p.skuName !== "string" || (typeof p.skuId !== "number" && typeof p.skuId !== "string")) throw new HalykParseError("no product with skuId and skuName");
  const price = typeof p.price === "number" && p.price > 0 ? Math.round(p.price) : null;
  const offers = typeof p.totalOffersCount === "number" ? p.totalOffersCount : null;
  return { skuId: String(p.skuId), title: p.skuName.replace(/\s+/g, " ").trim(), price, offers, inStock: p.skuHasOffer === true && price !== null };
}

export interface HalykOption { name: string; url: string; current: boolean }
/** The variant pickers of a product page: {"Объем памяти": [...], "Цвет": [...]}, each option with its link. */
export function variantPickers(data: Record<string, unknown>): Record<string, HalykOption[]> {
  const out: Record<string, HalykOption[]> = {};
  const walk = (o: unknown, depth: number) => {
    if (!o || typeof o !== "object" || depth > 10) return;
    if (Array.isArray(o)) { for (const x of o) walk(x, depth + 1); return; }
    const r = o as { name?: unknown; values?: unknown };
    if (typeof r.name === "string" && Array.isArray(r.values) && r.values.length && r.values.every((v) => v && typeof v === "object" && "url" in (v as object))) {
      out[r.name] = (r.values as { name: unknown; url: unknown; current: unknown }[]).map((v) => ({ name: String(v.name), url: String(v.url), current: v.current === true }));
      return;
    }
    for (const v of Object.values(o)) walk(v, depth + 1);
  };
  for (const [k, v] of Object.entries(data)) if (k.startsWith("web-product-page")) walk(v, 0);
  return out;
}

/** A variant link (/p/<cat>/<model>/<variant>) as the page address Halyk serves (/category/<cat>/<model>?sku=<variant>). */
export function pagePath(url: string): string {
  // /p/<cat>/<model>/<variant> and /category/<cat>/<model>/<variant>?sku=… (the "similar products" form) both answer
  // 301; the page lives at /category/<cat>/<model>?sku=<variant> (17 Nov: the first run failed on them).
  const v = url.match(/^\/(?:p|category)\/([^/?]+)\/([^/?]+)\/([^/?]+)(?:\?.*)?$/);
  if (v) return `/category/${v[1]}/${v[2]}?sku=${v[3]}`;
  return url.startsWith("/category/") ? url : `/category${url.startsWith("/") ? "" : "/"}${url}`;
}

// Kaspi's Russian colour → the English names Halyk uses for phones (Apple's and Samsung's own names included).
const COLOURS: Record<string, string[]> = {
  "черный": ["black", "midnight", "space black", "titanium black", "jet black", "graphite"],
  "белый": ["white", "starlight", "cloud white", "titanium white", "star white"],
  "серебристый": ["silver", "titanium silver", "silver shadow"], "серый": ["gray", "grey", "titanium gray", "titanium grey"],
  "темно-синий": ["deep blue", "navy", "dark blue", "titanium blue"], "синий": ["blue", "ultramarine", "icy blue", "ice blue"],
  "голубой": ["light blue", "sky blue", "mist blue"], "оранжевый": ["cosmic orange", "orange"], "розовый": ["pink"],
  "фиолетовый": ["purple", "violet", "lavender", "light violet"], "зеленый": ["green", "sage", "teal", "mint"], "желтый": ["yellow"],
  "бордовый": ["burgundy", "cosmic burgundy", "wine"], "бежевый": ["beige", "sand"], "золотистый": ["gold", "desert"],
};

export interface PhoneKey {
  /** Model words, lower case: "apple iphone 17 pro max". */
  model: string;
  /** "256gb", "1tb" (Kaspi's "12 ГБ/256 ГБ" → "256gb", "1024Gb" → "1tb"). */
  memory: string | null;
  colour: string | null;
  /** Kaspi «Dual eSim» (no physical SIM): Halyk lists those as their own "eSim" models. */
  esimOnly: boolean;
  /** Kaspi «Dual Sim» (two physical SIMs): a version Halyk does not name, so never matched as the same phone. */
  dualSim: boolean;
}
export function phoneKey(title: string): PhoneKey {
  const t = title.toLowerCase().replace(/ё/g, "е");
  const colour = Object.keys(COLOURS).filter((c) => t.includes(c)).sort((a, b) => b.length - a.length)[0] ?? null;
  const mems = [...t.matchAll(/(\d+)\s*(gb|гб|tb|тб)/g)].map((m) => `${m[1]}${m[2] === "tb" || m[2] === "тб" ? "tb" : "gb"}`);
  const last = mems.pop() ?? null;
  const memory = last === "1024gb" ? "1tb" : last;
  const esimOnly = /dual\s*esim/.test(t) && !/nanosim/.test(t);
  const dualSim = /dual\s*sim/.test(t);
  const model = t.replace(/^смартфон\s+/, "").replace(/\s*\d+\s*(gb|гб|tb|тб)[\s\S]*$/, "").replace(/\s+\d+\s*$/, "").replace(/\s+/g, " ").trim();
  return { model, memory, colour, esimOnly, dualSim };
}

/** Halyk's title names exactly our model (and SIM kind): "Смартфон Apple iPhone 17 Pro Max 256Gb Silver". */
export function sameModel(k: PhoneKey, halykTitle: string): boolean {
  if (halykTitle.includes(" + ")) return false; // a bundle (phone + earphones + charger) is not the phone
  const t = halykTitle.toLowerCase().replace(/^смартфон\s+/, "").replace(/\s+\d+(\/\d+)?\s*(gb|tb)[\s\S]*$/i, "").replace(/\s+/g, " ").trim();
  const esim = /\besim\b/.test(t);
  const words = (s: string) => s.replace(/^(xiaomi|poco)\s+(?=(redmi|poco)\b)/, "");
  return words(t.replace(/\besim\b/, "").replace(/\s+/g, " ").trim()) === words(k.model) && esim === k.esimOnly;
}

/**
 * The manufacturer's model codes in a title: words with both letters and digits, 5+ characters (83S000HPRK,
 * XT2769VD, LS24F330EAIXCI, 90NR0JF7-M00JD0, WF-1000XM6), upper case without dots, dashes or slashes. Memory and
 * sizes (16GB, 512Гб, 27", 1TB, M5) are not codes.
 */
export function modelCodes(title: string): string[] {
  const out = new Set<string>();
  for (const raw of title.split(/[\s,()]+/)) {
    const w = raw.replace(/^[^0-9a-z]+|[^0-9a-z]+$/gi, "");
    const c = w.toUpperCase().replace(/[./-]/g, "");
    if (c.length < 5 || !/[A-Z]/.test(c) || !/\d/.test(c) || /[А-ЯЁ]/i.test(w)) continue;
    if (/^\d+(GB|TB|MB|HZ|MAH|W|MM|CM)$/.test(c)) continue;
    // 23 Nov 2026 audit: a processor (i5-1335U, 7840HS) is shared by many laptops, and a line name with one digit
    // (BUDS3) by its Pro and FE: neither is a part number (an IdeaPad had matched a Vivobook on «I51335U»).
    if (/^I[3579]\d{4,5}[A-Z]{0,2}$/.test(c) || /^\d{4,5}[A-Z]{1,3}$/.test(c) || /^[A-Z]+\d$/.test(c)) continue;
    out.add(c);
  }
  return [...out];
}
/**
 * The code that decides a match: the last one in the title, the part number (a laptop's "15ARP10E" is a series that
 * several configurations share; its "83S000HPRK" is one of them).
 */
export const partNumber = (title: string): string | null => modelCodes(title).at(-1) ?? null;
/**
 * Halyk's title carries our part number as a whole word. A code ending in a digit may carry a region suffix there
 * (Apple's MDH74 → MDH74RU/A); a code ending in a letter must match exactly (XT2769VD is not XT2769VDX).
 */
export function sameCode(code: string, halykTitle: string): boolean {
  const t = halykTitle.toUpperCase().replace(/[./-]/g, "");
  const suffix = /\d$/.test(code) ? "(?:[A-Z]{1,3})?" : "";
  return new RegExp(`(^|[^A-Z0-9])${code}${suffix}([^A-Z0-9]|$)`).test(t);
}
/** The brand in a Kaspi title: its first Latin word (after the category word), not a size. */
export function brandOf(title: string): string | null {
  for (const w of title.split(/\s+/)) if (/^[A-Za-z][A-Za-z0-9-]{1,}$/.test(w)) return w;
  return null;
}

const XIAOMI = new Set(["xiaomi", "redmi", "poco"]);
/** Line words that make another model when only one title has them (23 Nov 2026 audit: Buds3 Pro ≠ Buds3 FE). */
const LINE_WORDS = ["pro", "max", "plus", "ultra", "mini", "lite", "fe", "air", "neo", "edge", "slim", "se", "active", "note",
  "turbo", "detect", "play", "redmi", "poco"];
// «Mini LED» is a screen type, not the Mini model («MiniLED» on Kaspi).
const latin = (s: string) => new Set(s.toLowerCase().replace(/mini[\s-]*led/g, "miniled").replace(/([a-z0-9])\+(?![a-z0-9])/g, "$1 plus").split(/[^a-z0-9]+/).filter(Boolean));
/** The colours a title names, as Kaspi's Russian keys: Russian words first, else Halyk's English names. */
export function titleColours(title: string): Set<string> {
  const t = title.toLowerCase().replace(/ё/g, "е").replace(/сиренев|лилов/g, "фиолетов");
  const ru = Object.keys(COLOURS).filter((c) => t.includes(c));
  const keys = ru.filter((c) => !ru.some((o) => o !== c && o.includes(c)));
  if (keys.length) return new Set(keys);
  const names = Object.entries(COLOURS).flatMap(([k, v]) => v.map((n) => [n, k] as const)).sort((a, b) => b[0].length - a[0].length);
  for (const [n, k] of names) if (new RegExp(`(^|[^a-z])${n}([^a-z]|$)`).test(t)) return new Set([k]);
  return new Set();
}
/** RAM and storage in GB from "8 ГБ/256 ГБ", "6/256Gb", "256Gb", "1 ТБ". */
export function titleMemoryGb(title: string): { ram: number | null; storage: number | null } {
  const t = title.toLowerCase();
  const gb = (n: string, u?: string) => +n * (u && /t|т/.test(u) ? 1024 : 1);
  // The RAM number stands alone («N150 / 16 Гб» is a processor, then RAM, not 50/16).
  const two = t.match(/(?<![a-zа-я0-9.])(\d{1,2})\s*(?:гб|gb)?\s*\/\s*(\d{2,4})\s*(гб|gb|тб|tb)/);
  if (two) return { ram: +two[1]!, storage: gb(two[2]!, two[3]) };
  const one = [...t.matchAll(/(\d{1,4})\s*(гб|gb|тб|tb)(?![a-zа-я])/g)].pop();
  return { ram: null, storage: one ? gb(one[1]!, one[2]) : null };
}
/**
 * Why Halyk's item is not our Kaspi product, or null (23 Nov 2026 audit). Run when a pair is made and on every pricing:
 * a bundle; another brand; a line word on one side only (Pro, FE, Active…); RAM or storage that differ when both state
 * them; another colour («colour differs», shown at most as «похожий»).
 */
export function halykMismatch(kaspiTitle: string, halykTitle: string): string | null {
  if (halykTitle.includes(" + ")) return "bundle";
  const k = latin(kaspiTitle), h = latin(halykTitle);
  const brand = brandOf(kaspiTitle)?.toLowerCase();
  // Halyk sometimes leaves the brand out («XT2760S 27 QHD…»): then our part number in its title stands for it.
  const code = partNumber(kaspiTitle);
  if (brand && !h.has(brand) && !(XIAOMI.has(brand) && [...XIAOMI].some((b) => h.has(b))) && !(code && sameCode(code, halykTitle)))
    return "brand differs";
  for (const w of LINE_WORDS) if (k.has(w) !== h.has(w)) return `variant ${w}`;
  const a = titleMemoryGb(kaspiTitle), b = titleMemoryGb(halykTitle);
  if (a.ram && b.ram && a.ram !== b.ram) return "ram differs";
  if (a.storage && b.storage && a.storage !== b.storage) return "storage differs";
  const ca = titleColours(kaspiTitle), cb = titleColours(halykTitle);
  if (ca.size && cb.size && ![...cb].some((c) => ca.has(c))) return "colour differs";
  return null;
}

/** The option for our memory or colour, or null when Halyk does not sell it. */
export function pickMemory(options: HalykOption[], memory: string): HalykOption | null {
  return options.find((o) => o.name.toLowerCase().replace(/\s+/g, "").replace(/^\d+\//, "") === memory) ?? null;
}
export function pickColour(options: HalykOption[], colour: string): HalykOption | null {
  const names = COLOURS[colour] ?? [];
  for (const n of names) { const o = options.find((x) => x.name.toLowerCase() === n); if (o) return o; }
  return null;
}

export interface HalykClientOptions {
  minIntervalMs?: number; timeoutMs?: number; userAgent?: string;
  beforeRequest?: () => void | Promise<void>;
  fetch?: typeof fetch;
}
/** One request at a time, ≥ minIntervalMs apart; never a path robots.txt closes; non-2xx throws HalykHttpError. */
export function createHalykClient(o: HalykClientOptions = {}) {
  const f = o.fetch ?? fetch;
  const ua = o.userAgent ?? process.env.KASPI_USER_AGENT ?? "BAGA price history bot (+contact: hello@bagaapp.com)";
  const minIntervalMs = o.minIntervalMs ?? 10_000, timeoutMs = o.timeoutMs ?? 30_000;
  let nextAt = 0;
  let queue: Promise<void> = Promise.resolve();
  const gate = () => {
    const turn = queue.then(async () => {
      const wait = nextAt - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      nextAt = Date.now() + minIntervalMs;
    });
    queue = turn.catch(() => {});
    return turn;
  };
  async function page(url: string): Promise<Record<string, unknown>> {
    const u = new URL(url);
    if (u.host !== "halykmarket.kz" || /^\/(api|cms|profile|checkout|login)(\/|$)/.test(u.pathname)) throw new StoreRequestRefused(`not allowed: ${url}`);
    await gate();
    await o.beforeRequest?.();
    const res = await f(url, { headers: { "User-Agent": ua, Accept: "text/html", "Accept-Language": "ru-RU,ru;q=0.9" }, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    if (res.status < 200 || res.status >= 300) { await res.body?.cancel().catch(() => undefined); throw new HalykHttpError(res.status, url); }
    return nuxtData(await res.text());
  }
  return {
    page,
    product: async (slug: string) => { const d = await page(HALYK.productUrl(slug)); return { product: parseHalykProduct(d), data: d }; },
    phoneList: async (brand: string, sort: "popular-desc" | "price-asc" | "price-desc") => listItems(await page(HALYK.phoneList(brand, sort))),
  };
}
export type HalykClient = ReturnType<typeof createHalykClient>;
