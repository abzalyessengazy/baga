/**
 * Picks the seed catalog from Kaspi sitemap URLs. The sitemap (seen 2 Nov 2026) is ~3M products sorted by id, with
 * no category, date or popularity, so we use what the link itself says: Kaspi slugs are transliterated titles
 * ("noutbuk-asus-…", "apple-iphone-18-pro-…", "polaris-phd-2289ac-fen-chernyi"). A product needs a category word
 * AND a well-known brand; newest ids (current models) come first; one colour per model.
 * Order matters: more specific categories come first (tablets and watches before phones).
 */
/**
 * `models`: Kaspi names some categories with no category word at all (seen 2 Nov 2026): TVs are brand + model +
 * size in cm ("artel-55au20h-140-sm-chernyi"), monitors start with the size in inches ("27-lg-27gp750-b-chernyi"),
 * fridges, dishwashers and vacuums are brand + model code ("atlant-hm-4623-101-belyi", "bosch-smv4hvx31e-belyi").
 * Those are recognised by the start of the link, tried only when no category word matched.
 */
/**
 * `tier` (DECISIONS.md, 2026-11-03 "Seed priorities"): 1 = usually 100 000 ₸ and up, queued first; 2 = popular
 * brands at lower prices. `premium` puts a category's dearer lines first (flagships, large sizes).
 */
export interface SeedCategory { id: string; type: string[]; brands: string[]; exclude?: string[]; models?: RegExp; tier: 1 | 2; premium?: RegExp }

/** First observed price a seed product needs to stay in the daily-first band (main) or in the catalog at all (rare). */
export const SEED_MIN_PRICE = { premium: 100_000, rare: 50_000 } as const;

const PHONE_BRANDS = ["apple", "samsung", "xiaomi", "redmi", "poco", "honor", "huawei", "realme", "tecno", "infinix", "oppo", "vivo", "google", "oneplus", "nothing", "motorola"];
const BIG_APPLIANCE = ["samsung", "lg", "bosch", "beko", "haier", "indesit", "electrolux", "midea", "hisense", "artel", "atlant", "gorenje", "candy", "hotpoint", "siemens", "whirlpool", "tcl", "liebherr", "weissgauff", "korting"];

