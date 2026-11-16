/**
 * Target price presets on the coupon: "drops by 5–10%", "10–25%", "25% or more". A preset alerts as soon as the
 * drop enters its range, so the target is the current price minus the range's smaller percentage, rounded down
 * to a round number (never a smaller drop than promised).
 */
export const DROP_PRESETS = [
  { from: 5, to: 10 },
  { from: 10, to: 25 },
  { from: 25, to: null },
] as const;

/** The target price for a drop of at least `pct` percent from `current`. Null when nothing sensible is left. */
export function targetForDrop(current: number, pct: number): number | null {
  const raw = (current * (100 - pct)) / 100;
  const step = current >= 100_000 ? 1_000 : current >= 10_000 ? 100 : 10;
  const t = Math.floor(raw / step) * step;
  return t > 0 && t < current ? t : null;
}

/**
 * The deepest drop a target may ask for (the owner, 16 Nov 2026: «Покупатель 9563» set 6 ₸ on a 724 999 ₸ phone and
 * topped the board with 724 993 ₸ «хочет сэкономить»). A target below this share of today's price is refused, and
 * such targets set earlier do not count in any «хочет сэкономить» sum.
 */
export const MAX_DROP_PCT = 80;
/** The lowest target allowed for this price, rounded up to whole tenge. */
export const minTarget = (current: number): number => Math.ceil((current * (100 - MAX_DROP_PCT)) / 100);
export const targetTooLow = (current: number, target: number): boolean => target < minTarget(current);
