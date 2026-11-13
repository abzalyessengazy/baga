import "server-only";
import { liveShiftDay } from "@baga/core";
import { getDigest, getSql, type Digest } from "@baga/db";
import { cachedDaily } from "@/lib/dailyCache";

/**
 * Today's «Чек дня» numbers (packages/db/src/digest.ts), shared by /api/digest and the owner's slide page. One cache
 * entry per Almaty day and phase (check running or ended): the first request after the check ends is computed afresh
 * (13 Nov: a copy cached during the check said "complete": false for minutes after it ended).
 */
export function todayDigest(sql: NonNullable<ReturnType<typeof getSql>>, now = new Date()): Promise<Digest> {
  const phase = `${new Date(now.getTime() + 5 * 3_600_000).toISOString().slice(0, 10)}:${liveShiftDay(now) ? "live" : "settled"}`;
  return cachedDaily(["digest", phase], () => getDigest(sql, now));
}
