/**
 * Tells the website which product pages have new data (DECISIONS.md 2026-11-17 "Fewer cache writes"): product pages
 * are cached for a day, and a page whose product was just checked is rebuilt on its next visit. Signed with a key
 * derived from TELEGRAM_BOT_TOKEN, which the site and the workers already share. Never fails a run: a page that
 * misses the signal is a day old at most.
 */
import { createHash, createHmac } from "node:crypto";
import type postgres from "postgres";

export function refreshSignature(botToken: string, body: string): string {
  const key = createHash("sha256").update(`baga-revalidate:${botToken}`).digest();
  return createHmac("sha256", key).update(body).digest("hex");
}

export async function refreshPages(siteUrl: string, botToken: string | null, ids: string[], fetchImpl: typeof fetch = fetch): Promise<number> {
  if (!botToken || !ids.length) return 0;
  let sent = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const body = JSON.stringify({ ids: ids.slice(i, i + 200), ts: Date.now() });
    try {
      const res = await fetchImpl(`${siteUrl}/api/revalidate-products`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Baga-Signature": refreshSignature(botToken, body) },
        body, signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) sent += Math.min(200, ids.length - i);
      else console.error(`site refresh: ${res.status}`);
    } catch (e) { console.error(`site refresh: ${e}`); }
  }
  return sent;
}

/** Every product checked since `since` (any source), so its page shows the new check. */
export function checkedSince(sql: postgres.Sql, since: Date) {
  return sql<{ external_id: string }[]>`select p.external_id from product_state s join products p on p.id = s.product_id
    where s.last_checked_at >= ${since}`.then((r) => r.map((x) => x.external_id));
}