export const SEED_CATEGORIES: SeedCategory[] = [
  { id: "tablets", type: ["planshet", "ipad", "galaxytab", "redmipad", "xiaomipad", "matepad"], brands: ["apple", "samsung", "xiaomi", "redmi", "huawei", "honor", "lenovo", "realme", "tecno"], tier: 1, premium: /ipad-pro|ipad-air|galaxy-tab-s|matepad-pro|xiaomi-pad-\d/ },
  { id: "watches", type: ["smartchasy", "umnyechasy", "applewatch", "galaxywatch", "fitnesbraslet", "smartbraslet", "redmiwatch"], brands: ["apple", "samsung", "xiaomi", "redmi", "huawei", "honor", "amazfit", "garmin"], tier: 2 },
  { id: "headphones", type: ["naushniki", "airpods", "galaxybuds", "redmibuds", "garnitura"], brands: ["apple", "samsung", "xiaomi", "redmi", "huawei", "honor", "sony", "jbl", "marshall", "sennheiser", "soundcore", "logitech", "hyperx", "razer", "beats", "bose"], tier: 2 },
  { id: "phones", type: ["smartfon", "iphone", "galaxys", "galaxya", "galaxyz", "redminote", "poco", "pixel"], brands: PHONE_BRANDS, tier: 1, premium: /-pro|-ultra|-max|-fold|-flip|galaxy-s\d|galaxy-z|iphone-1[6-9]/ },
  { id: "laptops", type: ["noutbuk", "macbook", "ideapad", "vivobook", "zenbook", "thinkpad", "matebook", "magicbook"], brands: ["apple", "asus", "lenovo", "hp", "acer", "huawei", "honor", "msi", "dell", "gigabyte", "xiaomi", "machenike", "thunderobot"], tier: 1, premium: /macbook-pro|rog|legion|zenbook|thinkpad|predator|omen|-rtx-?\d|-i7-|-i9-|ultra-[79]|ryzen-[79]/ },
  { id: "monitors", type: ["monitor"], models: /^\d{2}(-\d)?-(samsung|lg|xiaomi|aoc|philips|asus|msi|dell|benq|acer|gigabyte|huawei|titan)-/, brands: ["samsung", "lg", "xiaomi", "aoc", "philips", "asus", "msi", "dell", "benq", "acer", "gigabyte", "huawei", "titan"], tier: 1, premium: /^(27|3\d|4\d)-|oled/ },
  { id: "tvs", type: ["televizor"], models: /^(samsung|lg|xiaomi|tcl|hisense|haier|sony|artel|yasin|skyworth|philips|toshiba)-.*-(6\d|[7-9]\d|1\d\d|2[0-4]\d)-sm-/, brands: ["samsung", "lg", "xiaomi", "tcl", "hisense", "haier", "sony", "artel", "yasin", "skyworth", "philips", "toshiba"], tier: 1, premium: /-(1[4-9]\d|2\d\d)-sm-|oled|qled|neo/ },
  { id: "consoles", type: ["igrovajapristavka", "igrovayapristavka", "playstation", "xboxseries", "nintendoswitch", "steamdeck"], brands: ["sony", "microsoft", "nintendo", "valve", "playstation", "xbox"], exclude: ["rus", "eng", "ps4", "joy", "signature"], tier: 1 }, // games and controllers ride on console names
  { id: "fridges", type: ["holodilnik", "kholodilnik", "morozilnik"], models: /^(lg-g[abc]-|lg-gr-|samsung-r[bst]\d|midea-mdr[bst]|haier-(c2f|c4f|htf|hrf|a3fe|cef)|beko-(rcn|cnmv|rcsk|b1r|b3r|b5r)|atlant-(hm|xm|mhm)-|indesit-(its|ds|dfe|ibs)|bosch-kg[nvfe]|hotpoint-hts?|electrolux-(lnt|rnt)|gorenje-(nrk|rk|nrs))/, brands: BIG_APPLIANCE, tier: 1 },
  { id: "washers", type: ["stiralnajamashina", "stiralnayamashina", "sushilnajamashina", "sushilnayamashina"], brands: BIG_APPLIANCE, tier: 1 },
  { id: "dishwashers", type: ["posudomoechnaja", "posudomoechnaya"], models: /^(bosch-s[mp][sv]|midea-mfd|electrolux-ee[ms]|beko-d[ifs]n|weissgauff-b?dw)/, brands: BIG_APPLIANCE, tier: 1 },
  { id: "vacuums", type: ["pylesos", "robotpylesos"], models: /^(dreame-|roborock-|ecovacs-|dyson-(v\d|gen)|xiaomi-(vacuum|robot)|karcher-(fc|vc)\d|samsung-v[sr]\d|tefal-x-plorer|thomas-)/, brands: ["xiaomi", "dreame", "roborock", "dyson", "samsung", "lg", "philips", "karcher", "tefal", "bosch", "deerma", "kitfort", "midea", "ecovacs", "redmond", "polaris", "thomas"], tier: 1, premium: /robot|dyson|roborock|dreame/ },
  { id: "kitchen", type: ["mikrovolnovajapech", "mikrovolnovayapech", "kofemashina", "multivarka", "blender", "elektrochainik", "chainik", "duhovka", "varochnajapanel", "mjasorubka", "myasorubka", "aerogril", "kuhonnyikombain"], brands: ["philips", "tefal", "bosch", "redmond", "polaris", "xiaomi", "delonghi", "kitfort", "moulinex", "braun", "samsung", "lg", "midea", "scarlett", "vitek", "kenwood", "krups", "nespresso", "dreame", "cosori", "garlyn", "electrolux", "beko"], tier: 2 },
  { id: "climate", type: ["konditsioner", "kondicioner", "splitsistema", "obogrevatel", "uvlazhnitel", "ochistitelvozduha"], brands: ["midea", "gree", "haier", "lg", "samsung", "tcl", "electrolux", "ballu", "aux", "hisense", "chigo", "almacom", "artel", "xiaomi", "philips", "dyson", "levoit", "boneco", "polaris", "timberk"], tier: 1 },
  { id: "beauty", type: ["fen", "stailer", "stajler", "elektrobritva", "trimmer", "vypriamitel", "vyprjamitel", "epiljator"], brands: ["dyson", "philips", "braun", "remington", "rowenta", "babyliss", "xiaomi", "dreame", "panasonic", "polaris", "laica", "enchen", "showsee", "harizma", "moser", "wahl"], tier: 2 },
];

