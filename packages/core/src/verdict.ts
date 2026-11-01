import type { Tenge } from "./money";

/** One observed daily lowest price. Only observed values, never interpolated. */
export interface DailyLow {
  day: string; // YYYY-MM-DD
  price: Tenge;
}

export type VerdictKind = "insufficient" | "low" | "typical" | "high";

export interface Verdict {
  kind: VerdictKind;
  current: Tenge;
  observedDays: number;
  windowDays: number;
  min: Tenge | null;
  minDay: string | null;
  max: Tenge | null;
  /** Typical range: 20th to 70th percentile of the window. */
  typicalLow: Tenge | null;
  typicalHigh: Tenge | null;
  /** Share of observed days in the window that were more expensive than today (0..1). */
  cheaperThanShare: number | null;
  /** % above the median, for "high". */
  aboveMedianPct: number | null;
}

export const VERDICT_CONFIG = {
  minObservedDays: 14,
  windowDays: 60,
  lowPercentile: 0.2,
  highPercentile: 0.7,
} as const;

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) throw new Error("percentile of empty list");
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const a = sorted[lo]!;
  const b = sorted[hi]!;
  return Math.round(a + (b - a) * (idx - lo));
}

/**
 * Descriptive verdict: compares today's price with what BAGA has actually observed.
 * It never predicts future prices.
 */
export function computeVerdict(history: DailyLow[], current: Tenge, cfg = VERDICT_CONFIG): Verdict {
  const days = [...history].sort((a, b) => a.day.localeCompare(b.day));
  const window = days.slice(-cfg.windowDays);
  const base: Verdict = {
    kind: "insufficient",
    current,
    observedDays: days.length,
    windowDays: window.length,
    min: null,
    minDay: null,
    max: null,
    typicalLow: null,
    typicalHigh: null,
    cheaperThanShare: null,
    aboveMedianPct: null,
  };
  if (window.length === 0) return base;

  let minEntry = window[0]!;
  for (const d of window) if (d.price < minEntry.price) minEntry = d;
  const prices = window.map((d) => d.price).sort((a, b) => a - b);
  base.min = minEntry.price;
  base.minDay = minEntry.day;
  base.max = prices[prices.length - 1]!;

  if (days.length < cfg.minObservedDays) return base;

  const pLow = percentile(prices, cfg.lowPercentile);
  const pHigh = percentile(prices, cfg.highPercentile);
  const median = percentile(prices, 0.5);
  base.typicalLow = pLow;
  base.typicalHigh = pHigh;
  base.cheaperThanShare = prices.filter((p) => p > current).length / prices.length;
  base.aboveMedianPct = median > 0 ? Math.round(((current - median) / median) * 100) : 0;

  if (current <= pLow) base.kind = "low";
  else if (current > pHigh) base.kind = "high";
  else base.kind = "typical";
  return base;
}
