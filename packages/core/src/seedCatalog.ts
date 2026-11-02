/**
 * Picks the seed catalog from Kaspi sitemap URLs. The sitemap (seen 2 Nov 2026) is ~3M products sorted by id, with
 * no category, date or popularity, so we use what the link itself says: Kaspi slugs are transliterated titles
 * ("noutbuk-asus-…", "apple-iphone-18-pro-…", "polaris-phd-2289ac-fen-chernyi"). A product needs a category word
 * AND a well-known brand; newest ids (current models) come first; one colour per model.
 * Order matters: more specific categories come first (tablets and watches before phones).
 */
export interface SeedCategory { id: string; type: string[]; brands: string[] }

const PHONE_BRANDS = ["apple", "samsung", "xiaomi", "redmi", "poco", "honor", "huawei", "realme", "tecno", "infinix", "oppo", "vivo", "google", "oneplus", "nothing", "motorola"];
const BIG_APPLIANCE = ["samsung", "lg", "bosch", "beko", "haier", "indesit", "electrolux", "midea", "hisense", "artel", "atlant", "gorenje", "candy", "hotpoint", "siemens", "whirlpool", "tcl", "liebherr", "weissgauff", "korting"];

export const SEED_CATEGORIES: SeedCategory[] = [
  { id: "tablets", type: ["planshet", "ipad", "galaxytab", "redmipad", "xiaomipad", "matepad"], brands: ["apple", "samsung", "xiaomi", "redmi", "huawei", "honor", "lenovo", "realme", "tecno"] },
  { id: "watches", type: ["smartchasy", "umnyechasy", "applewatch", "galaxywatch", "fitnesbraslet", "smartbraslet", "redmiwatch"], brands: ["apple", "samsung", "xiaomi", "redmi", "huawei", "honor", "amazfit", "garmin"] },
  { id: "headphones", type: ["naushniki", "airpods", "galaxybuds", "redmibuds", "garnitura"], brands: ["apple", "samsung", "xiaomi", "redmi", "huawei", "honor", "sony", "jbl", "marshall", "sennheiser", "soundcore", "logitech", "hyperx", "razer", "beats", "bose"] },
  { id: "phones", type: ["smartfon", "iphone", "galaxys", "galaxya", "galaxyz", "redminote", "poco", "pixel"], brands: PHONE_BRANDS },
  { id: "laptops", type: ["noutbuk", "macbook", "ideapad", "vivobook", "zenbook", "thinkpad", "matebook", "magicbook"], brands: ["apple", "asus", "lenovo", "hp", "acer", "huawei", "honor", "msi", "dell", "gigabyte", "xiaomi", "machenike", "thunderobot"] },
  { id: "monitors", type: ["monitor"], brands: ["samsung", "lg", "xiaomi", "aoc", "philips", "asus", "msi", "dell", "benq", "acer", "gigabyte", "huawei", "titan"] },
  { id: "tvs", type: ["televizor"], brands: ["samsung", "lg", "xiaomi", "tcl", "hisense", "haier", "sony", "artel", "yasin", "skyworth", "philips", "toshiba"] },
  { id: "consoles", type: ["igrovajapristavka", "igrovayapristavka", "playstation", "xboxseries", "nintendoswitch", "steamdeck"], brands: ["sony", "microsoft", "nintendo", "valve", "playstation", "xbox"] },
  { id: "fridges", type: ["holodilnik", "kholodilnik", "morozilnik"], brands: BIG_APPLIANCE },
  { id: "washers", type: ["stiralnajamashina", "stiralnayamashina", "sushilnajamashina", "sushilnayamashina"], brands: BIG_APPLIANCE },
  { id: "dishwashers", type: ["posudomoechnaja", "posudomoechnaya"], brands: BIG_APPLIANCE },
  { id: "vacuums", type: ["pylesos", "robotpylesos"], brands: ["xiaomi", "dreame", "roborock", "dyson", "samsung", "lg", "philips", "karcher", "tefal", "bosch", "deerma", "kitfort", "midea", "ecovacs", "redmond", "polaris", "thomas"] },
  { id: "kitchen", type: ["mikrovolnovajapech", "mikrovolnovayapech", "kofemashina", "multivarka", "blender", "elektrochainik", "chainik", "duhovka", "varochnajapanel", "mjasorubka", "myasorubka", "aerogril", "kuhonnyikombain"], brands: ["philips", "tefal", "bosch", "redmond", "polaris", "xiaomi", "delonghi", "kitfort", "moulinex", "braun", "samsung", "lg", "midea", "scarlett", "vitek", "kenwood", "krups", "nespresso", "dreame", "cosori", "garlyn", "electrolux", "beko"] },
  { id: "climate", type: ["konditsioner", "kondicioner", "splitsistema", "obogrevatel", "uvlazhnitel", "ochistitelvozduha"], brands: ["midea", "gree", "haier", "lg", "samsung", "tcl", "electrolux", "ballu", "aux", "hisense", "chigo", "almacom", "artel", "xiaomi", "philips", "dyson", "levoit", "boneco", "polaris", "timberk"] },
  { id: "beauty", type: ["fen", "stailer", "stajler", "elektrobritva", "trimmer", "vypriamitel", "vyprjamitel", "epiljator"], brands: ["dyson", "philips", "braun", "remington", "rowenta", "babyliss", "xiaomi", "dreame", "panasonic", "polaris", "laica", "enchen", "showsee", "harizma", "moser", "wahl"] },
];