/** Accessories and spare parts ride on popular product names ("chehol-dlja-iphone"); they are not what we track. */
const ACCESSORY_WORDS = ["dlja", "dlya", "chehol", "chekhol", "case", "cover", "steklo", "plenka", "kabel", "adapter", "derzhatel", "remeshok", "kronshtein", "podstavka", "stolik", "nakleiki", "stikery", "nasadka", "pult", "sumka", "rjukzak", "ryukzak", "aksessuarov", "aksessuary", "schetka", "meshok", "pylesbornik", "zapchast", "remen", "zarjadnoe", "zaryadnoe", "zarjadnaja", "zaryadnaya", "komplekt", "nabor", "sht", "ml"];
/** Checked on the joined slug, because Kaspi writes the soft sign as a hyphen ("fil-tr", "stiral-naja"). */
const ACCESSORY_JOINED = ["filtr", "pylesbornik", "zapchast"];

const has = (words: string[], joined: string, k: string) => (k.length <= 3 ? words.includes(k) : joined.includes(k));
const tokens = (slug: string) => slug.toLowerCase().split("-").filter(Boolean);

/**
 * The slug must open with the category word or the brand ("naushniki-…", "stiral-naja-mashina-…", "dyson-…", leading
 * sizes like "27-…" skipped). Anything else is usually an accessory or a game that names the product later on.
 */
function opensRight(words: string[], c: SeedCategory): boolean {
  const head = words.slice(words.findIndex((w) => !/^\d+$/.test(w)));
  const joined = head.join("");
  return c.brands.includes(head[0] ?? "") || c.type.some((k) => joined.startsWith(k));
}

export function seedCategory(slug: string): string | null {
  const words = tokens(slug);
  const joined = words.join("");
  if (words.some((w) => ACCESSORY_WORDS.includes(w)) || ACCESSORY_JOINED.some((a) => joined.includes(a))) return null;
  for (const c of SEED_CATEGORIES) {
    if (!c.type.some((k) => has(words, joined, k))) continue;
    const ok = c.brands.some((b) => words.includes(b)) && opensRight(words, c) && !c.exclude?.some((x) => words.includes(x));
    return ok ? c.id : null;
  }
  const lower = words.join("-");
  return SEED_CATEGORIES.find((c) => c.models?.test(lower))?.id ?? null;
}

/**
 * Model key: the slug without its colour (the last word on Kaspi), "podarok", and since 14 Nov 2026 its memory size
 * and SIM kind ("…-256gb-nanosim-esim-serebristyi", "…-8-gb-256-gb-…"): one product per device, not per configuration.
 */
export function modelKey(slug: string): string {
  const words = tokens(slug);
  while (words.length > 3 && words[words.length - 1] === "podarok") words.pop();
  const base = words.length > 3 ? words.slice(0, -1) : words;
  const out: string[] = [];
  for (let i = 0; i < base.length; i++) {
    const w = base[i]!;
    if (/^\d+(gb|tb)$/.test(w) || /^(nanosim|esim|dual|sim|nano)$/.test(w)) continue;
    if (/^\d+$/.test(w) && /^(gb|tb)$/.test(base[i + 1] ?? "")) { i++; continue; }
    out.push(w);
  }
  return out.join("-");
}

/**
 * Product line: the brand and the two words after it ("apple-macbook-air", "samsung-galaxy-a26", "lg-f2y1ws6w-6").
 * Capped, so one line's dozens of configurations do not fill a category.
 */
