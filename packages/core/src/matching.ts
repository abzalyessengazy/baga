/**
 * Exact product matching between a Kaspi title and another store's item (DECISIONS.md, 2026-11-07 "Technodom as a
 * second price source"). Strict on purpose: a wrong pair would show a price for a different product, so every rule
 * must hold. Tuned on 7 Nov 2026 test requests (74 candidates, 65 verified, 9 rejected).
 * - every Latin/number token of the Kaspi title (brand, model) appears in the store item's tokens;
 * - the store item has no variant word the Kaspi title lacks (Pro, Max, Plus, Ultra, Play, 2…): Pro ≠ Pro Max;
 * - memory sizes agree (storage, and RAM when both state it): 6/128 ≠ 8/128;
 * - colours agree when both state one: a white item is never a blue item's match;
 * - the Kaspi title must carry a model number (a bare "Apple iPhone прозрачный" is a case, not a phone).
 * Store item tokens come from its address (slug) and, once fetched, its own title.
 */

const COLORS: [RegExp, string[]][] = [
  [/темно-син|тёмно-син/, ["deep", "navy", "dark-blue"]],
  [/голуб/, ["light-blue", "sky", "goluboy"]],
  [/бирюз/, ["teal", "turquoise", "biryuzovyy"]],
  [/син/, ["blue", "siniy", "sinyaya", "sinij"]],
  [/черн|чёрн/, ["black", "chernyy", "chernyi", "chernaya", "chernyj", "midnight"]],
  [/бел/, ["white", "belyy", "belyi", "belaya", "belyj", "cloud"]],
  [/темно-сер|тёмно-сер/, ["grey", "gray", "graphite", "space"]],
  [/серебрист/, ["silver", "serebristyy"]],
  [/сер(ый|ая|ое|ые)(?![а-яё])/, ["grey", "gray", "seryy", "seryi"]],
  [/золот/, ["gold", "zolotistyy"]],
  [/розов/, ["pink", "rozovyy", "rose"]],
  [/зелен|зелён/, ["green", "zelenyy", "zelenaya"]],
  [/мятн/, ["mint"]],
  [/фиолет|лаванд/, ["purple", "violet", "lavender", "light-violet", "fioletovyy"]],
  [/бордов/, ["burgundy", "bordo", "bordovyy", "dark-red", "cherry"]],
  [/красн/, ["red", "krasnyy"]],
  [/оранж/, ["orange", "oranzhevyy", "cosmic"]],
  [/желт|жёлт/, ["yellow", "zheltyy"]],
  [/беж/, ["beige", "bezhevyy", "sand", "cream"]],
  [/графит/, ["graphite", "grafit"]],
];
const STORE_COLOR_WORDS = new Set(
  COLORS.flatMap(([, v]) => v).flatMap((v) => v.split("-"))
    .concat(["mint", "titanium", "natural", "desert", "teal", "burgundy", "magenta", "cream", "lavender", "cosmic", "ultramarine"]),
);
const VARIANTS = new Set(["pro", "max", "plus", "ultra", "mini", "lite", "fe", "air", "neo", "edge", "slim", "absolute", "mix",
  "x", "s", "e", "c", "se", "prime", "nfc", "play", "go", "2", "3", "4", "5", "ii", "iii"]);

const COLOURWAY = /никел|медь|медн|яшм|патин|топаз|керамик|бронз|фукси|прусск|nickel|copper|jasper|patina|topaz|ceramic|bronze/;

/** Every colour a Kaspi title states ("желтый, серебристый" → two), as a key; null when it states none. */
export function kaspiColour(title: string): string | null {
  const low = title.toLowerCase();
  const all = COLORS.flatMap(([re], i) => (re.test(low) ? [i] : []));
  return all.length ? all.join(",") : null;
}

export interface Memory { ram: number | null; storage: number | null }

