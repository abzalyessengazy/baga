import { parseOffers, parseProductPage, buildSnapshot, type ProductSnapshot } from "./snapshot";
import { canonicalProductUrl } from "./url";

/**
 * Kaspi's lowest price is national (checked 1 Nov 2026 across 6 cities), so one reference city is enough.
 * Almaty = 750000000.
 */
export const REFERENCE_CITY_ID = "750000000";

export interface KaspiClientOptions {
  fetch?: typeof fetch;
  userAgent?: string;
  timeoutMs?: number;
  cityId?: string;
  /**
   * Minimum gap between the starts of any two requests made by this client (robots.txt Crawl-delay).
   * The worker sets KASPI_CRAWL_DELAY_MS; the web app's single on-demand lookups leave it at 0.
   */
  minIntervalMs?: number;
  /** Extra random wait, 0..jitterMs, added to each gap. */
  jitterMs?: number;
  /** Injectable clock for tests. */
  clock?: { now: () => number; sleep: (ms: number) => Promise<void>; random?: () => number };
}

export class KaspiHttpError extends Error {
  constructor(readonly status: number, readonly url: string) {
    super(`Kaspi responded ${status} for ${url}`);
    this.name = "KaspiHttpError";
  }
  /** 403/429 mean "slow down or blocked" and must trip the circuit breaker. */
  get isBlocking() {
    return this.status === 403 || this.status === 429;
  }
  get isNotFound() {
    return this.status === 404;
  }
}

export function createKaspiClient(opts: KaspiClientOptions = {}) {
  const f = opts.fetch ?? fetch;
  const cityId = opts.cityId ?? REFERENCE_CITY_ID;
  // Exactly the headers verified to work from a KZ connection on 1 Nov 2026 (scripts/probe-kaspi.mjs).
  // A User-Agent containing a URL was stalled by Kaspi without any response.
  const ua = opts.userAgent ?? process.env.KASPI_USER_AGENT ?? "BAGA price history bot (+contact: hello@baga.app)";
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const minIntervalMs = opts.minIntervalMs ?? 0;
  const jitterMs = opts.jitterMs ?? 0;
  const clock = opts.clock ?? { now: () => Date.now(), sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) };
  const random = clock.random ?? Math.random;
  let nextAllowedAt = 0;
  let queue: Promise<void> = Promise.resolve();

  /** Serialises requests and spaces their starts by minIntervalMs (+ jitter). */
  function gate(): Promise<void> {
    if (minIntervalMs <= 0) return Promise.resolve();
    const turn = queue.then(async () => {
      const wait = nextAllowedAt - clock.now();
      if (wait > 0) await clock.sleep(wait);
      nextAllowedAt = clock.now() + minIntervalMs + Math.round(random() * jitterMs);
    });
    queue = turn.catch(() => {});
    return turn;
  }

  async function request(url: string, init: RequestInit = {}) {
    await gate();
    const res = await f(url, {
      ...init,
      headers: { "User-Agent": ua, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new KaspiHttpError(res.status, url);
    return res;
  }

  async function fetchOffers(productId: string, limit = 50) {
    const res = await request(`https://kaspi.kz/yml/offer-view/offers/${productId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/*",
        "X-KS-City": cityId,
        Referer: canonicalProductUrl(productId),
      },
      body: JSON.stringify({
        cityId,
        id: productId,
        merchantUID: [],
        limit,
        page: 0,
        sortOption: "PRICE",
        highRating: null,
        searchText: null,
        isExcellentMerchant: false,
        zoneId: [],
        installationId: "-1",
      }),
    });
    return parseOffers(await res.json());
  }

  async function fetchProductPage(productId: string) {
    const res = await request(`${canonicalProductUrl(productId)}?c=${cityId}`, { headers: { Accept: "text/html" } });
    return parseProductPage(await res.text());
  }

  async function fetchSnapshot(productId: string): Promise<ProductSnapshot> {
    const page = await fetchProductPage(productId);
    const offers = await fetchOffers(productId);
    return buildSnapshot(page, offers);
  }

  /** Follows l.kaspi.kz short links to the product URL without downloading the page body. */
  async function resolveShortLink(url: string): Promise<string | null> {
    await gate();
    const res = await f(url, { method: "HEAD", redirect: "manual", headers: { "User-Agent": ua } });
    return res.headers.get("location");
  }

  return { fetchOffers, fetchProductPage, fetchSnapshot, resolveShortLink };
}

export type KaspiClient = ReturnType<typeof createKaspiClient>;
