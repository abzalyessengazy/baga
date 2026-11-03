/**
 * The one rule for "the price changed" (docs/STATS.md). Prices are compared as daily lows: the lowest price a
 * product had on an Almaty calendar day. A difference under MOVE_MIN_PCT of the earlier price is not a change
 * (sellers nudge prices by a few tenge all the time).
 */
export const MOVE_MIN_PCT = 1;

/** -1 = cheaper, 1 = dearer, 0 = no change by MOVE_MIN_PCT. */
export function moveDirection(was: number, now: number, minPct = MOVE_MIN_PCT): -1 | 0 | 1 {
  if (was <= 0 || Math.abs(now - was) * 100 < minPct * was) return 0;
  return now < was ? -1 : 1;
}
