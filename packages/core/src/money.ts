/** Money is always an integer number of tenge. Never floats, never strings in storage. */
export type Tenge = number;

export function toTenge(value: number): Tenge {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid price: ${value}`);
  return Math.round(value);
}

const NNBSP = " "; // narrow no-break space between digit groups
const NBSP = " "; // keeps "₸" on the same line as the number

/**
 * "749 364 ₸". Formatted by hand: Intl data for kk-KZ differs between Node and browsers,
 * which breaks React hydration. Both locales group the same way.
 */
export function formatTenge(value: Tenge, _locale: "ru" | "kk" = "ru"): string {
  const n = String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP);
  return `${n}${NBSP}₸`;
}

export function percentDiff(from: Tenge, to: Tenge): number {
  if (from === 0) return 0;
  return ((to - from) / from) * 100;
}
