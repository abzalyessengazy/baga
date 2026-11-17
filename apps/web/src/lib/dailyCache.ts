import { unstable_cache } from "next/cache";
import { dailyCacheSeconds, secondsUntilShiftEnds } from "@baga/core";

/**
 * Cache-Control for numbers that change once a day: the CDN keeps a copy for up to an hour, but never past the moment
 * the day's collection completes (docs/STATS.md, "Shift"), so the new day appears for everyone at once; while today
 * is being checked (the live day), 5 minutes.
 */
export function dailyCacheControl(now = new Date()): string {
  const age = Math.max(30, Math.min(3600, dailyCacheSeconds(now)));
  return `public, s-maxage=${age}, stale-while-revalidate=60`;
}

/**
 * Server-side cache for pages that read many rows (/shops, /explore): one copy a day, refreshed when the day's
 * collection completes (08:45 UTC), so each list is written to the cache once a day (DECISIONS.md 2026-11-17 "Fewer
 * cache writes"; it was every 15 minutes). The value must be plain JSON (no Dates).
 */
export function cachedDaily<T>(key: string[], load: () => Promise<T>, now = new Date()): Promise<T> {
  const revalidate = Math.max(60, secondsUntilShiftEnds(now));
  return unstable_cache(load, ["daily", ...key], { revalidate })();
}
