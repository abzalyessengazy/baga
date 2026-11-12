import { unstable_cache } from "next/cache";
import { dailyCacheSeconds } from "@baga/core";

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
 * Server-side cache for pages that read many rows (/shops, /explore): the same result for up to 15 minutes, never
 * past the end of the day's collection (as dailyCacheControl), so numbers stay in step with the home page. The
 * value must be plain JSON (no Dates).
 */
export function cachedDaily<T>(key: string[], load: () => Promise<T>, now = new Date()): Promise<T> {
  const revalidate = Math.max(60, Math.min(900, dailyCacheSeconds(now)));
  return unstable_cache(load, ["daily", ...key], { revalidate })();
}
