import type { DailyLow } from "./verdict";
import type { Tenge } from "./money";

/**
 * Sale periods (Almaty dates, inclusive). `end: null` while the sale is running and its end is not known yet.
 * Names live in messages (`sale.<id>`). Add a sale here when its dates are known.
 */
export interface SaleEvent { id: string; start: string; end: string | null }
export const SALE_EVENTS: SaleEvent[] = [
  { id: "kaspiJuma202611", start: "2026-11-05", end: "2026-11-07" },
  { id: "singlesDay2026", start: "2026-11-11", end: "2026-11-11" },
];

export const SALE_CONFIG = {
  /** Days before the start that make the baseline, and how many of them must be observed. */
  beforeDays: 14, minBeforeDays: 2,
  /** Differences under this many percent count as "the same price". */
  samePct: 3,
  /** How long after the end the check is still shown, and how far "after" looks. */
  showDaysAfter: 30, afterDays: 14,
} as const;

export type SaleKind = "cheaper" | "same" | "pricier" | "noBaseline";
export interface SaleCheck {
  saleId: string; ongoing: boolean;
  duringLow: Tenge; duringDays: number;
  before: { low: Tenge; days: number } | null;
  /** duringLow against the lowest price before the sale, in percent (negative = cheaper). */
  beforePct: number | null;
  kind: SaleKind;
  /** The latest price after the sale ended, against duringLow. */
  after: { price: Tenge; day: string; pct: number } | null;
}

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const pct = (a: number, b: number) => Math.round(((a - b) / b) * 100);

/**
 * What our own observations say about a sale: the lowest price during it, against the lowest price in the two
 * weeks before (only when we watched at least 3 of those days), and the latest price after it. Describes the
 * past only. Null when we saw no price during the sale, or the sale is too far away.
 */
export function saleCheck(history: DailyLow[], sale: SaleEvent, today: string, cfg = SALE_CONFIG): SaleCheck | null {
  if (today < sale.start) return null;
  const end = sale.end ?? today;
  if (today > addDays(end, cfg.showDaysAfter)) return null;
  const during = history.filter((d) => d.day >= sale.start && d.day <= end);
  if (during.length === 0) return null;
  const duringLow = Math.min(...during.map((d) => d.price));
  const beforeDays = history.filter((d) => d.day >= addDays(sale.start, -cfg.beforeDays) && d.day < sale.start);
  const before = beforeDays.length >= cfg.minBeforeDays ? { low: Math.min(...beforeDays.map((d) => d.price)), days: beforeDays.length } : null;
  const beforePct = before ? pct(duringLow, before.low) : null;
  const kind: SaleKind = beforePct === null ? "noBaseline"
    : beforePct <= -cfg.samePct ? "cheaper" : beforePct >= cfg.samePct ? "pricier" : "same";
  const ongoing = sale.end === null || today <= sale.end;
  const afterDays = ongoing ? [] : history.filter((d) => d.day > end && d.day <= addDays(end, cfg.afterDays));
  const last = afterDays.at(-1);
  return {
    saleId: sale.id, ongoing, duringLow, duringDays: during.length, before, beforePct, kind,
    after: last ? { price: last.price, day: last.day, pct: pct(last.price, duringLow) } : null,
  };
}

/** The check for the most recent sale that has one. */
export function latestSaleCheck(history: DailyLow[], today: string, sales = SALE_EVENTS): SaleCheck | null {
  for (const s of [...sales].sort((a, b) => b.start.localeCompare(a.start))) {
    const c = saleCheck(history, s, today);
    if (c) return c;
  }
  return null;
}

/** Today's date in Almaty (YYYY-MM-DD): the calendar day the sales and the daily history use. */
export const almatyDay = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty" }).format(d);

/** The next sale starting within `withinDays` days (not today), if any: announced before it starts. */
export function upcomingSale(today: string, withinDays = 14, sales = SALE_EVENTS): SaleEvent | null {
  const limit = addDays(today, withinDays);
  return [...sales].sort((a, b) => a.start.localeCompare(b.start)).find((s) => s.start > today && s.start <= limit) ?? null;
}

/** The sale running today, if any. */
export function runningSale(today: string, sales = SALE_EVENTS): SaleEvent | null {
  return sales.find((s) => s.start <= today && (s.end === null || today <= s.end)) ?? null;
}