/** Memory from a Kaspi title: "8 ГБ/256 ГБ", "12 Гб/128 Гб", "256Gb", "2Tb" (storage in GB). */
export function titleMemory(title: string): Memory {
  const t = title.toLowerCase();
  let m = t.match(/(\d{1,2})\s*(?:гб|gb)?\s*\/\s*(\d{1,4})\s*(гб|gb|тб|tb)/);
  if (m) return { ram: +m[1]!, storage: +m[2]! * (/т|t/.test(m[3]!) ? 1024 : 1) };
  m = t.match(/(\d{1,4})\s*(gb|гб|tb|тб)(?![a-zа-я])/);
  if (m) return { ram: null, storage: +m[1]! * (/т|t/.test(m[2]!) ? 1024 : 1) };
  return { ram: null, storage: null };
}

/** Memory from store tokens: "...-8-256-..." / "...-12-256gb-..." / "...-256gb-..." / "...-2tb-...". */
export function tokensMemory(tokens: string[]): Memory {
  const s = `-${tokens.join("-")}-`;
  let m = s.match(/-(\d{1,2})-(\d{2,4})(?:gb)?-/);
  if (m) return { ram: +m[1]!, storage: +m[2]! };
  m = s.match(/-(\d{1,2})-(\d)tb-/);
  if (m) return { ram: +m[1]!, storage: +m[2]! * 1024 };
  m = s.match(/-(\d{1,2})\/(\d{2,4})gb-/);
  if (m) return { ram: +m[1]!, storage: +m[2]! };
  m = s.match(/-(\d{2,4})gb-/) ?? s.match(/-(\d)tb-/);
  if (m) return { ram: null, storage: m[0].includes("tb") ? +m[1]! * 1024 : +m[1]! };
  return { ram: null, storage: null };
}

/** Lower-case Latin/number tokens of a Kaspi title, without memory sizes and the screen size in cm ("191 см"). */
export function titleTokens(title: string): string[] {
  const cm = /\b(\d{2,3})\s*см\b/.exec(title)?.[1];
  return plusWord(title.toLowerCase()).replace(/\d+\s*(гб|gb|тб|tb)/g, " ").replace(/[а-яёәғқңөұүһі]+/g, " ")
    .split(/[^a-z0-9]+/).filter((x) => x && x !== cm && (x.length > 1 || /\d/.test(x) || VARIANTS.has(x)));
}

/**
 * A "+" stuck to a model ("Pro+", "S25+") is the Plus variant (8 Nov: «Note 14 Pro+» had passed as «Note 14 Pro», «S25»
 * as «S25+»). A loose "+ подарок" and "Straight+Wavy" (a word follows) are not.
 */
const plusWord = (s: string) => s.replace(/([a-z0-9])\+(?![a-z0-9])/g, "$1 plus");

/** Tokens of a store item: its address (slug) and, when known, its own title (Latin words, "6/128GB" kept whole). */
export function storeTokens(slug: string, title?: string | null): string[] {
  // Words with any Cyrillic letter go whole: "Пылеcос" written with a Latin "c" must not leave a token "c".
  const fromTitle = plusWord((title ?? "").toLowerCase()).split(/\s+/).filter((w) => !/[а-яёәғқңөұүһі]/.test(w)).join(" ").split(/[^a-z0-9/]+/)
    .flatMap((x) => (/^\d{1,2}\/\d{2,4}gb$/.test(x) ? [x] : x.split("/"))).filter(Boolean);
  return [...slug.toLowerCase().split("-"), ...fromTitle];
}

/** Why a Kaspi title and a store item are not the same product, or null when every rule holds. `storeTitle`: the
 * store's own title, for colours it writes only in Russian (7 Nov: «Airstrait HT01 розовая керамика» vs «оранжевый»). */
