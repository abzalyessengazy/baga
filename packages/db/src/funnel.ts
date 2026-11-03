import type postgres from "postgres";

/**
 * The in-house funnel (migration 0011, DECISIONS.md 2026-11-03 "In-house funnel instead of PostHog"): steps of one
 * visit joined by a per-tab random id, no cookie and no IP. And the "Вы купили?" answers on trackings.
 */
export const EVENT_NAMES = ["visit", "paste", "product_view", "track", "channel"] as const;
export type EventName = (typeof EVENT_NAMES)[number];
export interface FunnelEvent {
  name: EventName; sid: string; locale: "ru" | "kk" | null; device: "mobile" | "desktop" | null;
  source: string | null; externalId: string | null; detail: string | null;
}

export async function addEvent(sql: postgres.Sql, e: FunnelEvent): Promise<void> {
  await sql`insert into events (name, sid, locale, device, source, external_id, detail)
    values (${e.name}, ${e.sid}, ${e.locale}, ${e.device}, ${e.source}, ${e.externalId}, ${e.detail})`;
}

export const BOUGHT_ANSWERS = ["yes", "later", "no"] as const;
export type BoughtAnswer = (typeof BOUGHT_ANSWERS)[number];
export interface BoughtTarget { trackingId: string; title: string | null; externalId: string | null; locale: "ru" | "kk"; bought: BoughtAnswer | null }

/** The tracking an email or Telegram "Вы купили?" link points at. */
export async function getBoughtByCode(sql: postgres.Sql, code: string): Promise<BoughtTarget | null> {
  const [r] = await sql<BoughtTarget[]>`
    select t.id as "trackingId", p.title, t.external_id as "externalId", w.locale, t.bought
    from trackings t join watchers w on w.id = t.watcher_id left join products p on p.id = t.product_id
    where t.bought_code = ${code}`;
  return r ?? null;
}

/**
 * Records the answer, by the link's code or by this browser's watcher. "yes" ends the tracking (status done), so
 * no more alerts come for something already bought; the other answers keep it running.
 */
export async function answerBought(sql: postgres.Sql, by: { code: string } | { watcherId: string; trackingId: string }, answer: BoughtAnswer): Promise<BoughtTarget | null> {
  const [r] = await sql<BoughtTarget[]>`
    update trackings t set bought = ${answer}, bought_at = now(),
      status = case when ${answer} = 'yes' then 'done' else t.status end
    from watchers w
    where w.id = t.watcher_id and ${"code" in by
      ? sql`t.bought_code = ${by.code}`
      : sql`t.id = ${by.trackingId} and t.watcher_id = ${by.watcherId}`}
    returning t.id as "trackingId", (select title from products where id = t.product_id) as title,
      t.external_id as "externalId", w.locale, t.bought`;
  return r ?? null;
}

export interface FunnelStats {
  days: number;
  steps: { name: EventName; sessions: number }[];
  byLocale: { label: string; n: number }[];
  byDevice: { label: string; n: number }[];
  sources: { label: string; n: number }[];
  bought: { answer: BoughtAnswer; n: number }[];
  asked: number;
  /** Watchers seen again a day or more after they first tracked something. */
  returned: number;
}

/** Visits that reached each step in the last `days` days, counted once per visit. */
export async function getFunnel(sql: postgres.Sql, days = 7): Promise<FunnelStats> {
  const since = sql`now() - make_interval(days => ${days})`;
  const steps = await sql<{ name: EventName; sessions: number }[]>`
    select name, count(distinct sid)::int as sessions from events where at > ${since} group by name`;
  const visits = (col: "locale" | "device" | "source") => sql<{ label: string; n: number }[]>`
    select coalesce(${sql(col)}, '—') as label, count(distinct sid)::int as n from events
    where at > ${since} and name = 'visit' group by 1 order by 2 desc limit 8`;
  const [byLocale, byDevice, sources, bought, [asked], [returned]] = await Promise.all([
    visits("locale"), visits("device"), visits("source"),
    sql<{ answer: BoughtAnswer; n: number }[]>`select bought as answer, count(*)::int as n from trackings where bought is not null group by 1`,
    sql<{ n: number }[]>`select count(*)::int as n from trackings where bought_asked_at is not null`,
    sql<{ n: number }[]>`select count(*)::int as n from watchers where last_seen_at > created_at + interval '1 day'`,
  ]);
  const by = new Map(steps.map((s) => [s.name, s.sessions]));
  return {
    days, steps: EVENT_NAMES.map((name) => ({ name, sessions: by.get(name) ?? 0 })),
    byLocale, byDevice, sources, bought, asked: asked!.n, returned: returned!.n,
  };
}
