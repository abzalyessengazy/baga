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
