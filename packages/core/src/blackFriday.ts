/**
 * «Чёрная пятница: проверяем скидки» (the owner, 15 Nov 2026: «go with black friday»). Kaspi takes no part in Black
 * Friday (its own sale, Kaspi Жұма, was 5–8 Nov); Technodom and Sulpak do. For products we priced in both a store and
 * Kaspi, the store's lowest price during the sale is set against its own lowest price in the two weeks before, and
 * against Kaspi now. Observed prices only (CLAUDE.md rule 2): no baseline, no verdict. Describes the past, never a
 * forecast. Pure, no I/O.
 */
export const BLACK_FRIDAY = {
  /** Almaty dates, inclusive: Black Friday to Cyber Monday 2026. */
  start: "2026-11-27", end: "2026-11-30",
  /** The page stays up this long after the end, with the results. */
  showUntil: "2026-12-14",
  /** Days before the start that make the store's baseline, and how many must be observed. */
  beforeDays: 14, minBeforeDays: 3,
  /** Differences under this many percent count as "the same price". */
  samePct: 3,
  /** Only products from this price: the page is about big purchases. */
  minPrice: 50_000,
  /** Every product with a fair comparison (18 Nov: 348 pairs; the owner: «i dont want to keep black friday to 48
   * products only»). The page shows `shown` first, the rest one tap away. */
  rows: 500,
  shown: 50,
} as const;

export type SalePhase = "before" | "during" | "after";
export function salePhase(today: string, cfg = BLACK_FRIDAY): SalePhase | null {
  if (today < cfg.start) return "before";
  if (today <= cfg.end) return "during";
  return today <= cfg.showUntil ? "after" : null;
}

export interface StoreDay { day: string; price: number; oldPrice: number | null }

/**
 * real: the sale price is at least samePct below the store's lowest price in the two weeks before.
 * same: within samePct of it (a «discount» against a crossed-out price the store did not really charge lately).
 * pricier: above it. noBaseline: fewer than minBeforeDays observed days before. pending: the sale has not started or
 * no price was seen during it yet.
 */
export type StoreSaleKind = "real" | "same" | "pricier" | "noBaseline" | "pending";
export interface StoreSaleCheck {
  kind: StoreSaleKind;
  /** The store's lowest observed price in the two weeks before the sale, and on how many days we saw it. */
  before: { low: number; days: number } | null;
  /** The store's lowest observed price during the sale, and the crossed-out price it showed then (if any). */
  during: { low: number; oldPrice: number | null } | null;
  /** during.low against before.low, in percent (negative = cheaper). */
  pct: number | null;
  /** The discount the store itself claimed during the sale (crossed-out against its price), in percent. */
  claimedPct: number | null;
}

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const pctOf = (a: number, b: number) => Math.round(((a - b) / b) * 100);

export function storeSaleCheck(history: StoreDay[], today: string, cfg = BLACK_FRIDAY): StoreSaleCheck {
  const beforeRows = history.filter((d) => d.day >= addDays(cfg.start, -cfg.beforeDays) && d.day < cfg.start && d.day <= today);
  const before = beforeRows.length >= cfg.minBeforeDays ? { low: Math.min(...beforeRows.map((d) => d.price)), days: beforeRows.length } : null;
  const duringRows = today < cfg.start ? [] : history.filter((d) => d.day >= cfg.start && d.day <= cfg.end && d.day <= today);
  if (!duringRows.length) return { kind: "pending", before, during: null, pct: null, claimedPct: null };
  const low = duringRows.reduce((a, b) => (b.price < a.price ? b : a));
  const during = { low: low.price, oldPrice: low.oldPrice && low.oldPrice > low.price ? low.oldPrice : null };
  const claimedPct = during.oldPrice ? pctOf(during.low, during.oldPrice) : null;
  if (!before) return { kind: "noBaseline", before, during, pct: null, claimedPct };
  const pct = pctOf(during.low, before.low);
  const kind: StoreSaleKind = pct <= -cfg.samePct ? "real" : pct >= cfg.samePct ? "pricier" : "same";
  return { kind, before, during, pct, claimedPct };
}
