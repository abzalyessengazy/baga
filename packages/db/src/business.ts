import type postgres from "postgres";
import { addDays, PERSON_METRICS_FROM, periodRange, type DayRange, type Period, type PeriodKey } from "@baga/core";
import { alertStats, type AlertStats } from "./alertStats";

/**
 * The owner's business dashboard (/admin/business; DECISIONS.md, 2026-11-11 "Business dashboard"). Read-only
 * numbers for a calendar period of Almaty days (packages/core periods.ts: today 00:00–23:59, Monday–Sunday, calendar
 * month and year; the owner, 14 Nov 2026), and for the period of the same kind before it. Three kinds of numbers
 * (docs/STATS.md, "KPI definitions"; packages/core/src/metrics.ts):
 * - visit-based: browser tabs (events.sid) active in the period, all history from 3 Nov 2026;
 * - visitor-based: distinct browsers (events.vid), counted from PERSON_METRICS_FROM (browser ids are reliable from
 *   then; a period starting earlier counts its visitors from that day, and says so); null for a period ending before;
 * - account-based: watchers and trackings, exact for all history.
 * Nothing is estimated: a number the data cannot give is null.
 */
const TZ = "Asia/Almaty";

export interface BizTotals {
  /** Visit-based: tabs active in the period, and how many of them opened a product, pasted a link, started tracking. */
  visits: number; opened: number; pasted: number; tracked: number;
  /** Visit-based: tabs whose visit came with a utm_source (posts, campaigns). */
  fromPosts: number;
  /** Visitor-based (distinct browsers; null for a period ending before PERSON_METRICS_FROM): all, those with a
   * research action, those seen before, and those who opened a product, pasted a link, started tracking. */
  people: number | null; researchers: number | null; returning: number | null;
  pOpened: number | null; pPasted: number | null; pTracked: number | null;
  /** Account-based: people who started their alert list in the period, of them with Telegram or a confirmed email now. */
  newPeople: number; newPeopleConnected: number;
  /** Account-based: trackings created in the period. */
  newTrackings: number;
}
/** One bar of the chart: a day, or a month (YYYY-MM-01) for a year. `people` is null before PERSON_METRICS_FROM. */
export interface BizDay { day: string; visits: number; people: number | null; opened: number; tracked: number }
/** Products opened by the most distinct visitors in the period. */
export interface BizTopProduct { title: string; externalId: string; people: number; views: number }
/** The most active visitors (anonymous browser ids, shortened): visits, active days, products opened, started tracking. */
export interface BizVisitor { id: string; visits: number; days: number; products: number; tracked: boolean }
export interface BizSource { source: string; posts: boolean; visits: number; people: number; opened: number; tracked: number }
export interface BizSaving { title: string; externalId: string; start: number; alert: number; bought: "yes" | "later" | "no" | null; at: string }
export interface Business {
  period: Period;
  from: string; to: string;
  /** The first day person-based numbers are reliable for (packages/core PERSON_METRICS_FROM). */
  personFrom: string;
  /** Visitors in this period are counted from this day (the period's start, or PERSON_METRICS_FROM when later). */
  peopleFrom: string;
  /** The first day with any event (visits were not counted before 3 Nov 2026). */
  countedSince: string | null;
  now: BizTotals;
  /** The period before; null unless visits were counted for all of it (a gap is not a zero). */
  before: BizTotals | null;
  daily: BizDay[];
  sources: BizSource[];
  topProducts: BizTopProduct[];
  /** Visitors by how many visits they made in the period: 1, 2, 3–5, 6+. */
  frequency: { visits: "1" | "2" | "3-5" | "6+"; people: number }[];
  topVisitors: BizVisitor[];
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

/** Today in Almaty (YYYY-MM-DD). */
export async function almatyToday(sql: postgres.Sql): Promise<string> {
  const [r] = await sql<{ d: string }[]>`select to_char((now() at time zone ${TZ})::date, 'YYYY-MM-DD') as d`;
  return r!.d;
}

/** The last 7 days to today (the weekly targets), as a period compared with the 7 days before. */
export function lastSevenDays(today: string): Period {
  return { key: "week", from: addDays(today, -6), to: today, prev: { from: addDays(today, -13), to: addDays(today, -7) }, running: true, upTo: today, bucket: "day" };
}

/** A calendar period by key (as seen today in Almaty), or a ready Period. */
export async function getBusiness(sql: postgres.Sql, which: PeriodKey | Period): Promise<Business> {
  const period = typeof which === "string" ? periodRange(which, await almatyToday(sql)) : which;
  const { from, to } = period;
  const start = (d: string) => sql`(${d}::date::timestamp at time zone ${TZ})`;
  const end = (d: string) => sql`((${d}::date + 1)::timestamp at time zone ${TZ})`;
  const peopleFrom = from < PERSON_METRICS_FROM ? PERSON_METRICS_FROM : from;

  const totals = async ({ from: a, to: b }: DayRange): Promise<BizTotals> => {
    const pa = a < PERSON_METRICS_FROM ? PERSON_METRICS_FROM : a;
    const persons = b >= PERSON_METRICS_FROM;
    const [r] = await sql<(BizTotals & { people: number; researchers: number; returning: number; pOpened: number; pPasted: number; pTracked: number })[]>`
      with e as (select name, sid, vid, source, at from events where at >= ${start(a)} and at < ${end(b)}),
      p as (select name, vid from e where vid is not null and at >= ${start(pa)}),
      seen as (select distinct vid from events where vid is not null and at < ${start(pa)})
      select count(distinct sid)::int as visits,
        count(distinct sid) filter (where name = 'product_view')::int as opened,
        count(distinct sid) filter (where name = 'paste')::int as pasted,
        count(distinct sid) filter (where name = 'track')::int as tracked,
        count(distinct sid) filter (where name = 'visit' and source is not null and source !~ '\\.' and source <> 'direct')::int as "fromPosts",
        (select count(distinct vid) from p)::int as people,
        (select count(distinct vid) from p where name in ('product_view', 'paste', 'track'))::int as researchers,
        (select count(distinct vid) from p where vid in (select vid from seen))::int as returning,
        (select count(distinct vid) from p where name = 'product_view')::int as "pOpened",
        (select count(distinct vid) from p where name = 'paste')::int as "pPasted",
        (select count(distinct vid) from p where name = 'track')::int as "pTracked",
        (select count(*) from watchers where not internal and created_at >= ${start(a)} and created_at < ${end(b)})::int as "newPeople",
        (select count(*) from watchers where not internal and created_at >= ${start(a)} and created_at < ${end(b)}
           and (telegram_chat_id is not null or email_confirmed_at is not null))::int as "newPeopleConnected",
        (select count(*) from trackings where watcher_id is not null and not exists (select 1 from watchers tw where tw.id = trackings.watcher_id and tw.internal) and created_at >= ${start(a)} and created_at < ${end(b)})::int as "newTrackings"
      from e`;
    const nul = (n: number) => (persons ? n : null);
    return { ...r!, people: nul(r!.people), researchers: nul(r!.researchers), returning: nul(r!.returning),
      pOpened: nul(r!.pOpened), pPasted: nul(r!.pPasted), pTracked: nul(r!.pTracked) };
  };
  const [first] = await sql<{ day: string | null }[]>`
    select to_char(min((at at time zone ${TZ})::date), 'YYYY-MM-DD') as day from events`;
  const countedSince = first?.day ?? null;
  const now = await totals(period);
  const before = countedSince && period.prev.from >= countedSince ? await totals(period.prev) : null;
  // Days before counting began, and days still to come, are not shown as zeros.
  const chartFrom = countedSince && countedSince > from ? countedSince : from;
  const unit = period.bucket;

  const daily = chartFrom > period.upTo ? [] : (await sql<(Omit<BizDay, "people"> & { people: number })[]>`
    with d as (select generate_series(date_trunc(${unit}, ${chartFrom}::date), ${period.upTo}::date, ${unit === "month" ? sql`interval '1 month'` : sql`interval '1 day'`})::date as day),
    e as (select date_trunc(${unit}, (at at time zone ${TZ})::date)::date as day, name, sid, vid, at from events where at >= ${start(chartFrom)} and at < ${end(period.upTo)})
    select to_char(d.day, 'YYYY-MM-DD') as day,
      count(distinct e.sid)::int as visits,
      count(distinct e.vid) filter (where e.at >= ${start(PERSON_METRICS_FROM)})::int as people,
      count(distinct e.sid) filter (where e.name = 'product_view')::int as opened,
      count(distinct e.sid) filter (where e.name = 'track')::int as tracked
    from d left join e on e.day = d.day group by d.day order by d.day`)
    .map((x) => ({ ...x, people: (unit === "month" ? x.day.slice(0, 7) >= PERSON_METRICS_FROM.slice(0, 7) : x.day >= PERSON_METRICS_FROM) ? x.people : null }));

  // Each visit's source, then what that tab went on to do (visit-based).
  const sources = await sql<BizSource[]>`
    with v as (select distinct on (sid) sid, coalesce(source, 'direct') as source from events
               where name = 'visit' and at >= ${start(from)} and at < ${end(to)} order by sid, at),
    s as (select sid, max(vid) as vid, bool_or(name = 'product_view') as opened, bool_or(name = 'track') as tracked from events
          where at >= ${start(from)} and at < ${end(to)} group by sid)
    select v.source, (v.source !~ '\\.' and v.source <> 'direct') as posts,
      count(*)::int as visits, count(distinct s.vid)::int as people,
      count(*) filter (where s.opened)::int as opened, count(*) filter (where s.tracked)::int as tracked
    from v left join s on s.sid = v.sid group by v.source order by 3 desc limit 20`;

  // Products opened by the most distinct visitors; visitors by visit count; the most active visitors (visitor-based).
  const topProducts = await sql<BizTopProduct[]>`
    select coalesce(p.title, e.external_id) as title, e.external_id as "externalId",
      count(distinct e.vid)::int as people, count(distinct e.sid)::int as views
    from events e left join products p on p.external_id = e.external_id
    where e.name = 'product_view' and e.external_id is not null and e.vid is not null
      and e.at >= ${start(peopleFrom)} and e.at < ${end(to)}
    group by 1, 2 order by 3 desc, 4 desc limit 10`;
  const perVisitor = sql`
    select vid, count(distinct sid)::int as visits, count(distinct (at at time zone ${TZ})::date)::int as days,
      count(distinct external_id) filter (where name = 'product_view')::int as products, bool_or(name = 'track') as tracked
    from events where vid is not null and at >= ${start(peopleFrom)} and at < ${end(to)} group by vid`;
  const frequency = to < PERSON_METRICS_FROM ? [] : await sql<Business["frequency"]>`
    with v as (${perVisitor}),
    b as (select case when visits = 1 then '1' when visits = 2 then '2' when visits <= 5 then '3-5' else '6+' end as visits from v)
    select k.visits, count(b.visits)::int as people from (values ('1', 1), ('2', 2), ('3-5', 3), ('6+', 4)) k(visits, o)
    left join b on b.visits = k.visits group by k.visits, k.o order by k.o`;
  const topVisitors = to < PERSON_METRICS_FROM ? [] : await sql<BizVisitor[]>`
    with v as (${perVisitor})
    select left(vid, 6) as id, visits, days, products, tracked from v order by visits desc, days desc, products desc limit 10`;

  const maprSince = [dayBefore(period.upTo, 29), PERSON_METRICS_FROM].sort()[1]!;
  const mapr = to >= PERSON_METRICS_FROM ? await sql<{ n: number }[]>`
    select count(distinct vid)::int as n from events
    where vid is not null and name in ('product_view', 'paste', 'track') and at >= ${start(maprSince)} and at < ${end(period.upTo)}`
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
    period, from, to, personFrom: PERSON_METRICS_FROM, peopleFrom, countedSince, now, before, daily, sources, topProducts, frequency, topVisitors, mapr,
    pastes, linkFailures: links?.n ?? 0, people: people!, alerts: { ...stats, trackings7d: t7?.n ?? 0 }, bought: bought!, removed,
    savings: {
      confirmed: confirmed.reduce((s, r) => s + r.start - r.alert, 0), confirmedCount: confirmed.length,
      caught: real.reduce((s, r) => s + r.start - r.alert, 0), caughtCount: real.length, rows: real,
    },
  };
}
