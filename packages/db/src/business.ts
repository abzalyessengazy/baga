import type postgres from "postgres";

/**
 * The owner's business dashboard (/admin/business; DECISIONS.md, 2026-11-11 "Business dashboard"). Read-only
 * numbers for a period of Almaty days ending today, and the same numbers for the period before it. A person is a
 * browser id (events.vid, from 11 Nov 2026); older events only have a tab id, so periods before that count tabs and
 * say so (`vidSince`). Nothing is estimated: a number the data cannot give is null.
 */
const TZ = "Asia/Almaty";

export interface BizTotals {
  /** People: browser ids, or tab ids for events without one. */
  visitors: number;
  /** Tabs (visits). */
  visits: number;
  /** People who opened a product page, pasted a link or started tracking: Monthly Active Price Researchers' action. */
  researchers: number;
  opened: number; pasted: number; tracked: number; connected: number;
  /** People whose browser id was seen before this period. */
  returning: number;
  /** Visitors arriving with a utm_source (posts, campaigns). */
  fromPosts: number;
  newPeople: number; newTrackings: number;
}
export interface BizDay { day: string; visitors: number; opened: number; tracked: number }
export interface BizSource { source: string; posts: boolean; visitors: number; opened: number; tracked: number }
export interface BizSaving { title: string; externalId: string; start: number; alert: number; bought: "yes" | "later" | "no" | null; at: string }
export interface Business {
  days: number; from: string; to: string;
  /** The first day with browser ids (unique and returning visitors are exact from then). */
  vidSince: string | null;
  /** The first day with any event (visits were not counted before 3 Nov 2026). */
  countedSince: string | null;
  now: BizTotals;
  /** The period before; null unless visits were counted for all of it (a gap is not a zero). */
  before: BizTotals | null;
  daily: BizDay[];
  sources: BizSource[];
  /** Monthly Active Price Researchers: people with a research action in the 30 days to today. */
  mapr: number;
  people: { watchers: number; connected: number; returnedAfterADay: number };
  alerts: { trackings7d: number; targetSent: number; firstPriceSent: number; clicked: number };
  bought: { yes: number; later: number; no: number; asked: number };
  removed: { bought: number; bought_elsewhere: number; changed_mind: number; price_never_dropped: number; none: number } | null;
  savings: { confirmed: number; confirmedCount: number; caught: number; caughtCount: number; rows: BizSaving[] };
}

