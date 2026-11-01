import { toTenge, type Tenge } from "@baga/core";
import { KaspiOffersResponseSchema, KaspiCardSchema } from "./schema";

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
  offers: OfferSnapshot[]; // sorted by price ascending
  minPrice: Tenge | null;
  offerCount: number;
  inStock: boolean;
  fetchedAt: string;
}

export class KaspiParseError extends Error {
  constructor(message: string, readonly detail?: unknown) {
    super(message);
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

export function parseOffers(json: unknown): OfferSnapshot[] {
  const r = KaspiOffersResponseSchema.safeParse(json);
  if (!r.success) throw new KaspiParseError("Offers response did not match schema", r.error.issues.slice(0, 5));
  return r.data.offers
    .map((o) => ({
      sellerId: o.merchantId,
      sellerName: o.merchantName.replace(/\s+/g, " ").trim(),
      sellerRating: o.merchantRating ?? null,
      sellerReviews: o.merchantReviewsQuantity ?? null,
      price: toTenge(o.price),
      deliveryDuration: o.deliveryDuration ?? null,
      preorderDays: o.preorder ?? 0,
    }))
    .sort((a, b) => a.price - b.price);
}

/** Reads `BACKEND.components.item = {...}` from a product page. */
export function parseProductPage(html: string): { title: string; imageUrl: string | null; categoryPath: string[]; id: string } {
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
  };
}

export function buildSnapshot(
  page: ReturnType<typeof parseProductPage>,
  offers: OfferSnapshot[],
  now = new Date(),
): ProductSnapshot {
  return {
    marketplace: "kaspi",
    externalId: page.id,
    title: page.title,
    imageUrl: page.imageUrl,
    categoryPath: page.categoryPath,
    offers,
    minPrice: offers[0]?.price ?? null,
    offerCount: offers.length,
    inStock: offers.length > 0,
    fetchedAt: now.toISOString(),
  };
}
