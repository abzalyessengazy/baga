import type postgres from "postgres";

/**
 * Price checks a visitor asks for outside the collector's window (DECISIONS.md 2026-11-09; CLAUDE.md rule 6,
 * migration 0020): only a product a visitor brought that we have never checked, after Turnstile. A small extra on
 * top of the daily budget (the collector's minutes are not touched), paced like every Kaspi request.
 */
export const MANUAL_CHECKS = {
  /** In all, per Almaty day. */
  perDay: 40,
  /** Per visitor (daily-rotating IP hash), per Almaty day. */
  perVisitor: 3,
  /** The first 403/429 pauses manual checks this long. */
  pauseDays: 7,
} as const;

const almatyToday = (sql: postgres.Sql) => sql`(now() at time zone 'Asia/Almaty')::date`;
const isToday = (sql: postgres.Sql) => sql`(requested_at at time zone 'Asia/Almaty')::date = ${almatyToday(sql)}`;

export type ManualRequest = "queued" | "already" | "day_cap" | "visitor_cap" | "paused";

/** When manual checks resume after a block, or null. */
export async function manualPausedUntil(sql: postgres.Sql): Promise<Date | null> {
  const [r] = await sql<{ until: Date | null }[]>`
    select max(finished_at) + make_interval(days => ${MANUAL_CHECKS.pauseDays}) as until from manual_checks
    where status = 'blocked' and finished_at > now() - make_interval(days => ${MANUAL_CHECKS.pauseDays})`;
  return r?.until ?? null;
}

/** Records a visitor's request within the caps. One open request per product; the caps hold under concurrency. */
export async function requestManualCheck(sql: postgres.Sql, externalId: string, requester: string): Promise<ManualRequest> {
  return sql.begin(async (tx) => {
    // One request at a time decides on the caps (a transaction-scoped lock works through the pooler).
    await tx`select pg_advisory_xact_lock(hashtext('manual_checks'))`;
    if (await manualPausedUntil(tx as unknown as postgres.Sql)) return "paused";
    const [open] = await tx`select 1 from manual_checks where external_id = ${externalId} and status = 'queued'`;
    if (open) return "already";
    const [n] = await tx<{ all: number; mine: number }[]>`
      select count(*)::int as all, count(*) filter (where requester = ${requester})::int as mine
      from manual_checks where ${isToday(tx as unknown as postgres.Sql)} and status <> 'collector'`;
    if ((n?.all ?? 0) >= MANUAL_CHECKS.perDay) return "day_cap";
    if ((n?.mine ?? 0) >= MANUAL_CHECKS.perVisitor) return "visitor_cap";
    await tx`insert into manual_checks (external_id, requester) values (${externalId}, ${requester})`;
    return "queued";
  });
}

/** The product page's view of a queued product: is a manual check under way, or did today's caps stop it? */
export async function manualCheckState(sql: postgres.Sql, externalId: string): Promise<"running" | null> {
  const [r] = await sql`select 1 from manual_checks where external_id = ${externalId} and status = 'queued'
    and requested_at > now() - interval '30 minutes'`;
  return r ? "running" : null;
}

/** For the worker: open requests, oldest first. */
export async function queuedManualChecks(sql: postgres.Sql, limit = 10) {
  return sql<{ id: number; externalId: string }[]>`
    select id, external_id as "externalId" from manual_checks where status = 'queued' order by requested_at limit ${limit}`;
}

export async function finishManualCheck(sql: postgres.Sql, id: number, status: "done" | "failed" | "blocked" | "collector", error: string | null = null) {
  await sql`update manual_checks set status = ${status}, finished_at = now(), error = ${error?.slice(0, 500) ?? null} where id = ${id}`;
}

/** /admin: today's manual checks and the pause. */
export async function manualToday(sql: postgres.Sql) {
  const [r] = await sql<{ requested: number; done: number; failed: number }[]>`
    select count(*) filter (where status <> 'collector')::int as requested, count(*) filter (where status = 'done')::int as done,
           count(*) filter (where status in ('failed', 'blocked'))::int as failed
    from manual_checks where ${isToday(sql)}`;
  return { ...r!, cap: MANUAL_CHECKS.perDay, pausedUntil: await manualPausedUntil(sql) };
}
