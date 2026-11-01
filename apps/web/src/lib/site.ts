/**
 * The site's public base URL (no trailing slash), for metadata, canonical links, robots.txt and the sitemap.
 * Tolerates an empty SITE_URL or one without a scheme (an invalid value used to crash every page render),
 * then falls back to the production domain Vercel provides, then to localhost.
 */
export function siteUrl(env: Record<string, string | undefined> = process.env): string {
  for (const raw of [env.SITE_URL, env.VERCEL_PROJECT_PRODUCTION_URL]) {
    const v = raw?.trim();
    if (!v) continue;
    try {
      const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
      return u.origin;
    } catch {
      // not a usable URL: try the next source
    }
  }
  return "http://localhost:3000";
}