export function familyKey(slug: string, category: string): string {
  const words = tokens(slug);
  const brands = SEED_CATEGORIES.find((c) => c.id === category)?.brands ?? [];
  const i = Math.max(0, words.findIndex((w) => brands.includes(w)));
  return `${category}:${words.slice(i, i + 3).join("-")}`;
}
export const FAMILY_CAP = 3;

/**
 * Up to `perCategory` products per category: newest ids first (Kaspi ids grow over time, so these are current
 * models), one colour per model, at most FAMILY_CAP per product line. Deterministic for the same input.
 */
export function pickSeedProducts<T extends { productId: string; slug: string }>(candidates: T[], perCategory: number): Map<string, T[]> {
  const premium = (c: T) => { const k = seedCategory(c.slug); return k && SEED_CATEGORIES.find((x) => x.id === k)?.premium?.test(c.slug) ? 1 : 0; };
  const sorted = [...candidates].sort((a, b) => premium(b) - premium(a) || Number(b.productId) - Number(a.productId));
  const seenIds = new Set<string>();
  const seenModels = new Set<string>();
  const families = new Map<string, number>();
  const out = new Map<string, T[]>();
  for (const c of sorted) {
    if (seenIds.has(c.productId)) continue;
    seenIds.add(c.productId);
    const cat = seedCategory(c.slug);
    if (!cat) continue;
    const list = out.get(cat) ?? [];
    if (list.length >= perCategory) continue;
    const model = modelKey(c.slug);
    if (seenModels.has(model)) continue;
    const family = familyKey(c.slug, cat);
    if ((families.get(family) ?? 0) >= FAMILY_CAP) continue;
    seenModels.add(model);
    families.set(family, (families.get(family) ?? 0) + 1);
    list.push(c);
    out.set(cat, list);
  }
  // Queue order: tier 1 before tier 2 (the collector adds queued products in this order).
  const order = [...SEED_CATEGORIES].sort((a, b) => a.tier - b.tier);
  return new Map(order.filter((c) => out.has(c.id)).map((c) => [c.id, out.get(c.id)!]));
}

/**
 * Rare categories (DECISIONS.md, 2026-11-03 "Seed priorities"): a few products each from big-ticket categories with
 * no brand list (furniture, bikes, tools, instruments, clothing), to see how such products behave. Their slug must
 * open with the category word(s) as whole words ("divan-…", not "divanari-…"). Only products whose first price is SEED_MIN_PRICE.rare or more stay in the catalog.
 */
export const RARE_CATEGORIES: { id: string; type: string[]; exclude?: string[] }[] = [
  { id: "sofas", type: ["divan"], exclude: ["naduvnoi", "naduvnoj", "nasos", "chehol"] },
  { id: "beds", type: ["krovat"], exclude: ["detskaja", "detskaya", "manezh"] },
  { id: "wardrobes", type: ["shkaf"] },
  { id: "tables", type: ["stol"], exclude: ["stolik", "stoleshnitsa", "stul"] },
  { id: "chairs", type: ["kreslo"], exclude: ["meshok", "detskoe", "kachalka"] },
  { id: "mattresses", type: ["matras"], exclude: ["naduvnoi", "naduvnoj", "nakladka", "toper", "topper"] },
  { id: "bikes", type: ["velosiped"], exclude: ["detskii", "detskij", "begovel"] },
  { id: "scooters", type: ["elektrosamokat"] },
  { id: "treadmills", type: ["begovaja-dorozhka", "begovaya-dorozhka"] },
  { id: "exercisebikes", type: ["velotrenazher"] },
  { id: "drills", type: ["perforator", "shurupovert"] },
  { id: "generators", type: ["generator"] },
  { id: "mowers", type: ["gazonokosilka"] },
  { id: "waterheaters", type: ["vodonagrevatel"] },
  { id: "printers", type: ["printer", "mfu"] },
  { id: "projectors", type: ["proektor"] },
  { id: "cameras", type: ["fotoapparat"] },
  { id: "guitars", type: ["gitara"], exclude: ["struny", "detskaja"] },
  { id: "synths", type: ["sintezator"], exclude: ["detskii", "detskij"] },
  { id: "carseats", type: ["avtokreslo"] },
  { id: "jackets", type: ["kurtka"], exclude: ["detskaja", "detskaya"] },
];

