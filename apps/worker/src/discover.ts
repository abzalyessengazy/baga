/**
 * Builds the seed catalog from Kaspi's sitemap (the one kaspi.kz/robots.txt lists). Writes a list of product URLs
 * to data/seed-discovered.txt for review; `pnpm --filter @baga/worker seed data/seed-discovered.txt` queues them.
 * Touches no database. Inside the robots.txt visit window only, ≥10 s between requests,
 * at most --max-requests requests (default 41, ~8 min), stops at the first 403/429.
 * Every link read is saved to data/sitemap-links.txt (gitignored); `--from-file` re-picks from it with no requests,
 * so picking rules can be tuned without asking Kaspi again.
 *
 *   pnpm --filter @baga/worker discover [--per-category 70] [--max-requests 41]
 *   pnpm --filter @baga/worker discover --from-file [--per-category 70]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createKaspiClient, parseKaspiUrl, KASPI_SITEMAP_URL, KaspiHttpError, canonicalProductUrl, type Sitemap } from "@baga/kaspi";
import { isInVisitWindow, KASPI_CRAWL_DELAY_MS, pickSeedProducts, SEED_CATEGORIES } from "@baga/core";

const arg = (name: string, dflt: number) => {
  const i = process.argv.indexOf(`--${name}`);
  const v = i > 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(v) && v > 0 ? v : dflt;
};
const perCategory = arg("per-category", 70);
const maxRequests = arg("max-requests", 41); // the index + 40 of ~350 product sitemaps (those are on Kaspi's CDN)
const out = fileURLToPath(new URL("../data/seed-discovered.txt", import.meta.url));
const fixtures = fileURLToPath(new URL("../../../packages/kaspi/fixtures/", import.meta.url));
const linksFile = fileURLToPath(new URL("../data/sitemap-links.txt", import.meta.url));
const fromFile = process.argv.includes("--from-file");

if (!fromFile && !isInVisitWindow(new Date())) {
  console.error("Outside the collection window (04:05–08:30 UTC = 09:05–13:30 Almaty, inside kaspi.kz robots.txt 04:00–08:45). No requests made.");
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
  if (!fromFile && candidates.length) writeFileSync(linksFile, candidates.map((c) => `${c.productId}\t${c.slug}`).join("\n") + "\n");
  const picked = pickSeedProducts(candidates, perCategory);
  const lines = [
    `# Seed catalog from ${KASPI_SITEMAP_URL}, ${new Date().toISOString()}.`,
    `# ${candidates.length} product links read with ${requests} requests; up to ${perCategory} per category. Review, then:`,
    `#   pnpm --filter @baga/worker seed data/seed-discovered.txt`,
  ];
  let total = 0;
  for (const { id } of SEED_CATEGORIES) {
    const items = picked.get(id) ?? [];
    console.log(`${id.padEnd(12)} ${String(items.length).padStart(4)}`);
    if (!items.length) continue;
    total += items.length;
    lines.push("", `# ${id}`, ...items.map((p) => canonicalProductUrl(p.productId, p.slug)));
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
const root = await get(KASPI_SITEMAP_URL);
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
  const n = Math.min(pool.length, maxRequests - 1);
  for (let i = 0; i < n; i++) {
    const child = await get(pool[Math.floor((i * pool.length) / n)]!);
    if (!child) continue;
    if (child.kind === "urlset") {
      if (!candidates.length) writeFileSync(fixtures + "sitemap-sample.xml", `<urlset>\n${sample(child.locs)}\n</urlset>\n`);
      addLocs(child.locs);
    }
  }
}
finish();
