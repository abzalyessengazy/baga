/**
 * Other stores' prices for exactly matched Kaspi products (DECISIONS.md, 2026-11-07 and 2026-11-14; CLAUDE.md rule 6a):
 * Technodom, then Sulpak (runSulpak below), one after the other, never in parallel. Runs after Kaspi's Visit-time has closed, so it never shares a minute with a Kaspi request:
 * 08:46–03:50 UTC, across midnight (13:46–08:50 Almaty; STORE_WINDOW_UTC: Technodom sets no Visit-time, wide so a late
 * GitHub start still runs),
 * started by .github/workflows/stores.yml (cron-job.org dispatch, GitHub's own schedule as backup).
 *   1. Prices: confirmed matches whose last price is 12 h+ old, people's products first (one page each).
 *   2. Matching: Kaspi products never checked against Technodom get a candidate from the product sitemap (offline,
 *      packages/core/src/matching.ts); its page decides: exact (Technodom's Kaspi link is our product), strict (every
 *      rule holds on Technodom's own title), «похожий» when only the colour differs, else rejected (another product).
 * One request at a time, ≥11 s apart, honest User-Agent; the first 403/429 stops the run (its own circuit breaker).
 * By hand: `pnpm --filter @baga/worker stores --now` (any time outside Kaspi's Visit-time).
 */
import postgres from "postgres";
import { KASPI_VISIT_WINDOW_UTC, isInStoreWindow, bestCandidate, looseCandidates, mismatch, storeIndex, storeTokens, kaspiColour } from "@baga/core";
import {
  connectionOptions, isSimilarReason, storeMarketplaceId, productsToMatch, productsSoldOnKaspiBy, productIdByExternal, exactTitleForSku, saveMatch, matchesToPrice, saveStorePrice,
  setMatchStatus, startStoreRun, finishStoreRun, saveStoreCategories, storeCategories, ourLeafCategories, saveListingPage, storeItems, STORE_INDEX,
} from "@baga/db";
import {
  createTechnodomClient, TECHNODOM, TechnodomHttpError, TechnodomParseError, StoreRequestRefused, skuOf, type TechnodomProduct,
  createSulpakClient, SULPAK, SulpakHttpError, SulpakParseError, sulpakCategoriesFor, type SulpakProduct,
} from "@baga/stores";
import { env } from "./env";
import { CircuitBreaker } from "./breaker";

export const STORE_RUN = {
  spacingMs: 11_000,
  jitterMs: 2_000,
  prices: 500,
  /** New candidate pages per run (the first runs work through the whole catalog over a few days). */
  matchPages: 150,
  /** Sulpak: listing pages read per run (22 items each) and confirmed matches priced per run. */
  sulpakListings: 200,
  sulpakPrices: 400,
  /** A listing price this fresh may price a new pair at once; older ones wait for the product page. */
  listingFreshHours: 12,
} as const;

const minute = (d = new Date()) => d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
// `--now`: a run started by hand outside the daily window, still never during Kaspi's Visit-time (+ a minute either side).
const manual = process.argv.includes("--now");
const inKaspiTime = () => minute() >= KASPI_VISIT_WINDOW_UTC.startMinute - 1 && minute() <= KASPI_VISIT_WINDOW_UTC.endMinute;
const inWindow = () => (manual ? !inKaspiTime() : isInStoreWindow(new Date(), 60_000));
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

const sql = postgres(env.databaseUrl(), { max: 2, ...connectionOptions(env.databaseUrl()) });
const manualRunOpen = async () => (await sql`select 1 from collection_runs where runner = 'manual' and finished_at is null
  and started_at > now() - interval '30 minutes' limit 1`).length > 0;

async function main() {
  if (!inWindow()) {
    console.log(JSON.stringify({ skipped: "outside the store window (08:46-03:50 UTC)" }));
    return;
  }
  await runTechnodom();
  if (inWindow()) await runSulpak();
}

/** Waits while a manual Kaspi check runs (rule 6a: never in parallel with a Kaspi request), then the store's own checks. */
async function gate(breaker: CircuitBreaker) {
  for (let waited = 0; await manualRunOpen(); waited += 10_000) {
    if (waited > 25 * 60_000) throw new StoreRequestRefused("a manual Kaspi check kept running");
    await new Promise((r) => setTimeout(r, 10_000));
  }
  if (breaker.openReason) throw new StoreRequestRefused(breaker.openReason);
  if (!inWindow()) throw new StoreRequestRefused("outside the store window");
}

