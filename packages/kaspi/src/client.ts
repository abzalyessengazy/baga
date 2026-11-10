import { parseOffers, parseProductPage, buildSnapshot, type ProductSnapshot } from "./snapshot";
import { canonicalProductUrl } from "./url";
import { gunzipSync } from "node:zlib";
import { isKaspiSitemapUrl, parseSitemap } from "./sitemap";

/**
 * Kaspi's lowest price is national for most goods (checked 1 Nov 2026 across 6 cities), so one reference city is
 * enough: Almaty = 750000000. Pharmacy and baby care are sold by local shops (10 Nov 2026 probe): for those the
 * collector also asks fetchOffers with another city's id (packages/core/src/cities.ts).
 */
export const REFERENCE_CITY_ID = "750000000";

export interface KaspiClientOptions {
  fetch?: typeof fetch;
  userAgent?: string;
  timeoutMs?: number;
  cityId?: string;
  /**
   * Minimum gap between the starts of any two requests made by this client (robots.txt Crawl-delay).
   * The worker sets KASPI_CRAWL_DELAY_MS; the web app (short-link resolution only) leaves it at 0.
   */
  minIntervalMs?: number;
  /** Extra random wait, 0..jitterMs, added to each gap. */
  jitterMs?: number;
  /**
   * Called after the pacing wait, right before each request is sent. It throws (KaspiRequestRefused) to stop a
   * request the caller may no longer make: the visit window closed while it waited, or the circuit breaker opened.
   */
  beforeRequest?: () => void;
  /** Injectable clock for tests. */
  clock?: { now: () => number; sleep: (ms: number) => Promise<void>; random?: () => number };
}

/** Thrown by a beforeRequest guard: the request was never sent, so it says nothing about the product. */
export class KaspiRequestRefused extends Error {
  constructor(reason: string) {
    super(`request not sent: ${reason}`);
    this.name = "KaspiRequestRefused";
  }
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
    opts.beforeRequest?.();
    const res = await f(url, {
      ...init,
      headers: { "User-Agent": ua, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new KaspiHttpError(res.status, url);
    return res;
  }

  /** The sellers list; `city` overrides the client's city for this request (city-dependent goods only). */
  async function fetchOffers(productId: string, limit = 50, city = cityId) {
    const res = await request(`https://kaspi.kz/yml/offer-view/offers/${productId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/*",
        "X-KS-City": city,
        Referer: canonicalProductUrl(productId),
      },
      body: JSON.stringify({
        cityId: city,
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
  /**
   * Where an l.kaspi.kz short link points. A plain GET that does not follow the redirect (the body is never
   * read), exactly what a browser sends when the visitor taps the link. Throws with the status on failure.
   */
  async function resolveShortLink(url: string): Promise<string | null> {
    await gate();
    opts.beforeRequest?.();
    const res = await f(url, { method: "GET", redirect: "manual", headers: { "User-Agent": ua, Accept: "text/html" }, signal: AbortSignal.timeout(timeoutMs) });
    await res.body?.cancel().catch(() => undefined);
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) return new URL(location, url).toString();
    throw new KaspiHttpError(res.status, url);
  }

  /** A sitemap file from kaspi.kz/shop/ (robots.txt lists the index). Gzipped files are unpacked. */
  async function fetchSitemap(url: string) {
    if (!isKaspiSitemapUrl(url)) throw new Error(`not a Kaspi sitemap URL: ${url}`);
    const res = await request(url, { headers: { Accept: "application/xml, text/xml" } });
    const buf = Buffer.from(await res.arrayBuffer());
    const gz = buf[0] === 0x1f && buf[1] === 0x8b;
    return parseSitemap((gz ? gunzipSync(buf) : buf).toString("utf8"));
  }

  return { fetchOffers, fetchProductPage, fetchSnapshot, resolveShortLink, fetchSitemap };
}

export type KaspiClient = ReturnType<typeof createKaspiClient>;
