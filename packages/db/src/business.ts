import type postgres from "postgres";
import { PERSON_METRICS_FROM, personReliable } from "@baga/core";
import { alertStats, type AlertStats } from "./alertStats";

/**
 * The owner's business dashboard (/admin/business; DECISIONS.md, 2026-11-11 "Business dashboard"). Read-only
 * numbers for a period of Almaty days ending today, and for the period before it. Three kinds of numbers
 * (docs/STATS.md, "KPI definitions"; packages/core/src/metrics.ts):
 * - visit-based: browser tabs (events.sid) active in the period, all history from 3 Nov 2026;
 * - person-based: browsers (events.vid), null unless the period starts on or after PERSON_METRICS_FROM;
 * - account-based: watchers and trackings, exact for all history.
 * Nothing is estimated: a number the data cannot give is null.
 */
const TZ = "Asia/Almaty";

export interface BizTotals {
  /** Visit-based: tabs active in the period, and how many of them opened a product, pasted a link, started tracking. */
  visits: number; opened: number; pasted: number; tracked: number;
  /** Visit-based: tabs whose visit came with a utm_source (posts, campaigns). */
  fromPosts: number;
  /** Person-based (null before PERSON_METRICS_FROM): browsers, those with a research action, those seen before. */
  people: number | null; researchers: number | null; returning: number | null;
  /** Account-based: people who started their alert list in the period, of them with Telegram or a confirmed email now. */
  newPeople: number; newPeopleConnected: number;
  /** Account-based: trackings created in the period. */
  newTrackings: number;
}
export interface BizDay { day: string; visits: number; opened: number; tracked: number }
export interface BizSource { source: string; posts: boolean; visits: number; opened: number; tracked: number }
export interface BizSaving { title: string; externalId: string; start: number; alert: number; bought: "yes" | "later" | "no" | null; at: string }
export interface Business {
  days: number; from: string; to: string;
  /** The first day person-based numbers are reliable for (packages/core PERSON_METRICS_FROM). */
  personFrom: string;
  /** The first day with any event (visits were not counted before 3 Nov 2026). */
  countedSince: string | null;
  now: BizTotals;
  /** The period before; null unless visits were counted for all of it (a gap is not a zero). */
  before: BizTotals | null;
  daily: BizDay[];
  sources: BizSource[];
  /** Monthly Active Price Researchers (people with a research action) over the 30 days to today, counted from `since`
   * when fewer than 30 days have browser ids; null before PERSON_METRICS_FROM. */
  mapr: { n: number; since: string } | null;
  /** Paste outcomes in the period (the paste event's detail; "none" = sent before outcomes were recorded), and Kaspi app
   * links queued in the period that the collector could not resolve. */
  pastes: { outcome: string; n: number }[];
  linkFailures: number;
  people: { watchers: number; connected: number; returnedAfterADay: number };
  /** Notification numbers for the period (alertStats), and trackings created in the last 7 days (the target). */
  alerts: AlertStats & { trackings7d: number };
  bought: { yes: number; later: number; no: number; asked: number };
  removed: { bought: number; bought_elsewhere: number; changed_mind: number; price_never_dropped: number; none: number } | null;
  savings: { confirmed: number; confirmedCount: number; caught: number; caughtCount: number; rows: BizSaving[] };
}

