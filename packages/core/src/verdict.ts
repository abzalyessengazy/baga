import type { Tenge } from "./money";

/** One observed daily lowest price. Only observed values, never interpolated. */
export interface DailyLow {
  day: string; // YYYY-MM-DD
  price: Tenge;
}

export type VerdictKind = "insufficient" | "low" | "typical" | "high" | "stable";

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
  /** "low": today is the lowest price of the window (or within lowTolerancePct of it). */
  atLow: boolean;
}

/**
 * 7 Nov 2026 (owner): the stamp said «Мало данных» on every product because it waited for 14 days. Now it speaks
 * from 3 observed days, always naming how many days it is based on, and describes only the past (CLAUDE.md rule 2):
 * stable (the whole window within ±stablePct), low (at the window's lowest, or at/below the 20th percentile),
 * high (above the 70th percentile and highMinPct+ above the median), else typical.
 */
export const VERDICT_CONFIG = {
  minObservedDays: 3,
  windowDays: 60,
  lowPercentile: 0.2,
  highPercentile: 0.7,
  /** Every observed day within this % of the window's lowest: «Цена стабильна». */
  stablePct: 2,
  /** Within this % of the window's lowest still counts as the low. */
  lowTolerancePct: 1,
  /** "high" needs at least this % above the median (a 70th percentile a few tenge above it is no news). */
  highMinPct: 3,
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
    atLow: false,
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

  const lowest = Math.min(base.min, current);
  const highest = Math.max(base.max, current);
  base.atLow = current <= base.min * (1 + cfg.lowTolerancePct / 100);
  if (highest <= lowest * (1 + cfg.stablePct / 100)) base.kind = "stable";
  else if (base.atLow || current <= pLow) base.kind = "low";
  else if (current > pHigh && current >= median * (1 + cfg.highMinPct / 100)) base.kind = "high";
  else base.kind = "typical";
  return base;
}
