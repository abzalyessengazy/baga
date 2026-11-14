/** Money is always an integer number of tenge. Never floats, never strings in storage. */
export type Tenge = number;

export function toTenge(value: number): Tenge {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid price: ${value}`);
  return Math.round(value);
}

/**
 * A full no-break space between digit groups since 14 Nov 2026 (the owner: big numbers looked merged). The narrow one
 * (U+202F) almost vanished in bold Onest at display sizes ("24990 ₸", "2120").
 */
const GROUP = " ";
const NBSP = " "; // keeps "₸" on the same line as the number

/** "2 120": a count grouped like prices, without the currency. */
export function formatCount(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, GROUP);
}

/**
 * "749 364 ₸". Formatted by hand: Intl data for kk-KZ differs between Node and browsers,
 * which breaks React hydration. Both locales group the same way.
 */
export function formatTenge(value: Tenge, _locale: "ru" | "kk" = "ru"): string {
  return `${formatCount(value)}${NBSP}₸`;
}

export function percentDiff(from: Tenge, to: Tenge): number {
  if (from === 0) return 0;
  return ((to - from) / from) * 100;
}
