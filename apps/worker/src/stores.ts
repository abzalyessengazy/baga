/**
 * Other stores' prices for exactly matched Kaspi products (DECISIONS.md, 2026-11-07; CLAUDE.md rule 6a). Technodom
 * only for now. Runs after Kaspi's Visit-time has closed, so it never shares a minute with a Kaspi request:
 * 08:46–12:00 UTC (13:46–17:00 Almaty), started by .github/workflows/stores.yml.
 *   1. Prices: confirmed matches whose last price is 20 h+ old, people's products first (one page each).
 *   2. Matching: Kaspi products never checked against Technodom get a candidate from the product sitemap (offline,
 *      packages/core/src/matching.ts); its page decides: exact (Technodom's Kaspi link is our product), strict (every
 *      rule holds on Technodom's own title), «похожий» when only the colour differs, else rejected (another product).
 * One request at a time, ≥11 s apart, honest User-Agent; the first 403/429 stops the run (its own circuit breaker).
 * By hand: `pnpm --filter @baga/worker stores --now` (any time outside Kaspi's Visit-time).
 */
import postgres from "postgres";
import { KASPI_VISIT_WINDOW_UTC, bestCandidate, looseCandidates, mismatch, storeIndex, storeTokens, kaspiColour } from "@baga/core";
import {
  connectionOptions, isSimilarReason, storeMarketplaceId, productsToMatch, productsSoldOnKaspiBy, productIdByExternal, exactTitleForSku, saveMatch, matchesToPrice, saveStorePrice,
  setMatchStatus, startStoreRun, finishStoreRun,
} from "@baga/db";
import { createTechnodomClient, TECHNODOM, TechnodomHttpError, TechnodomParseError, StoreRequestRefused, skuOf, type TechnodomProduct } from "@baga/stores";
import { env } from "./env";
import { CircuitBreaker } from "./breaker";

export const STORE_RUN = {
  /** Minutes of the UTC day: from right after Kaspi's Visit-time to 12:00 UTC. */
  startMinute: KASPI_VISIT_WINDOW_UTC.endMinute + 1,
  endMinute: 12 * 60,
  spacingMs: 11_000,
  jitterMs: 2_000,
  prices: 500,
  /** New candidate pages per run (the first runs work through the whole catalog over a few days). */
  matchPages: 150,
} as const;

const minute = (d = new Date()) => d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
// `--now`: a run started by hand outside the daily window, still never during Kaspi's Visit-time (+ a minute either side).
const manual = process.argv.includes("--now");
const inKaspiTime = () => minute() >= KASPI_VISIT_WINDOW_UTC.startMinute - 1 && minute() <= KASPI_VISIT_WINDOW_UTC.endMinute;
const inWindow = () => (manual ? !inKaspiTime() : minute() >= STORE_RUN.startMinute && minute() < STORE_RUN.endMinute - 1);
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

const sql = postgres(env.databaseUrl(), { max: 2, ...connectionOptions(env.databaseUrl()) });

async function main() {
  if (!inWindow()) {
    console.log(JSON.stringify({ skipped: "outside the store window (08:46-12:00 UTC)" }));
    return;
  }
  const mid = await storeMarketplaceId(sql, TECHNODOM.code);
  const runId = await startStoreRun(sql, mid);
  const breaker = new CircuitBreaker();
  let requests = 0, priced = 0, matched = 0, failed = 0;
  const td = createTechnodomClient({
    minIntervalMs: STORE_RUN.spacingMs, jitterMs: STORE_RUN.jitterMs,
    beforeRequest: () => {
      if (breaker.openReason) throw new StoreRequestRefused(breaker.openReason);
      if (!inWindow()) throw new StoreRequestRefused("outside the store window");
      requests++;
    },
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

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => sql.end());
