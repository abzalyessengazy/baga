import type postgres from "postgres";
import { KASPI_CRAWL_DELAY_MS } from "@baga/core";

/**
 * The website's short-link request to l.kaspi.kz (CLAUDE.md rule 6), spaced like the collector's across every Vercel
 * instance: a request may go only when the last one is KASPI_CRAWL_DELAY_MS old and no block is recorded (migration
 * 0041). Claiming records the request at once, so two visitors a second apart cannot both send one.
 */
export async function claimWebKaspiRequest(sql: postgres.Sql): Promise<boolean> {
  const rows = await sql`
    update web_kaspi_gate set last_request_at = now()
    where id = 1 and (last_request_at is null or last_request_at <= now() - make_interval(secs => ${KASPI_CRAWL_DELAY_MS / 1000}))
      and (blocked_until is null or blocked_until <= now())
    returning id`;
  return rows.length > 0;
}

/** Kaspi answered 403 or 429: the website sends no short-link request for a day; links wait for the collector. */
export async function recordWebKaspiBlock(sql: postgres.Sql, status: number): Promise<void> {
  await sql`update web_kaspi_gate set blocked_until = now() + interval '1 day', blocked_status = ${status} where id = 1`;
}
