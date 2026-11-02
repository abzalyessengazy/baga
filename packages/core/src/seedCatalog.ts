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
export interface SeedCategory { id: string; type: string[]; brands: string[]; exclude?: string[]; models?: RegExp }

const PHONE_BRANDS = ["apple", "samsung", "xiaomi", "redmi", "poco", "honor", "huawei", "realme", "tecno", "infinix", "oppo", "vivo", "google", "oneplus", "nothing", "motorola"];
const BIG_APPLIANCE = ["samsung", "lg", "bosch", "beko", "haier", "indesit", "electrolux", "midea", "hisense", "artel", "atlant", "gorenje", "candy", "hotpoint", "siemens", "whirlpool", "tcl", "liebherr", "weissgauff", "korting"];

export const SEED_CATEGORIES: SeedCategory[] = [
  { id: "tablets", type: ["planshet", "ipad", "galaxytab", "redmipad", "xiaomipad", "matepad"], brands: ["apple", "samsung", "xiaomi", "redmi", "huawei", "honor", "lenovo", "realme", "tecno"] },
  { id: "watches", type: ["smartchasy", "umnyechasy", "applewatch", "galaxywatch", "fitnesbraslet", "smartbraslet", "redmiwatch"], brands: ["apple", "samsung", "xiaomi", "redmi", "huawei", "honor", "amazfit", "garmin"] },
  { id: "headphones", type: ["naushniki", "airpods", "galaxybuds", "redmibuds", "garnitura"], brands: ["apple", "samsung", "xiaomi", "redmi", "huawei", "honor", "sony", "jbl", "marshall", "sennheiser", "soundcore", "logitech", "hyperx", "razer", "beats", "bose"] },
  { id: "phones", type: ["smartfon", "iphone", "galaxys", "galaxya", "galaxyz", "redminote", "poco", "pixel"], brands: PHONE_BRANDS },
  { id: "laptops", type: ["noutbuk", "macbook", "ideapad", "vivobook", "zenbook", "thinkpad", "matebook", "magicbook"], brands: ["apple", "asus", "lenovo", "hp", "acer", "huawei", "honor", "msi", "dell", "gigabyte", "xiaomi", "machenike", "thunderobot"] },
  { id: "monitors", type: ["monitor"], models: /^\d{2}(-\d)?-(samsung|lg|xiaomi|aoc|philips|asus|msi|dell|benq|acer|gigabyte|huawei|titan)-/, brands: ["samsung", "lg", "xiaomi", "aoc", "philips", "asus", "msi", "dell", "benq", "acer", "gigabyte", "huawei", "titan"] },
  { id: "tvs", type: ["televizor"], models: /^(samsung|lg|xiaomi|tcl|hisense|haier|sony|artel|yasin|skyworth|philips|toshiba)-.*-(6\d|[7-9]\d|1\d\d|2[0-4]\d)-sm-/, brands: ["samsung", "lg", "xiaomi", "tcl", "hisense", "haier", "sony", "artel", "yasin", "skyworth", "philips", "toshiba"] },
  { id: "consoles", type: ["igrovajapristavka", "igrovayapristavka", "playstation", "xboxseries", "nintendoswitch", "steamdeck"], brands: ["sony", "microsoft", "nintendo", "valve", "playstation", "xbox"], exclude: ["rus", "eng", "ps4", "joy", "signature"] }, // games and controllers ride on console names
  { id: "fridges", type: ["holodilnik", "kholodilnik", "morozilnik"], models: /^(lg-g[abc]-|lg-gr-|samsung-r[bst]\d|midea-mdr[bst]|haier-(c2f|c4f|htf|hrf|a3fe|cef)|beko-(rcn|cnmv|rcsk|b1r|b3r|b5r)|atlant-(hm|xm|mhm)-|indesit-(its|ds|dfe|ibs)|bosch-kg[nvfe]|hotpoint-hts?|electrolux-(lnt|rnt)|gorenje-(nrk|rk|nrs))/, brands: BIG_APPLIANCE },
  { id: "washers", type: ["stiralnajamashina", "stiralnayamashina", "sushilnajamashina", "sushilnayamashina"], brands: BIG_APPLIANCE },
  { id: "dishwashers", type: ["posudomoechnaja", "posudomoechnaya"], models: /^(bosch-s[mp][sv]|midea-mfd|electrolux-ee[ms]|beko-d[ifs]n|weissgauff-b?dw)/, brands: BIG_APPLIANCE },
  { id: "vacuums", type: ["pylesos", "robotpylesos"], models: /^(dreame-|roborock-|ecovacs-|dyson-(v\d|gen)|xiaomi-(vacuum|robot)|karcher-(fc|vc)\d|samsung-v[sr]\d|tefal-x-plorer|thomas-)/, brands: ["xiaomi", "dreame", "roborock", "dyson", "samsung", "lg", "philips", "karcher", "tefal", "bosch", "deerma", "kitfort", "midea", "ecovacs", "redmond", "polaris", "thomas"] },
  { id: "kitchen", type: ["mikrovolnovajapech", "mikrovolnovayapech", "kofemashina", "multivarka", "blender", "elektrochainik", "chainik", "duhovka", "varochnajapanel", "mjasorubka", "myasorubka", "aerogril", "kuhonnyikombain"], brands: ["philips", "tefal", "bosch", "redmond", "polaris", "xiaomi", "delonghi", "kitfort", "moulinex", "braun", "samsung", "lg", "midea", "scarlett", "vitek", "kenwood", "krups", "nespresso", "dreame", "cosori", "garlyn", "electrolux", "beko"] },
  { id: "climate", type: ["konditsioner", "kondicioner", "splitsistema", "obogrevatel", "uvlazhnitel", "ochistitelvozduha"], brands: ["midea", "gree", "haier", "lg", "samsung", "tcl", "electrolux", "ballu", "aux", "hisense", "chigo", "almacom", "artel", "xiaomi", "philips", "dyson", "levoit", "boneco", "polaris", "timberk"] },
  { id: "beauty", type: ["fen", "stailer", "stajler", "elektrobritva", "trimmer", "vypriamitel", "vyprjamitel", "epiljator"], brands: ["dyson", "philips", "braun", "remington", "rowenta", "babyliss", "xiaomi", "dreame", "panasonic", "polaris", "laica", "enchen", "showsee", "harizma", "moser", "wahl"] },
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

/** Model key: the slug without its colour, the last word on Kaspi ("…-256gb-nanosim-esim-serebristyi"), and "podarok". */
export function modelKey(slug: string): string {
  const words = tokens(slug);
  while (words.length > 3 && words[words.length - 1] === "podarok") words.pop();
  return words.length > 3 ? words.slice(0, -1).join("-") : words.join("-");
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
  const sorted = [...candidates].sort((a, b) => Number(b.productId) - Number(a.productId));
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
  return new Map(SEED_CATEGORIES.filter((c) => out.has(c.id)).map((c) => [c.id, out.get(c.id)!]));
}