export function mismatch(kaspiTitle: string, store: string[], storeTitle?: string | null): string | null {
  const tok = titleTokens(kaspiTitle);
  if (tok.length < 2) return "too few model tokens";
  if (!tok.some((x) => /\d/.test(x))) return "no model number";
  const set = new Set(store);
  if (!tok.every((x) => set.has(x))) return "model differs";
  const ours = new Set(tok);
  const num = (x: string | undefined) => !!x && /^\d+(gb|tb)?$/.test(x);
  for (let i = 0; i < store.length; i++) {
    const x = store[i]!;
    if (!VARIANTS.has(x) || ours.has(x)) continue;
    // A digit inside a run of numbers ("-8-256-6-7-50-": RAM, storage, screen, camera) is a spec, not a variant;
    // "-pro-x-2-lightspeed-" is the second generation.
    if (/^\d$/.test(x) && (num(store[i - 1]) || num(store[i + 1]))) continue;
    return `variant ${x}`;
  }
  const a = titleMemory(kaspiTitle), b = tokensMemory(store);
  // The store's own title wins over its address when both state RAM (7 Nov: an 8-128 address titled "6/128GB").
  const titled = store.find((x) => /^\d{1,2}\/\d{2,4}gb$/.test(x));
  if (titled) { const [r, s] = titled.replace("gb", "").split("/"); b.ram = +r!; b.storage = +s!; }
  if (a.storage && b.storage !== a.storage) return b.storage ? "storage differs" : "storage unknown";
  if (a.ram && b.ram && a.ram !== b.ram) return "ram differs";
  const low = kaspiTitle.toLowerCase();
  const colour = COLORS.find(([re]) => re.test(low));
  const storeHasColour = [...set].some((x) => STORE_COLOR_WORDS.has(x));
  if (colour && storeHasColour && !colour[1].some((v) => v.split("-").every((p) => set.has(p)))) return "colour differs";
  const ru = (storeTitle ?? "").toLowerCase();
  // A named colourway («никель/медь», «пурпурная яшма», «патина/топаз») cannot be compared with a plain colour: the owner decides.
  if (colour && COLOURWAY.test(ru)) return "colourway unclear";
  const storeRu = COLORS.find(([re]) => re.test(ru));
  if (colour && storeRu && colour !== storeRu) return "colour differs";
  return null;
}

/** An index of a store's item addresses, for finding candidates offline. */
export interface StoreIndex { items: { slug: string; tokens: Set<string> }[] }
export const storeIndex = (slugs: string[]): StoreIndex => ({ items: slugs.map((s) => ({ slug: s, tokens: new Set(s.split("-")) })) });

/** Mismatches that are only about colour: the same model and memory, shown at most as «похожий товар». */
export const COLOUR_ONLY = new Set(["colour differs", "colourway unclear"]);

/**
 * The best store item for a Kaspi title by its address alone (the fewest extra tokens), or null. With `colourOnly`,
 * when no item passes every rule, the best one whose only problem is the colour (to be shown as «похожий товар»).
 */
export function bestCandidate(kaspiTitle: string, index: StoreIndex, colourOnly = false): string | null {
  const tok = titleTokens(kaspiTitle);
  if (tok.length < 2) return null;
  let best: { slug: string; size: number } | null = null, similar: { slug: string; size: number } | null = null;
  for (const it of index.items) {
    if (!tok.every((x) => it.tokens.has(x))) continue; // cheap pre-filter before the full rules
    const why = mismatch(kaspiTitle, [...it.tokens]);
    if (!why) { if (!best || it.tokens.size < best.size) best = { slug: it.slug, size: it.tokens.size }; }
    else if (colourOnly && COLOUR_ONLY.has(why) && (!similar || it.tokens.size < similar.size)) similar = { slug: it.slug, size: it.tokens.size };
  }
  return best?.slug ?? similar?.slug ?? null;
}

/**
 * Loose candidates for a product the store is known to sell (it is a seller of it on Kaspi): ranked by shared
 * tokens, model tokens weigh double, and items passing every strict rule first. Only for pages whose own Kaspi link
 * then decides (exact): a loose candidate is never accepted on its name.
 */
export function looseCandidates(kaspiTitle: string, index: StoreIndex, n = 3): string[] {
  const tok = titleTokens(kaspiTitle);
  const model = tok.filter((x) => /\d/.test(x));
  if (!model.length) return [];
  return index.items
    .map((it) => ({ it, hit: tok.filter((x) => it.tokens.has(x)).length, m: model.filter((x) => it.tokens.has(x)).length }))
    .filter((c) => c.m > 0 && c.hit >= 2)
    .map((c) => ({ slug: c.it.slug, score: c.hit + c.m + (mismatch(kaspiTitle, [...c.it.tokens]) ? 0 : 10), size: c.it.tokens.size }))
    .sort((a, b) => b.score - a.score || a.size - b.size)
    .slice(0, n).map((c) => c.slug);
}