/** Accessories and spare parts ride on popular product names ("chehol-dlja-iphone"); they are not what we track. */
const ACCESSORY_WORDS = ["dlja", "dlya", "chehol", "chekhol", "case", "cover", "steklo", "plenka", "kabel", "adapter", "derzhatel", "remeshok", "kronshtein", "podstavka", "stolik", "nakleiki", "stikery", "nasadka", "pult", "sumka", "rjukzak", "ryukzak", "aksessuarov", "aksessuary", "schetka", "meshok", "pylesbornik", "zapchast", "remen", "zarjadnoe", "zaryadnoe", "komplekt", "nabor", "sht"];
/** Checked on the joined slug, because Kaspi writes the soft sign as a hyphen ("fil-tr", "stiral-naja"). */
const ACCESSORY_JOINED = ["filtr", "pylesbornik", "zapchast"];

const has = (words: string[], joined: string, k: string) => (k.length <= 3 ? words.includes(k) : joined.includes(k));

export function seedCategory(slug: string): string | null {
  const words = slug.toLowerCase().split("-").filter(Boolean);
  const joined = words.join("");
  if (words.some((w) => ACCESSORY_WORDS.includes(w)) || ACCESSORY_JOINED.some((a) => joined.includes(a))) return null;
  for (const c of SEED_CATEGORIES) {
    if (c.type.some((k) => has(words, joined, k))) return c.brands.some((b) => words.includes(b)) ? c.id : null;
  }
  return null;
}

/** Model key: the slug without its last word, which on Kaspi is the colour ("…-256gb-nanosim-esim-serebristyi"). */
export function modelKey(slug: string): string {
  const words = slug.toLowerCase().split("-").filter(Boolean);
  return words.length > 3 ? words.slice(0, -1).join("-") : words.join("-");
}

/**
 * Up to `perCategory` products per category: newest ids first (Kaspi ids grow over time, so these are current
 * models), one colour per model. Deterministic for the same input.
 */
export function pickSeedProducts<T extends { productId: string; slug: string }>(candidates: T[], perCategory: number): Map<string, T[]> {
  const sorted = [...candidates].sort((a, b) => Number(b.productId) - Number(a.productId));
  const seenIds = new Set<string>();
  const seenModels = new Set<string>();
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
    seenModels.add(model);
    list.push(c);
    out.set(cat, list);
  }
  return new Map(SEED_CATEGORIES.filter((c) => out.has(c.id)).map((c) => [c.id, out.get(c.id)!]));
}
