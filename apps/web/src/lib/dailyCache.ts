import { secondsUntilShiftEnds } from "@baga/core";

/**
 * Cache-Control for numbers that change once a day: the CDN keeps a copy for up to an hour, but never past the moment
 * the day's collection completes (docs/STATS.md, "Shift"), so the new day appears for everyone at once.
 */
export function dailyCacheControl(now = new Date()): string {
  const age = Math.max(30, Math.min(3600, secondsUntilShiftEnds(now)));
  return `public, s-maxage=${age}, stale-while-revalidate=60`;
}