/** Days are Almaty days; `days` ends today (today counts so far). */
export async function getBusiness(sql: postgres.Sql, days: number): Promise<Business> {
  const [range] = await sql<{ from: string; to: string; prevFrom: string }[]>`
    select to_char((now() at time zone ${TZ})::date - ${days - 1}::int, 'YYYY-MM-DD') as "from",
           to_char((now() at time zone ${TZ})::date, 'YYYY-MM-DD') as "to",
           to_char((now() at time zone ${TZ})::date - ${2 * days - 1}::int, 'YYYY-MM-DD') as "prevFrom"`;
  const { from, to, prevFrom } = range!;
  const start = (d: string) => sql`(${d}::date::timestamp at time zone ${TZ})`;
  const end = (d: string) => sql`((${d}::date + 1)::timestamp at time zone ${TZ})`;

  const totals = async (a: string, b: string): Promise<BizTotals> => {
    const [r] = await sql<BizTotals[]>`
      with e as (select name, sid, vid, coalesce(vid, sid) as who, source from events where at >= ${start(a)} and at < ${end(b)}),
      seen as (select distinct vid from events where vid is not null and at < ${start(a)})
      select count(distinct who)::int as visitors,
        count(distinct sid) filter (where name = 'visit')::int as visits,
        count(distinct who) filter (where name in ('product_view', 'paste', 'track'))::int as researchers,
        count(distinct who) filter (where name = 'product_view')::int as opened,
        count(distinct who) filter (where name = 'paste')::int as pasted,
        count(distinct who) filter (where name = 'track')::int as tracked,
        count(distinct who) filter (where name = 'channel')::int as connected,
        count(distinct e.vid) filter (where e.vid in (select vid from seen))::int as returning,
        count(distinct who) filter (where name = 'visit' and source is not null and source !~ '\\.' and source <> 'direct')::int as "fromPosts",
        (select count(*) from watchers where created_at >= ${start(a)} and created_at < ${end(b)})::int as "newPeople",
        (select count(*) from trackings where watcher_id is not null and created_at >= ${start(a)} and created_at < ${end(b)})::int as "newTrackings"
      from e`;
    return r!;
  };
  const [first] = await sql<{ day: string | null }[]>`
    select to_char(min((at at time zone ${TZ})::date), 'YYYY-MM-DD') as day from events`;
  const countedSince = first?.day ?? null;
  const prevTo = new Date(Date.parse(`${from}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const now = await totals(from, to);
  const before = countedSince && prevFrom >= countedSince ? await totals(prevFrom, prevTo) : null;
  // Days before counting began are not shown as zeros.
  const chartFrom = countedSince && countedSince > from ? countedSince : from;

  const daily = await sql<BizDay[]>`
    with d as (select generate_series(${chartFrom}::date, ${to}::date, interval '1 day')::date as day),
    e as (select (at at time zone ${TZ})::date as day, name, coalesce(vid, sid) as who from events
          where at >= ${start(from)} and at < ${end(to)})
    select to_char(d.day, 'YYYY-MM-DD') as day,
      count(distinct e.who)::int as visitors,
      count(distinct e.who) filter (where e.name = 'product_view')::int as opened,
      count(distinct e.who) filter (where e.name = 'track')::int as tracked
    from d left join e on e.day = d.day group by d.day order by d.day`;

  // Each visit's source, then what that tab went on to do.
  const sources = await sql<BizSource[]>`
    with v as (select distinct on (sid) sid, coalesce(vid, sid) as who, coalesce(source, 'direct') as source from events
               where name = 'visit' and at >= ${start(from)} and at < ${end(to)} order by sid, at),
    s as (select sid, bool_or(name = 'product_view') as opened, bool_or(name = 'track') as tracked from events
          where at >= ${start(from)} and at < ${end(to)} group by sid)
    select v.source, (v.source !~ '\\.' and v.source <> 'direct') as posts,
      count(distinct v.who)::int as visitors,
      count(distinct v.who) filter (where s.opened)::int as opened,
      count(distinct v.who) filter (where s.tracked)::int as tracked
    from v left join s on s.sid = v.sid group by v.source order by 3 desc limit 20`;

  const [vidRow] = await sql<{ since: string | null }[]>`
    select to_char(min((at at time zone ${TZ})::date), 'YYYY-MM-DD') as since from events where vid is not null`;
  const [mapr] = await sql<{ n: number }[]>`
    select count(distinct coalesce(vid, sid))::int as n from events
    where name in ('product_view', 'paste', 'track') and at >= ${start(new Date(Date.parse(`${to}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10))}`;

  const [people] = await sql<Business["people"][]>`
    select count(*)::int as watchers,
      count(*) filter (where telegram_chat_id is not null or email_confirmed_at is not null)::int as connected,
      count(*) filter (where last_seen_at > created_at + interval '1 day')::int as "returnedAfterADay"
    from watchers`;
  const [alerts] = await sql<Business["alerts"][]>`
    select (select count(*) from trackings where watcher_id is not null and created_at > now() - interval '7 days')::int as "trackings7d",
      count(distinct tracking_id) filter (where type = 'target_reached' and status = 'sent')::int as "targetSent",
      count(distinct tracking_id) filter (where type = 'first_price' and status = 'sent')::int as "firstPriceSent",
      count(*) filter (where clicked_at is not null)::int as clicked
    from notifications where created_at >= ${start(from)} and created_at < ${end(to)}`;
  const [bought] = await sql<Business["bought"][]>`
    select count(*) filter (where bought = 'yes')::int as yes, count(*) filter (where bought = 'later')::int as later,
      count(*) filter (where bought = 'no')::int as no, count(*) filter (where bought_asked_at is not null)::int as asked
    from trackings where watcher_id is not null`;
  // «Почему убираете?» (migration 0026): null before the migration.
  const removed = await sql<NonNullable<Business["removed"]>[]>`
    select count(*) filter (where removed_reason = 'bought')::int as bought,
      count(*) filter (where removed_reason = 'bought_elsewhere')::int as bought_elsewhere,
      count(*) filter (where removed_reason = 'changed_mind')::int as changed_mind,
      count(*) filter (where removed_reason = 'price_never_dropped')::int as price_never_dropped,
      count(*) filter (where removed_reason is null)::int as none
    from trackings where status = 'removed' and removed_at >= ${start(from)} and removed_at < ${end(to)}`
    .then((r) => r[0] ?? null).catch(() => null);

  // Same rule as the daily report: start price when tracking began (else the first after), alert price the lowest a
  // target alert reported; "saved" only where the person answered «Да, купил». All time, newest first.
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
    order by h.at desc limit 50`;
  const real = rows.filter((r) => r.start > r.alert);
  const confirmed = real.filter((r) => r.bought === "yes");
  return {
    days, from, to, vidSince: vidRow?.since ?? null, countedSince, now, before, daily, sources,
    mapr: mapr?.n ?? 0, people: people!, alerts: alerts!, bought: bought!, removed,
    savings: {
      confirmed: confirmed.reduce((s, r) => s + r.start - r.alert, 0), confirmedCount: confirmed.length,
      caught: real.reduce((s, r) => s + r.start - r.alert, 0), caughtCount: real.length, rows: real,
    },
  };
}