const dayBefore = (d: string, n = 1) => new Date(Date.parse(`${d}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

/** Days are Almaty days; `days` ends today (today counts so far). */
export async function getBusiness(sql: postgres.Sql, days: number): Promise<Business> {
  const [range] = await sql<{ from: string; to: string }[]>`
    select to_char((now() at time zone ${TZ})::date - ${days - 1}::int, 'YYYY-MM-DD') as "from",
           to_char((now() at time zone ${TZ})::date, 'YYYY-MM-DD') as "to"`;
  const { from, to } = range!;
  const prevFrom = dayBefore(from, days), prevTo = dayBefore(from);
  const start = (d: string) => sql`(${d}::date::timestamp at time zone ${TZ})`;
  const end = (d: string) => sql`((${d}::date + 1)::timestamp at time zone ${TZ})`;

  const totals = async (a: string, b: string): Promise<BizTotals> => {
    const persons = personReliable(a);
    const [r] = await sql<(Omit<BizTotals, "people" | "researchers" | "returning"> & { people: number; researchers: number; returning: number })[]>`
      with e as (select name, sid, vid, source from events where at >= ${start(a)} and at < ${end(b)}),
      seen as (select distinct vid from events where vid is not null and at < ${start(a)})
      select count(distinct sid)::int as visits,
        count(distinct sid) filter (where name = 'product_view')::int as opened,
        count(distinct sid) filter (where name = 'paste')::int as pasted,
        count(distinct sid) filter (where name = 'track')::int as tracked,
        count(distinct sid) filter (where name = 'visit' and source is not null and source !~ '\\.' and source <> 'direct')::int as "fromPosts",
        count(distinct vid)::int as people,
        count(distinct vid) filter (where name in ('product_view', 'paste', 'track'))::int as researchers,
        count(distinct e.vid) filter (where e.vid in (select vid from seen))::int as returning,
        (select count(*) from watchers where not internal and created_at >= ${start(a)} and created_at < ${end(b)})::int as "newPeople",
        (select count(*) from watchers where not internal and created_at >= ${start(a)} and created_at < ${end(b)}
           and (telegram_chat_id is not null or email_confirmed_at is not null))::int as "newPeopleConnected",
        (select count(*) from trackings where watcher_id is not null and not exists (select 1 from watchers tw where tw.id = trackings.watcher_id and tw.internal) and created_at >= ${start(a)} and created_at < ${end(b)})::int as "newTrackings"
      from e`;
    return { ...r!, people: persons ? r!.people : null, researchers: persons ? r!.researchers : null, returning: persons ? r!.returning : null };
  };
  const [first] = await sql<{ day: string | null }[]>`
    select to_char(min((at at time zone ${TZ})::date), 'YYYY-MM-DD') as day from events`;
  const countedSince = first?.day ?? null;
  const now = await totals(from, to);
  const before = countedSince && prevFrom >= countedSince ? await totals(prevFrom, prevTo) : null;
  // Days before counting began are not shown as zeros.
  const chartFrom = countedSince && countedSince > from ? countedSince : from;

  const daily = await sql<BizDay[]>`
    with d as (select generate_series(${chartFrom}::date, ${to}::date, interval '1 day')::date as day),
    e as (select (at at time zone ${TZ})::date as day, name, sid from events where at >= ${start(from)} and at < ${end(to)})
    select to_char(d.day, 'YYYY-MM-DD') as day,
      count(distinct e.sid)::int as visits,
      count(distinct e.sid) filter (where e.name = 'product_view')::int as opened,
      count(distinct e.sid) filter (where e.name = 'track')::int as tracked
    from d left join e on e.day = d.day group by d.day order by d.day`;

  // Each visit's source, then what that tab went on to do (visit-based).
  const sources = await sql<BizSource[]>`
    with v as (select distinct on (sid) sid, coalesce(source, 'direct') as source from events
               where name = 'visit' and at >= ${start(from)} and at < ${end(to)} order by sid, at),
    s as (select sid, bool_or(name = 'product_view') as opened, bool_or(name = 'track') as tracked from events
          where at >= ${start(from)} and at < ${end(to)} group by sid)
    select v.source, (v.source !~ '\\.' and v.source <> 'direct') as posts,
      count(*)::int as visits, count(*) filter (where s.opened)::int as opened, count(*) filter (where s.tracked)::int as tracked
    from v left join s on s.sid = v.sid group by v.source order by 3 desc limit 20`;

  const maprSince = [dayBefore(to, 29), PERSON_METRICS_FROM].sort()[1]!;
  const mapr = personReliable(to) ? await sql<{ n: number }[]>`
    select count(distinct vid)::int as n from events
    where vid is not null and name in ('product_view', 'paste', 'track') and at >= ${start(maprSince)} and at < ${end(to)}`
    .then((r) => ({ n: r[0]?.n ?? 0, since: maprSince })) : null;

  const pastes = await sql<{ outcome: string; n: number }[]>`
    select coalesce(detail, 'none') as outcome, count(*)::int as n from events
    where name = 'paste' and at >= ${start(from)} and at < ${end(to)} group by 1 order by 2 desc`;
  const [links] = await sql<{ n: number }[]>`
    select count(*)::int as n from short_link_queue where status = 'failed' and added_at >= ${start(from)} and added_at < ${end(to)}`;

  const [people] = await sql<Business["people"][]>`
    select count(*)::int as watchers,
      count(*) filter (where telegram_chat_id is not null or email_confirmed_at is not null)::int as connected,
      count(*) filter (where last_seen_at > created_at + interval '1 day')::int as "returnedAfterADay"
    from watchers where not internal`;
  const [bounds] = await sql<{ a: Date; b: Date }[]>`select ${start(from)} as a, ${end(to)} as b`;
  const stats = await alertStats(sql, { from: bounds!.a, to: bounds!.b });
  const [t7] = await sql<{ n: number }[]>`
    select count(*)::int as n from trackings where watcher_id is not null and not exists (select 1 from watchers tw where tw.id = trackings.watcher_id and tw.internal) and created_at > now() - interval '7 days'`;
  const [bought] = await sql<Business["bought"][]>`
    select count(*) filter (where bought = 'yes')::int as yes, count(*) filter (where bought = 'later')::int as later,
      count(*) filter (where bought = 'no')::int as no, count(*) filter (where bought_asked_at is not null)::int as asked
    from trackings where watcher_id is not null and not exists (select 1 from watchers tw where tw.id = trackings.watcher_id and tw.internal)`;
  // «Почему убираете?» (migration 0026): null before the migration.
  const removed = await sql<NonNullable<Business["removed"]>[]>`
    select count(*) filter (where removed_reason = 'bought')::int as bought,
      count(*) filter (where removed_reason = 'bought_elsewhere')::int as bought_elsewhere,
      count(*) filter (where removed_reason = 'changed_mind')::int as changed_mind,
      count(*) filter (where removed_reason = 'price_never_dropped')::int as price_never_dropped,
      count(*) filter (where removed_reason is null)::int as none
    from trackings where status = 'removed' and not exists (select 1 from watchers tw where tw.id = trackings.watcher_id and tw.internal) and removed_at >= ${start(from)} and removed_at < ${end(to)}`
    .then((r) => r[0] ?? null).catch(() => null);

  // Same rule as the daily report: start price when tracking began (else the first after), alert price the lowest a
  // target alert reported; "saved" only where the person answered «Да, купил». All time, newest first, one row per
  // tracking (several messages for one tracking are one product).
  const rows = await sql<BizSaving[]>`
    with hit as (
      select n.tracking_id, min(n.price) as alert, max(n.sent_at) as at from notifications n
      where n.type = 'target_reached' and n.status = 'sent' group by n.tracking_id)
    select p.title, p.external_id as "externalId", h.alert::int, t.bought, to_char(h.at at time zone ${TZ}, 'YYYY-MM-DD') as at,
      coalesce(
        (select o.min_price from price_observations o where o.product_id = t.product_id and o.observed_at <= t.created_at
           and o.min_price is not null order by o.observed_at desc limit 1),
        (select o.min_price from price_observations o where o.product_id = t.product_id and o.observed_at > t.created_at
           and o.min_price is not null order by o.observed_at limit 1))::int as start
    from hit h join trackings t on t.id = h.tracking_id join products p on p.id = t.product_id
    where not exists (select 1 from watchers tw where tw.id = t.watcher_id and tw.internal)
    order by h.at desc limit 50`;
  const real = rows.filter((r) => r.start > r.alert);
  const confirmed = real.filter((r) => r.bought === "yes");
  return {
    days, from, to, personFrom: PERSON_METRICS_FROM, countedSince, now, before, daily, sources, mapr,
    pastes, linkFailures: links?.n ?? 0, people: people!, alerts: { ...stats, trackings7d: t7?.n ?? 0 }, bought: bought!, removed,
    savings: {
      confirmed: confirmed.reduce((s, r) => s + r.start - r.alert, 0), confirmedCount: confirmed.length,
      caught: real.reduce((s, r) => s + r.start - r.alert, 0), caughtCount: real.length, rows: real,
    },
  };
}
