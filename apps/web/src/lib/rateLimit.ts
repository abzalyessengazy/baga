// Best-effort per-instance limiter. Phase 3 adds Cloudflare Turnstile for anonymous lookups of new products.
const hits = new Map<string, number[]>();
export function allow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) { hits.set(key, list); return false; }
  list.push(now);
  hits.set(key, list);
  return true;
}
