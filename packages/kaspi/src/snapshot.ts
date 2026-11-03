import { toTenge, type Tenge } from "@baga/core";
import { KaspiOffersResponseSchema, KaspiOfferSchema, KaspiCardSchema } from "./schema";

export interface OfferSnapshot {
  sellerId: string;
  sellerName: string;
  sellerRating: number | null;
  sellerReviews: number | null;
  price: Tenge;
  deliveryDuration: string | null;
  /** Kaspi's `preorder` is the number of days before the seller ships (0 = in stock). Still a real offer. */
  preorderDays: number;
}

export interface ProductSnapshot {
  marketplace: "kaspi";
  externalId: string;
  title: string;
  imageUrl: string | null;
  categoryPath: string[];
  /** Kaspi's review count and rating from the product page; null when the page was not fetched or has none. */
  reviews: number | null;
  rating: number | null;
  offers: OfferSnapshot[]; // sorted by price ascending
  minPrice: Tenge | null;
  offerCount: number;
  inStock: boolean;
  fetchedAt: string;
}

export class KaspiParseError extends Error {
  constructor(message: string, readonly detail?: unknown) {
    // The detail goes into the message so the collector's log line says which field failed.
    super(detail === undefined ? message : `${message}: ${JSON.stringify(detail).slice(0, 400)}`);
    this.name = "KaspiParseError";
  }
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#43;/g, "+")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * Kaspi's offers response, sorted by price. A seller entry without a usable id or price is skipped (it has no
 * price to show); if every entry is unusable the response is rejected, with the failing fields in `detail`.
 */
export function parseOffers(json: unknown): OfferSnapshot[] {
  const r = KaspiOffersResponseSchema.safeParse(json);
  if (!r.success) {
    const keys = json && typeof json === "object" ? Object.keys(json).slice(0, 10) : typeof json;
    throw new KaspiParseError("Offers response did not match schema", { keys, issues: r.error.issues.slice(0, 5) });
  }
  const parsed = r.data.offers.map((o) => KaspiOfferSchema.safeParse(o));
  const good = parsed.flatMap((p) => (p.success ? [p.data] : []));
  if (parsed.length > 0 && good.length === 0) {
    const bad = parsed.find((p) => !p.success);
    throw new KaspiParseError("No usable offers in response", { offers: parsed.length, issues: bad && !bad.success ? bad.error.issues.slice(0, 5) : [] });
  }
  return good
    .map((o) => ({
      sellerId: o.merchantId,
      sellerName: (o.merchantName ?? "").replace(/\s+/g, " ").trim() || o.merchantId,
      sellerRating: o.merchantRating ?? null,
      sellerReviews: o.merchantReviewsQuantity ?? null,
      price: toTenge(o.price),
      deliveryDuration: o.deliveryDuration ?? null,
      preorderDays: o.preorder ?? 0,
    }))
    .sort((a, b) => a.price - b.price);
}

/** Reads `BACKEND.components.item = {...}` from a product page. */
export interface ProductPage { id: string; title: string; imageUrl: string | null; categoryPath: string[]; reviews?: number | null; rating?: number | null }

export function parseProductPage(html: string): ProductPage {
  const marker = "BACKEND.components.item = ";
  const i = html.indexOf(marker);
  if (i < 0) throw new KaspiParseError("Product data block not found");
  const rest = html.slice(i + marker.length);
  const line = rest.slice(0, rest.indexOf("\n")).trim().replace(/;$/, "");
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch (e) {
    throw new KaspiParseError("Product data block is not valid JSON", String(e));
  }
  const r = KaspiCardSchema.safeParse(raw);
  if (!r.success) throw new KaspiParseError("Product data did not match schema", r.error.issues.slice(0, 5));
  const d = r.data;
  return {
    id: d.card.id,
    title: decodeEntities(d.card.title),
    imageUrl: d.galleryImages?.[0]?.large ?? d.galleryImages?.[0]?.medium ?? null,
    categoryPath: (d.breadcrumbs ?? []).filter((b) => b.id !== "Categories").map((b) => b.title),
    reviews: d.card.reviewsQuantity ?? null,
    rating: d.card.rating ?? null,
  };
}

export function buildSnapshot(
  page: ProductPage,
  offers: OfferSnapshot[],
  now = new Date(),
): ProductSnapshot {
  return {
    marketplace: "kaspi",
    externalId: page.id,
    title: page.title,
    imageUrl: page.imageUrl,
    categoryPath: page.categoryPath,
    reviews: page.reviews ?? null,
    rating: page.rating ?? null,
    offers,
    minPrice: offers[0]?.price ?? null,
    offerCount: offers.length,
    inStock: offers.length > 0,
    fetchedAt: now.toISOString(),
  };
}
