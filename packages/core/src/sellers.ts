/**
 * Shop labels (DECISIONS.md, 2026-11-05 "Shop evidence, not verdicts"). They describe Kaspi's own numbers and what
 * BAGA observed; they never call a shop honest or dishonest. Kaspi shows 0 for a shop nobody rated yet, so 0 and
 * missing values are "no rating", never a low one. The thresholds are provisional, set against the 862 shops seen
 * by 5 Nov 2026 (median rating 4.8, median 103 reviews); a change to them bumps SELLER_RULES.version.
 */
export const SELLER_RULES = {
  version: 1,
  /** Fewer reviews than this: too few to call the rating high or low. */
  enoughReviews: 20,
  highRating: 4.8,
  lowRating: 4.0,
  /** Confidence-adjusted rating (the "rated sellers first" order): a prior of priorRating worth priorReviews reviews. */
  priorRating: 4.5,
  priorReviews: 50,
  /** An offer this far below the median of the other sellers' prices is pointed out (2+ other sellers needed). */
  cheapOutlierPct: 30,
  cheapOutlierMinOthers: 2,
  /** Review growth is shown only over a span of at least this many days of BAGA's own daily records. */
  growthMinDays: 7,
} as const;

export type SellerLabel = "high" | "mixed" | "low" | "few" | "none";

const known = (rating: number | null | undefined, reviews: number | null | undefined) =>
  rating != null && reviews != null && rating > 0 && reviews > 0;

/** One label from Kaspi's rating and review count. */
export function sellerLabel(rating: number | null | undefined, reviews: number | null | undefined): SellerLabel {
  if (!known(rating, reviews)) return "none";
  if (reviews! < SELLER_RULES.enoughReviews) return "few";
  if (rating! >= SELLER_RULES.highRating) return "high";
  if (rating! < SELLER_RULES.lowRating) return "low";
  return "mixed";
}

/**
 * Rating pulled towards priorRating by priorReviews imaginary reviews, so one perfect review cannot outrank
 * hundreds of good ones. A shop without a rating sorts last (null).
 */
export function adjustedRating(rating: number | null | undefined, reviews: number | null | undefined): number | null {
  if (!known(rating, reviews)) return null;
  const { priorRating: c, priorReviews: m } = SELLER_RULES;
  return (rating! * reviews! + c * m) / (reviews! + m);
}

/** Offers ordered by adjustedRating (highest first), then price; shops without a rating last. Stable copy. */
export function byRating<T extends { price: number; sellerRating: number | null; sellerReviews: number | null }>(offers: T[]): T[] {
  return offers
    .map((o, i) => ({ o, i, r: adjustedRating(o.sellerRating, o.sellerReviews) }))
    .sort((a, b) => (b.r ?? -1) - (a.r ?? -1) || a.o.price - b.o.price || a.i - b.i)
    .map((x) => x.o);
}

/**
 * How many percent `price` is below the median of the OTHER sellers' prices for the same product, when that is
 * SELLER_RULES.cheapOutlierPct or more; null otherwise. `others` excludes the offer itself.
 */
export function cheapOutlierPct(price: number, others: number[]): number | null {
  if (others.length < SELLER_RULES.cheapOutlierMinOthers) return null;
  const s = [...others].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const median = s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
  if (median <= 0) return null;
  const pct = Math.floor(((median - price) / median) * 100);
  return pct >= SELLER_RULES.cheapOutlierPct ? pct : null;
}

/** cheapOutlierPct for every offer of one product, each against all the others. */
export function cheapOutliers(prices: number[]): (number | null)[] {
  return prices.map((p, i) => cheapOutlierPct(p, prices.filter((_, j) => j !== i)));
}

/**
 * New Kaspi reviews between the first and the last of BAGA's daily records (oldest first), when they span
 * growthMinDays or more; null otherwise. A falling count (Kaspi removed reviews) is reported as it is.
 */
export function reviewGrowth(days: { day: string; reviews: number | null }[]): { added: number; days: number; since: string } | null {
  const k = days.filter((d) => d.reviews != null && d.reviews > 0);
  if (k.length < 2) return null;
  const first = k[0]!;
  const last = k[k.length - 1]!;
  const span = Math.round((Date.parse(last.day) - Date.parse(first.day)) / 86_400_000);
  if (span < SELLER_RULES.growthMinDays) return null;
  return { added: last.reviews! - first.reviews!, days: span, since: first.day };
}

/** Purchase feedback from BAGA users (migration 0016), and how many answers a shop needs before it is shown. */
export const SHOP_FEEDBACK = { outcomes: ["ok", "late", "not_as_described", "not_delivered"] as const, minToShow: 5 };
export type ShopFeedbackOutcome = (typeof SHOP_FEEDBACK.outcomes)[number];
