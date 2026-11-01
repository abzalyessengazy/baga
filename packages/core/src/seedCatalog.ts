/**
 * Picks the seed catalog from Kaspi sitemap URLs. The sitemap has no categories, so a product's category is read
 * from the words of its link (Kaspi slugs are transliterated titles: "noutbuk-…", "apple-iphone-…").
 * Order matters: more specific categories come first (tablets and watches before phones).
 */
export const SEED_CATEGORIES: { id: string; any: string[] }[] = [
  { id: "tablets", any: ["planshet", "ipad", "galaxytab", "redmipad", "xiaomipad", "matepad", "honorpad"] },
  { id: "watches", any: ["smartchasy", "umnyechasy", "applewatch", "galaxywatch", "fitnesbraslet", "redmiwatch", "huaweiwatch"] },
  { id: "headphones", any: ["naushniki", "airpods", "galaxybuds", "redmibuds", "garnitura"] },
  { id: "phones", any: ["smartfon", "iphone", "galaxys2", "galaxya", "galaxyz", "redminote", "poco", "pixel"] },
  { id: "laptops", any: ["noutbuk", "macbook", "ideapad", "vivobook", "zenbook", "thinkpad", "matebook", "magicbook", "aspire", "pavilion"] },
  { id: "monitors", any: ["monitor"] },
  { id: "tvs", any: ["televizor"] },
  { id: "consoles", any: ["igrovayapristavka", "playstation", "xboxseries", "nintendoswitch", "steamdeck"] },
  { id: "fridges", any: ["holodilnik", "kholodilnik", "morozilnik"] },
  { id: "washers", any: ["stiralnayamashina", "sushilnayamashina"] },
  { id: "dishwashers", any: ["posudomoechnaya"] },
  { id: "vacuums", any: ["pylesos", "robotpylesos"] },
  { id: "kitchen", any: ["mikrovolnovaya", "kofemashina", "multivarka", "blender", "chainik", "duhovka", "varochnaya", "mjasorubka", "myasorubka"] },
  { id: "climate", any: ["konditsioner", "kondicioner", "obogrevatel", "uvlazhnitel", "ochistitelvozduha"] },
  { id: "beauty", any: ["fen", "stajler", "stailer", "dyson", "elektrobritva", "trimmer"] },
];

/** Accessories and spare parts ride on popular product names ("chehol-dlya-iphone"); they are not what we track. */
const ACCESSORY = ["dlya", "chehol", "steklo", "plenka", "kabel", "zaryadn", "adapter", "derzhatel", "remeshok", "kronshtein", "podstavka", "filtr", "meshki", "nasadka", "zapchast", "remen", "pult", "sumka", "ryukzak"];

export function seedCategory(slug: string): string | null {
  const words = slug.toLowerCase().split("-");
  if (words.some((w) => ACCESSORY.some((a) => w.startsWith(a)))) return null;
  const joined = words.join("");
  // "fen" must be a whole word: it occurs inside many others.
  for (const c of SEED_CATEGORIES) if (c.any.some((k) => (k.length <= 3 ? words.includes(k) : joined.includes(k)))) return c.id;
  return null;
}

/**
 * Up to `perCategory` products per category, spread evenly over each category's candidates (the sitemap has no
 * popularity, so an even spread avoids taking one model in twenty colours). Deterministic for the same input.
 */
export function pickSeedProducts<T extends { productId: string; slug: string }>(candidates: T[], perCategory: number): Map<string, T[]> {
  const byCat = new Map<string, T[]>();
  const seen = new Set<string>();
  for (const c of candidates) {
    if (seen.has(c.productId)) continue;
    seen.add(c.productId);
    const cat = seedCategory(c.slug);
    if (!cat) continue;
    (byCat.get(cat) ?? byCat.set(cat, []).get(cat)!).push(c);
  }
  const out = new Map<string, T[]>();
  for (const { id } of SEED_CATEGORIES) {
    const all = byCat.get(id) ?? [];
    if (!all.length) continue;
    const take = Math.min(perCategory, all.length);
    const step = all.length / take;
    out.set(id, Array.from({ length: take }, (_, i) => all[Math.floor(i * step)]!));
  }
  return out;
}
