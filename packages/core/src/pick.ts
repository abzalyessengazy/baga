/**
 * «Находка дня» (owner, 11 Nov 2026: the same product stayed for 3–4 days, and it repeated another block). One of
 * the week's best drops (rule W), a different one each day: the best PICK.rotate eligible drops in turn. Never a
 * product the home page already shows: the week's biggest drop («Подешевел сильнее всех за неделю») and the day
 * list's visible rows (`shown`). Only drops of PICK.minPct or more on products from PICK.minPrice; the caller skips
 * a product whose cheapest offer needs a seller check. Fresh first (the owner, 15 Nov: «we 2nd day reporting the
 * same products»): a week's drop that also fell since yesterday (`fresh`, the day list) leads, biggest first; the
 * rotation of the rest follows.
 */
export const PICK = { minPct: 10, minPrice: 5_000, rotate: 5 } as const;

export interface PickCandidate { externalId: string; now: number; pct: number }

/** Days since 1970 for an Almaty day "YYYY-MM-DD": the rotation step. */
export function dayIndex(day: string): number {
  return Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
}

/** Candidates in the order to try: the day's turn first, then the rest of the rotation. */
export function pickOrder<T extends PickCandidate>(week: T[], day: string, shown: readonly string[] = [], fresh: readonly string[] = []): T[] {
  const skip = new Set([week[0]?.externalId, ...shown]);
  const isFresh = new Set(fresh);
  const eligible = week.filter((m) => !skip.has(m.externalId) && m.now >= PICK.minPrice && m.pct <= -PICK.minPct);
  const first = eligible.filter((m) => isFresh.has(m.externalId));
  const pool = eligible.filter((m) => !isFresh.has(m.externalId)).slice(0, PICK.rotate);
  const start = pool.length ? dayIndex(day) % pool.length : 0;
  return [...first, ...pool.slice(start), ...pool.slice(0, start)];
}
