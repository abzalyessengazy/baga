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

  async function request(url: string, init: RequestInit = {}) {
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
    const res = await f(url, { method: "HEAD", redirect: "manual", headers: { "User-Agent": ua } });
    return res.headers.get("location");
  }

  return { fetchOffers, fetchProductPage, fetchSnapshot, resolveShortLink };
}

export type KaspiClient = ReturnType<typeof createKaspiClient>;
