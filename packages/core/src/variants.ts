/**
 * Colour and memory variants of one device (DECISIONS.md, 2026-11-14 "Variants checked less, breadth before depth"):
 * Kaspi lists every colour and memory size as its own product ("iPhone 18 Pro 256Gb серебристый", "… 512Gb голубой").
 * On 14 Nov 183 of 1,860 products were such variants of a device we already had, ~12% of the week's checks. Pure
 * rules: a key that is the same for all variants of one device, from the title (deviceKey) or the link (slug).
 */
const COLOUR = /^(черн|бел|сер|син|зел[её]н|золот|розов|фиолет|ж[её]лт|красн|голуб|бежев|графит|титан|оранж|коричн|бирюз|мятн|лаванд|натурал|бордов|серебр|мультиколор|прозрачн|black|white|silver|gold|blue|green|pink|gr[ae]y|purple|midnight|starlight|ultramarine|teal|sage|cream|violet|titanium)/i;
const SIM = /^(dual|nano|sim|nanosim|esim|nano-sim|nanosim\+esim|\+)$/i;

/** One key per device from a product title: colour words, memory sizes, SIM kinds and «+ подарок» removed. */
export function deviceKey(title: string): string {
  const t = title.toLowerCase()
    .replace(/\+\s*подарок/g, " ")
    .replace(/\d+\s*(gb|tb|гб|тб)\s*\/\s*\d+\s*(gb|tb|гб|тб)/g, " ")
    .replace(/\d+\s*(gb|tb|гб|тб)\b/g, " ")
    .replace(/[,()]/g, " ");
  return t.split(/\s+/).filter((w) => w && !COLOUR.test(w) && !SIM.test(w)).join(" ");
}

/**
 * The products that are a later variant of a device already in the list: per deviceKey the one with the most Kaspi
 * reviews (then the lowest id) is the device's main product; the others are returned. Titles of fewer than three
 * words are left alone (too little to tell two products apart).
 */
export function laterVariants<T extends { id: number; title: string; reviews: number | null }>(products: T[]): Set<number> {
  const main = new Map<string, T>();
  for (const p of products) {
    const k = deviceKey(p.title);
    if (k.split(" ").length < 3) continue;
    const m = main.get(k);
    if (!m || (p.reviews ?? -1) > (m.reviews ?? -1) || ((p.reviews ?? -1) === (m.reviews ?? -1) && p.id < m.id)) main.set(k, p);
  }
  const out = new Set<number>();
  for (const p of products) {
    const m = main.get(deviceKey(p.title));
    if (m && m.id !== p.id) out.add(p.id);
  }
  return out;
}

/** How often a variant nobody tracks or opened lately is checked: every third day, like a product out of stock. */
export const VARIANT_INTERVAL_MINUTES = 3 * 24 * 60;
