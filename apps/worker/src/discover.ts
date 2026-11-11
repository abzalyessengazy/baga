/**
 * Builds the seed catalog from Kaspi's sitemap (the one kaspi.kz/robots.txt lists). Writes a list of product URLs
 * to data/seed-discovered.txt for review; `pnpm --filter @baga/worker seed data/seed-discovered.txt` queues them.
 * Touches no database. Inside the robots.txt visit window only, ≥10 s between requests,
 * at most --max-requests requests (default 41, ~8 min), stops at the first 403/429.
 * Every link read is saved to data/sitemap-links.txt (gitignored); `--from-file` re-picks from it with no requests,
 * so picking rules can be tuned without asking Kaspi again.
 *
 *   pnpm --filter @baga/worker discover [--per-category 70] [--max-requests 41]
 *   pnpm --filter @baga/worker discover --from-file [--per-category 70] [--rare 5] [--exclude data/seed-discovered.txt,data/seed-2.txt] [--out data/seed-2.txt]
 *
 * --more reads product sitemaps the first run did not (it read 40 spread evenly over the list) and adds their
 * links to data/sitemap-links.txt. --index-from-fixture takes the sitemap index saved by the last run instead of
 * asking kaspi.kz, so only Kaspi's CDN is asked (stops at the first failure if those addresses have expired).
 *
 * --exclude skips products already listed in earlier seed files (comma-separated: a.txt,b.txt). Rare categories go last, under a
 * "# min-price 50000" line: the seed command stores it, and the collector keeps such a product in the catalog only
 * if its first price reaches it (DECISIONS.md, 2026-11-03 "Seed priorities").
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createKaspiClient, parseKaspiUrl, KASPI_SITEMAP_URL, KaspiHttpError, canonicalProductUrl, type Sitemap } from "@baga/kaspi";
import { isInVisitWindow, KASPI_CRAWL_DELAY_MS, pickSeedProducts, pickRareProducts, SEED_CATEGORIES, RARE_CATEGORIES, SEED_MIN_PRICE } from "@baga/core";

const arg = (name: string, dflt: number) => {
  const i = process.argv.indexOf(`--${name}`);
  const v = i > 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(v) && v > 0 ? v : dflt;
};
const text = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const perCategory = arg("per-category", 70);
const perRare = arg("rare", 5);
const maxRequests = arg("max-requests", 41); // the index + 40 of ~350 product sitemaps (those are on Kaspi's CDN)
const out = text("out") ?? fileURLToPath(new URL("../data/seed-discovered.txt", import.meta.url));
// --exclude a.txt,b.txt: several earlier seed files, comma-separated.
const excludeFiles = (text("exclude") ?? "").split(",").map((f) => f.trim()).filter(Boolean);
const excluded = new Set(excludeFiles.flatMap((f) => [...readFileSync(f, "utf8").matchAll(/-(\d{6,12})\/?\s*$/gm)].map((m) => m[1])));
const fixtures = fileURLToPath(new URL("../../../packages/kaspi/fixtures/", import.meta.url));
const linksFile = fileURLToPath(new URL("../data/sitemap-links.txt", import.meta.url));
const fromFile = process.argv.includes("--from-file");
const more = process.argv.includes("--more");
const indexFromFixture = process.argv.includes("--index-from-fixture");
const FIRST_RUN_FILES = 40;

if (!fromFile && !isInVisitWindow(new Date())) {
  console.error("Outside the collection window (04:01–08:42 UTC = 09:01–13:42 Almaty, inside kaspi.kz robots.txt 04:00–08:45). No requests made.");
  process.exit(1);
}

const kaspi = createKaspiClient({ minIntervalMs: KASPI_CRAWL_DELAY_MS, jitterMs: 2000 });
let requests = 0;
async function get(url: string): Promise<Sitemap | null> {
  if (requests >= maxRequests) return null;
  requests++;
  const t = Date.now();
  try {
    const s = await kaspi.fetchSitemap(url);
    console.log(`  ${url} → ${s.kind}, ${s.locs.length} entries (${Date.now() - t} ms)`);
    return s;
  } catch (e) {
    console.error(`  ${url} → ${String(e)}`);
    if (e instanceof KaspiHttpError && e.isBlocking) { console.error("Kaspi asked us to stop (403/429). Stopping."); finish(); }
    return null;
  }
}

const candidates: { productId: string; slug: string }[] = [];
const addLocs = (locs: string[]) => {
  for (const loc of locs) {
    const p = parseKaspiUrl(loc);
    if (p.ok && p.slug) candidates.push({ productId: p.productId, slug: p.slug });
  }
};
const sample = (locs: string[]) => locs.slice(0, 200).map((l) => `  <url><loc>${l.replace(/&/g, "&amp;")}</loc></url>`).join("\n");

function finish(): never {
  if (!fromFile && candidates.length) {
    // --more adds to the links already saved; a product id is kept once.
    const prev = more && existsSync(linksFile) ? readFileSync(linksFile, "utf8").split("\n").filter(Boolean) : [];
    const ids = new Set(prev.map((l) => l.split("\t")[0]));
    const added = candidates.filter((c) => !ids.has(c.productId) && ids.add(c.productId));
    writeFileSync(linksFile, [...prev, ...added.map((c) => `${c.productId}\t${c.slug}`)].join("\n") + "\n");
    console.log(`${added.length} new links saved (${prev.length + added.length} in ${linksFile})`);
    // A loop, not push(...): over a million saved links overflow the call stack (5 Nov 2026).
    if (more) for (const l of prev) { const [productId, slug] = l.split("\t"); candidates.push({ productId: productId!, slug: slug! }); }
  }
  const fresh = candidates.filter((c) => !excluded.has(c.productId));
  const picked = pickSeedProducts(fresh, perCategory);
  const rare = pickRareProducts(fresh, perRare);
  const lines = [
    `# Seed catalog from ${KASPI_SITEMAP_URL}, ${new Date().toISOString()}.`,
    `# ${candidates.length} product links read with ${requests} requests (${excluded.size} excluded as already seeded); up to ${perCategory} per category, ${perRare} per rare category.`,
    `# Order = queue order: categories usually from ${SEED_MIN_PRICE.premium} ₸ first, then popular brands, then rare categories. Review, then:`,
    `#   pnpm --filter @baga/worker seed ${out.replace(/^.*\/apps\/worker\//, "")}`,
  ];
  let total = 0;
  for (const [id, items] of picked) {
    console.log(`${id.padEnd(12)} ${String(items.length).padStart(4)}`);
    if (!items.length) continue;
    total += items.length;
    const tier = SEED_CATEGORIES.find((c) => c.id === id)!.tier;
    lines.push("", `# ${id} (tier ${tier})`, ...items.map((p) => canonicalProductUrl(p.productId, p.slug)));
  }
  if (rare.size) lines.push("", `# min-price ${SEED_MIN_PRICE.rare}`);
  for (const { id } of RARE_CATEGORIES) {
    const items = rare.get(id) ?? [];
    console.log(`${`rare:${id}`.padEnd(18)} ${String(items.length).padStart(4)}`);
    if (!items.length) continue;
    total += items.length;
    lines.push("", `# rare: ${id}`, ...items.map((p) => canonicalProductUrl(p.productId, p.slug)));
  }
  writeFileSync(out, lines.join("\n") + "\n");
  console.log(`\n${total} products from ${candidates.length} links → ${out}`);
  process.exit(0);
}

if (fromFile) {
  if (!existsSync(linksFile)) { console.error(`No ${linksFile} yet: run discover once inside the visit window.`); process.exit(1); }
  for (const line of readFileSync(linksFile, "utf8").split("\n")) {
    const [productId, slug] = line.split("\t");
    if (productId && slug) candidates.push({ productId, slug });
  }
  console.log(`Re-picking from ${linksFile} (no requests).`);
  finish();
}

console.log(`Reading ${KASPI_SITEMAP_URL} (max ${maxRequests} requests, ≥10 s apart)…`);
const root: Sitemap | null = indexFromFixture
  ? { kind: "index", locs: [...readFileSync(fixtures + "sitemap-index.xml", "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!.replace(/&amp;/g, "&")) }
  : await get(KASPI_SITEMAP_URL);
if (!root) finish();
mkdirSync(fixtures, { recursive: true });
if (root.kind === "urlset") {
  addLocs(root.locs);
  writeFileSync(fixtures + "sitemap-sample.xml", `<urlset>\n${sample(root.locs)}\n</urlset>\n`);
} else {
  writeFileSync(fixtures + "sitemap-index.xml", `<sitemapindex>\n${root.locs.map((l) => `  <sitemap><loc>${l.replace(/&/g, "&amp;")}</loc></sitemap>`).join("\n")}\n</sitemapindex>\n`);
  console.log("Index lists:", root.locs.slice(0, 30).join("\n  "), root.locs.length > 30 ? `\n  … ${root.locs.length - 30} more` : "");
  // Product sitemaps if they are named so; otherwise every child. Spread the few files we read across the list.
  const productish = root.locs.filter((l) => /product|goods|item|\/p[-_.]/i.test(l));
  const pool = productish.length ? productish : root.locs;
  // --more: the files the first run read are skipped, the rest spread evenly.
  const firstRun = new Set(Array.from({ length: Math.min(pool.length, FIRST_RUN_FILES) }, (_, i) => Math.floor((i * pool.length) / Math.min(pool.length, FIRST_RUN_FILES))));
  const files = more ? pool.filter((_, i) => !firstRun.has(i)) : pool;
  const n = Math.min(files.length, maxRequests - (indexFromFixture ? 0 : 1));
  for (let i = 0; i < n; i++) {
    const child = await get(files[Math.floor((i * files.length) / n)]!);
    if (!child) { if (indexFromFixture) break; continue; }
    if (child.kind === "urlset") {
      if (!candidates.length) writeFileSync(fixtures + "sitemap-sample.xml", `<urlset>\n${sample(child.locs)}\n</urlset>\n`);
      addLocs(child.locs);
    }
  }
}
finish();