export function rareCategory(slug: string): string | null {
  const words = tokens(slug);
  const joined = words.join("");
  if (words.some((w) => ACCESSORY_WORDS.includes(w)) || ACCESSORY_JOINED.some((a) => joined.includes(a))) return null;
  if (seedCategory(slug)) return null;
  const head = `${words.slice(Math.max(0, words.findIndex((w) => !/^\d+$/.test(w)))).join("-")}-`;
  return RARE_CATEGORIES.find((c) => c.type.some((k) => head.startsWith(`${k}-`)) && !c.exclude?.some((x) => joined.includes(x)))?.id ?? null;
}

/** Up to `perCategory` per rare category: newest first, one product per line (brand and model words). */
export function pickRareProducts<T extends { productId: string; slug: string }>(candidates: T[], perCategory: number): Map<string, T[]> {
  const sorted = [...candidates].sort((a, b) => Number(b.productId) - Number(a.productId));
  const seen = new Set<string>();
  const out = new Map<string, T[]>();
  for (const c of sorted) {
    const cat = rareCategory(c.slug);
    if (!cat) continue;
    const list = out.get(cat) ?? [];
    const line = tokens(c.slug).slice(0, 3).join("-");
    if (list.length >= perCategory || seen.has(c.productId) || seen.has(line)) continue;
    seen.add(c.productId).add(line);
    list.push(c);
    out.set(cat, list);
  }
  return new Map(RARE_CATEGORIES.filter((c) => out.has(c.id)).map((c) => [c.id, out.get(c.id)!]));
}

/**
 * Breadth before depth (DECISIONS.md, 2026-11-14 "Variants checked less, breadth before depth"): the brand-and-word
 * rules above kept adding products to the same ~90 categories (11 Nov: 113 products, 2 categories). Kaspi's sitemap
 * links carry no category, but their first word is nearly always the product type ("kurtka-…", "smesitel-…",
 * "podguzniki-…"); Kaspi writes the soft sign as a hyphen, so a first word of three letters or fewer is read with the
 * next ("ser-gi", "kol-tso"). The most common first words we have no product for, a few products each: the aim is
 * to meet as many kinds of product pages as possible before visitors paste them.
 */
export function headWord(slug: string): string | null {
  const words = tokens(slug);
  const i = words.findIndex((w) => !/^\d+$/.test(w));
  if (i < 0) return null;
  const w = words[i]!;
  if (w.length <= 3 && words[i + 1] && !/^\d+$/.test(words[i + 1]!)) return `${w}${words[i + 1]}`;
  return w.length >= 3 ? w : null;
}
/** First words that are not a kind of product. */
const NOT_A_TYPE = new Set(["dlja", "dlya", "the", "mini", "smart", "home", "auto", "art", "lux", "elite", "royal", "italy", "chernyi", "belyi", "novyi", "original", "set", "pro", "max"]);

export function pickBreadth<T extends { productId: string; slug: string }>(candidates: T[], coveredSlugs: string[], perHead: number, heads: number): Map<string, T[]> {
  const covered = new Set(coveredSlugs.map(headWord).filter((h): h is string => !!h));
  const groups = new Map<string, T[]>();
  for (const c of candidates) {
    const h = headWord(c.slug);
    if (!h || covered.has(h) || NOT_A_TYPE.has(h)) continue;
    (groups.get(h) ?? groups.set(h, []).get(h)!).push(c);
  }
  const top = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).slice(0, heads);
  const out = new Map<string, T[]>();
  for (const [h, list] of top) {
    const seen = new Set<string>();
    const picked: T[] = [];
    for (const c of [...list].sort((a, b) => Number(b.productId) - Number(a.productId))) {
      // One product per brand within a type (its first two words), so the few picks are different products.
      const m = modelKey(c.slug);
      const line = tokens(c.slug).slice(0, 2).join("-");
      if (seen.has(m) || seen.has(line)) continue;
      seen.add(m).add(line);
      picked.push(c);
      if (picked.length >= perHead) break;
    }
    out.set(h, picked);
  }
  return out;
}