async function runTechnodom() {
  const mid = await storeMarketplaceId(sql, TECHNODOM.code);
  const runId = await startStoreRun(sql, mid);
  const breaker = new CircuitBreaker();
  let requests = 0, priced = 0, matched = 0, failed = 0;
  const td = createTechnodomClient({
    minIntervalMs: STORE_RUN.spacingMs, jitterMs: STORE_RUN.jitterMs,
    // A manual Kaspi check (a visitor's product, DECISIONS 2026-11-09) is running: wait for it (gate).
    beforeRequest: async () => { await gate(breaker); requests++; },
  });
  /** One page; null when it could not be read. Counts the outcome on the breaker. */
  async function page(slug: string): Promise<TechnodomProduct | "gone" | null> {
    try {
      const p = await td.fetchProduct(slug);
      breaker.record(true);
      return p;
    } catch (e) {
      if (e instanceof StoreRequestRefused) throw e;
      failed++;
      if (e instanceof TechnodomHttpError && e.isGone) { breaker.record(true); return "gone"; }
      breaker.record(false, e instanceof TechnodomHttpError && e.isBlocked, e instanceof TechnodomParseError);
      console.error(`[technodom] ${slug}: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }

  try {
    // 1. Prices for confirmed matches.
    for (const m of await matchesToPrice(sql, mid, STORE_RUN.prices)) {
      const p = await page(m.slug);
      if (p === "gone") { await setMatchStatus(sql, m.matchId, "rejected", "page gone"); continue; }
      if (!p) continue;
      // The address now shows another item: out. A renamed one is judged again by the same rules (8 Nov owner rule):
      // only the colour differs → «похожий»; anything else (memory, variant, model) → another product.
      if (p.sku !== m.sku) { await setMatchStatus(sql, m.matchId, "rejected", `item changed to ${p.sku}`); continue; }
      if (m.title && norm(p.title) !== norm(m.title)) {
        const why = mismatch(m.ourTitle, storeTokens(m.slug, p.title), p.title);
        if (why && !isSimilarReason(why)) { await setMatchStatus(sql, m.matchId, "rejected", why); continue; }
        if (why) await setMatchStatus(sql, m.matchId, "pending", why);
      }
      await saveStorePrice(sql, m.matchId, p);
      priced++;
    }

    // 2. New matches.
    const sold = await productsSoldOnKaspiBy(sql, mid, TECHNODOM.kaspiMerchantId);
    const todo = await productsToMatch(sql, mid);
    let pages = 0;
    if (todo.length || sold.length) {
      const items = await td.fetchProductSitemap();
      const idx = storeIndex(items.map((i) => i.slug));
      /** Technodom's page links to another of our Kaspi listings: that one is an exact match. */
      const linkOther = async (p: TechnodomProduct, slug: string, notId: string) => {
        if (!p.kaspiId || p.kaspiId === notId) return;
        const other = await productIdByExternal(sql, p.kaspiId);
        if (!other) return;
        const o = await saveMatch(sql, { productId: other.id, marketplaceId: mid, sku: skuOf(slug), slug, title: p.title, method: "exact", status: "confirmed" });
        if (o.status === "confirmed") await saveStorePrice(sql, o.id, p);
      };
      // 2a. Products Technodom itself sells on Kaspi: up to 3 loose candidates each, accepted only by Technodom's own
      // Kaspi link (exact). Every candidate looked at is recorded, so it is never fetched again.
      for (const t of sold) {
        for (const slug of looseCandidates(t.title, idx, 3)) {
          if (pages >= STORE_RUN.matchPages) break;
          pages++;
          const p = await page(slug);
          if (!p || p === "gone") continue;
          const exact = p.kaspiId === t.externalId;
          const saved = await saveMatch(sql, { productId: t.productId, marketplaceId: mid, sku: skuOf(slug), slug, title: p.title,
            method: "exact", status: exact ? "confirmed" : "rejected", reason: exact ? null : `links to Kaspi ${p.kaspiId ?? "nothing"}` });
          matched++;
          if (saved.status === "confirmed") await saveStorePrice(sql, saved.id, p);
          await linkOther(p, slug, t.externalId);
          if (exact) break;
        }
      }
      // 2b. Every other product: the strict matcher's one candidate.
      for (const t of todo) {
        if (pages >= STORE_RUN.matchPages) break;
        const slug = bestCandidate(t.title, idx, true);
        if (!slug) continue; // no record: looked at again offline next run, when the sitemap may have it
        pages++;
        const p = await page(slug);
        if (!p || p === "gone") continue;
        const exact = p.kaspiId === t.externalId;
        let why = exact ? null : mismatch(t.title, storeTokens(slug, p.title), p.title);
        // The store links this item to another Kaspi listing in another colour: not ours (7 Nov: a purple V12 vs the yellow one).
        if (!why && !exact) {
          const linked = await exactTitleForSku(sql, mid, skuOf(slug));
          const a = kaspiColour(t.title), b = linked ? kaspiColour(linked) : null;
          if (a !== null && b !== null && a !== b) why = "colour of the store's own Kaspi listing differs";
        }
        const saved = await saveMatch(sql, { productId: t.productId, marketplaceId: mid, sku: skuOf(slug), slug, title: p.title,
          method: exact ? "exact" : "strict", status: !why ? "confirmed" : isSimilarReason(why) ? "pending" : "rejected", reason: why });
        matched++;
        // Confirmed, or only the colour differs (shown as «похожий · другой цвет», never asked of the owner): priced
        // right away. Any other difference (memory, variant, model) is another product: rejected, never shown.
        if (saved.status === "confirmed" || (why && isSimilarReason(why))) await saveStorePrice(sql, saved.id, p);
        if (!exact) await linkOther(p, slug, t.externalId);
      }
    }
  } catch (e) {
    if (!(e instanceof StoreRequestRefused)) throw e;
  } finally {
    const aborted = breaker.openReason;
    await finishStoreRun(sql, runId, { requests, priced, matched, failed, aborted });
    console.log(JSON.stringify({ store: TECHNODOM.code, requests, priced, matched, failed, aborted }));
  }
}

/**
 * Sulpak (DECISIONS.md, 2026-11-14 "Sulpak as a third price source"). No product sitemap and no link to Kaspi, so:
 *   1. Prices: confirmed matches whose last price is 12 h+ old, from their product page (stock and price in Almaty).
 *   2. Index: the category list from the Almaty sitemap (monthly), then the listings of the Sulpak categories that
 *      match our Kaspi categories, page by page, re-read weekly (resumed across runs), into store_items.
 *   3. Matching, offline: each Kaspi product never checked against Sulpak gets the strict matcher's candidate from the
 *      index, judged on Sulpak's own title: confirmed, «похожий» (colour only) or rejected. No request.
 */
async function runSulpak() {
  const mid = await storeMarketplaceId(sql, SULPAK.code);
  const runId = await startStoreRun(sql, mid);
  const breaker = new CircuitBreaker();
  let requests = 0, priced = 0, matched = 0, failed = 0, listings = 0;
  const sp = createSulpakClient({
    minIntervalMs: STORE_RUN.spacingMs, jitterMs: STORE_RUN.jitterMs,
    beforeRequest: async () => { await gate(breaker); requests++; },
  });
  /** One request; null when it failed (counted on the breaker), "gone" for 404/410. */
  async function ask<T>(what: string, call: () => Promise<T>): Promise<T | "gone" | null> {
    try {
      const r = await call();
      breaker.record(true);
      return r;
    } catch (e) {
      if (e instanceof StoreRequestRefused) throw e;
      failed++;
      if (e instanceof SulpakHttpError && e.isGone) { breaker.record(true); return "gone"; }
      breaker.record(false, e instanceof SulpakHttpError && e.isBlocked, e instanceof SulpakParseError);
      console.error(`[sulpak] ${what}: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }
  const listingPrice = (i: { price: number | null; oldPrice: number | null; onOrder: boolean }) =>
    ({ price: i.price, oldPrice: i.oldPrice, inStock: !i.onOrder && i.price !== null });

  try {
    // 1. Prices for confirmed matches (and colour-only «похожий» ones), from the product page.
    for (const m of await matchesToPrice(sql, mid, STORE_RUN.sulpakPrices)) {
      const p = await ask<SulpakProduct>(m.slug, () => sp.fetchProduct(m.slug));
      if (p === "gone") { await setMatchStatus(sql, m.matchId, "rejected", "page gone"); continue; }
      if (!p) continue;
      if (p.sku !== m.sku) { await setMatchStatus(sql, m.matchId, "rejected", `item changed to ${p.sku}`); continue; }
      if (m.title && norm(p.title) !== norm(m.title)) {
        const why = mismatch(m.ourTitle, storeTokens(m.slug, p.title), p.title);
        if (why && !isSimilarReason(why)) { await setMatchStatus(sql, m.matchId, "rejected", why); continue; }
        if (why) await setMatchStatus(sql, m.matchId, "pending", why);
      }
      await saveStorePrice(sql, m.matchId, p);
      priced++;
    }

    // 2. The index: categories (monthly), then the due listings of the categories we hold.
    let cats = await storeCategories(sql, mid);
    // The category list: on the first run, then on the 1st of each month (new categories appear rarely).
    if (!cats.length || new Date().getUTCDate() === 1) {
      const list = await ask("category sitemap", () => sp.fetchCategories());
      if (list && list !== "gone") { await saveStoreCategories(sql, mid, list); cats = await storeCategories(sql, mid); }
    }
    const known = cats.map((c) => c.slug);
    const wanted = new Set<string>();
    for (const l of await ourLeafCategories(sql)) for (const c of sulpakCategoriesFor(l.leaf, known)) wanted.add(c);
    const due = cats.filter((c) => wanted.has(c.slug) && (!c.crawledAt || Date.now() - +c.crawledAt > STORE_INDEX.recrawlDays * 86_400_000));
    // Categories already half read first (resume), then in the order of our categories (tracked, most products).
    const order = [...wanted];
    due.sort((a, b) => (b.nextPage > 1 ? 1 : 0) - (a.nextPage > 1 ? 1 : 0) || order.indexOf(a.slug) - order.indexOf(b.slug));
    for (const c of due) {
      for (let page = c.nextPage; listings < STORE_RUN.sulpakListings; page++) {
        listings++;
        const r = await ask(`${c.slug} p${page}`, () => sp.fetchListing(c.slug, page));
        if (r === null) break;
        const res = r === "gone" ? { items: [], pages: page } : r;
        await saveListingPage(sql, mid, c.slug, page, res.pages, res.items);
        if (page >= res.pages || !res.items.length) break;
      }
      if (listings >= STORE_RUN.sulpakListings) break;
    }

    // 3. New matches, offline from the index.
    const items = await storeItems(sql, mid);
    const bySlug = new Map(items.map((i) => [i.slug, i]));
    const idx = storeIndex(items.map((i) => i.slug));
    for (const t of await productsToMatch(sql, mid)) {
      const slug = bestCandidate(t.title, idx, true);
      if (!slug) continue; // looked at again next run, when the index may have it
      const it = bySlug.get(slug)!;
      const why = mismatch(t.title, storeTokens(slug, it.title), it.title);
      const saved = await saveMatch(sql, { productId: t.productId, marketplaceId: mid, sku: it.sku, slug, title: it.title,
        method: "strict", status: !why ? "confirmed" : isSimilarReason(why) ? "pending" : "rejected", reason: why });
      matched++;
      // A fresh listing price prices the pair at once; otherwise the next run's product page does.
      const fresh = Date.now() - +it.seenAt < STORE_RUN.listingFreshHours * 3_600_000;
      if (fresh && (saved.status === "confirmed" || (why && isSimilarReason(why)))) { await saveStorePrice(sql, saved.id, listingPrice(it)); priced++; }
    }
  } catch (e) {
    if (!(e instanceof StoreRequestRefused)) throw e;
  } finally {
    const aborted = breaker.openReason;
    await finishStoreRun(sql, runId, { requests, priced, matched, failed, aborted });
    console.log(JSON.stringify({ store: SULPAK.code, requests, listings, priced, matched, failed, aborted }));
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => sql.end());
