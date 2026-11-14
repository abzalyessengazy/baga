import type postgres from "postgres";

/**
 * The in-house funnel (migration 0011, DECISIONS.md 2026-11-03 "In-house funnel instead of PostHog"): steps of one
 * visit joined by a per-tab random id, no cookie and no IP; since 11 Nov also an anonymous per-browser id (0025). And the "Вы купили?" answers on trackings.
 */
export const EVENT_NAMES = ["visit", "paste", "product_view", "track", "channel"] as const;
export type EventName = (typeof EVENT_NAMES)[number];
export interface FunnelEvent {
  name: EventName; sid: string; locale: "ru" | "kk" | null; device: "mobile" | "desktop" | null;
  source: string | null; externalId: string | null; detail: string | null;
  /** The browser's anonymous visitor id (migration 0025), null when storage is blocked. */
  vid?: string | null;
}

export async function addEvent(sql: postgres.Sql, e: FunnelEvent): Promise<void> {
  // A team browser's id (migration 0030) is never stored, even without its watcher cookie.
  await sql`insert into events (name, sid, vid, locale, device, source, external_id, detail)
    select ${e.name}, ${e.sid}, ${e.vid ?? null}, ${e.locale}, ${e.device}, ${e.source}, ${e.externalId}, ${e.detail}
    where ${e.vid ?? null}::text is null or not exists (select 1 from internal_visitors iv where iv.vid = ${e.vid ?? null})`;
}

/**
 * A real product view (DECISIONS.md, 2026-11-04 "Tracked first, real views, spread page refreshes"): only the
 * browser's product_view beacon marks a product viewed, which keeps it checked daily for 14 days. Server renders
 * (crawlers, link previews, prefetches) no longer count. Written at most once an hour per product.
 */
export async function markViewed(sql: postgres.Sql, externalId: string): Promise<void> {
  await sql`update products set last_viewed_at = now()
    where external_id = ${externalId} and (last_viewed_at is null or last_viewed_at < now() - interval '1 hour')`;
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
  /**
   * Hit rate (DECISIONS.md, 2026-11-03 "More products in the same Kaspi budget"): product pages opened (once per
   * visit and product), how many already had a price when opened, and how many had a week of history.
   */
  views: { total: number; priced: number; week: number };
  /** Account-based: people who started their alert list in the window, of them with Telegram or a confirmed email now. */
  accounts: { newPeople: number; connected: number };
}

/**
 * Visits (tabs) that reached each step in the last `days` Almaty days including today, counted once per visit: the
 * same window as /admin/business (docs/STATS.md, "KPI definitions"). Connecting alerts is account-based: people who
 * started their list in the window, and of them those with Telegram or a confirmed email now.
 */
export async function getFunnel(sql: postgres.Sql, days = 7): Promise<FunnelStats> {
  // A plain timestamp parameter: a shared sql`` fragment reused across parallel queries made postgres.js hang.
  const [w] = await sql<{ since: Date }[]>`
    select (((now() at time zone 'Asia/Almaty')::date - ${days - 1}::int)::timestamp at time zone 'Asia/Almaty') as since`;
  const since = w!.since;
  const steps = await sql<{ name: EventName; sessions: number }[]>`
    select name, count(distinct sid)::int as sessions from events where at > ${since} group by name`;
  const visits = (col: "locale" | "device" | "source") => sql<{ label: string; n: number }[]>`
    select coalesce(${sql(col)}, '—') as label, count(distinct sid)::int as n from events
    where at > ${since} and name = 'visit' group by 1 order by 2 desc limit 8`;
  // One at a time: more parallel queries than pool connections get pipelined, and the Supabase pooler then stalls.
  const byLocale = await visits("locale");
  const byDevice = await visits("device");
  const sources = await visits("source");
  const bought = await sql<{ answer: BoughtAnswer; n: number }[]>`select bought as answer, count(*)::int as n from trackings where bought is not null group by 1`;
  const [asked] = await sql<{ n: number }[]>`select count(*)::int as n from trackings where bought_asked_at is not null`;
  const [returned] = await sql<{ n: number }[]>`select count(*)::int as n from watchers where last_seen_at > created_at + interval '1 day'`;
  const [views] = await sql<{ total: number; priced: number; week: number }[]>`
    with v as (
      select distinct on (sid, external_id) external_id, at from events
      where at > ${since} and name = 'product_view' and external_id is not null order by sid, external_id, at)
    select count(*)::int as total,
           count(*) filter (where f.first < v.at)::int as priced,
           count(*) filter (where f.first < v.at - interval '7 days')::int as week
    from v left join lateral (
      select min(o.observed_at) as first from products p join price_observations o on o.product_id = p.id
      where p.external_id = v.external_id) f on true`;
  const [accounts] = await sql<{ newPeople: number; connected: number }[]>`
    select count(*)::int as "newPeople",
      count(*) filter (where telegram_chat_id is not null or email_confirmed_at is not null)::int as connected
    from watchers where created_at >= ${since}`;
  const by = new Map(steps.map((s) => [s.name, s.sessions]));
  return {
    accounts: accounts ?? { newPeople: 0, connected: 0 },
    days, steps: EVENT_NAMES.map((name) => ({ name, sessions: by.get(name) ?? 0 })),
    byLocale, byDevice, sources, bought, asked: asked!.n, returned: returned!.n,
    views: views ?? { total: 0, priced: 0, week: 0 },
  };
}

/**
 * A funnel step from a team browser (migration 0030): its browser id joins internal_visitors and every step it ever
 * stored is deleted, so the owner's own checks never count. True when the watcher is a team one.
 */
export async function dropTeamVisitor(sql: postgres.Sql, watcherId: string, vid: string | null): Promise<boolean> {
  const [w] = await sql<{ internal: boolean }[]>`select internal from watchers where id = ${watcherId}`;
  if (!w?.internal) return false;
  if (vid) {
    const r = await sql`insert into internal_visitors (vid) values (${vid}) on conflict do nothing`;
    if (r.count) await sql`delete from events where vid = ${vid}`;
  }
  return true;
}
