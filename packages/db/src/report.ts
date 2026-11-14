import type postgres from "postgres";
import { personReliable } from "@baga/core";
import { alertStats, type AlertStats } from "./alertStats";

/**
 * The daily owner report (DECISIONS.md, 2026-11-11 "Daily owner report"): numbers read from the database only,
 * so the report can never state a figure the data does not hold. Read-only queries; days are Almaty days (UTC+5).
 * Visit-, person- and account-based numbers as in docs/STATS.md, "KPI definitions" (packages/core/src/metrics.ts).
 */
export interface FunnelDay {
  /** Person-based: browsers (events.vid); reliable only on days from PERSON_METRICS_FROM (`peopleReliable`). */
  people: number;
  /** Person-based: browsers already seen on an earlier day. */
  returning: number;
  /** Visit-based: browser tabs active that day; productViews, pastes, tracks and channels count tabs too. */
  tabs: number;
  productViews: number;
  pastes: number;
  tracks: number;
  channels: number;
}

export interface OwnerReport {
  /** The Almaty day the visitor numbers describe (yesterday at report time), YYYY-MM-DD. */
  day: string;
  funnel: FunnelDay;
  /** The average of the 7 days before `day`. */
  funnelWeek: FunnelDay;
  /** Whether person numbers can be used for `day`, and for the 7 days before it. */
  peopleReliable: boolean;
  weekPeopleReliable: boolean;
  /** Visits (tabs) arriving with a utm_source on `day` (posts and campaigns), and the top sources. */
  utmVisits: number;
  sources: { source: string; n: number }[];
  /** Today's Kaspi collection: runs started since Almaty midnight. */
  /** `lastOk`: the latest run today finished without stopping, so earlier stops (`aborted`) are already behind. */
  collector: { runs: number; requests: number; running: boolean; checked: number; changed: number; failed: number; aborted: string[]; lastOk: boolean };
  catalog: { products: number; fresh3d: number; inStock: number; history7d: number; history30d: number; seedQueue: number; linksWaiting: number };
  /** Technodom: requests, priced and failed over the last 24 h; startedAt is the latest run ever. */
  store: { startedAt: string | null; requests: number; priced: number; failed: number; aborted: string | null; pendingMatches: number;
    compared: number; cheaperThere: number };
  cityPrices24h: number;
  manual24h: { done: number; failed: number; blocked: number };
  people: { watchers: number; newWatchers: number; connected: number; activeTrackings: number; newTrackings: number;
    newTrackings7d: number };
  alerts: { targetSent24h: number; firstPriceSent24h: number; failed24h: number; boughtYes: number; boughtAnswered: number };
  /** Notification numbers of the last 24 h, the same definitions as the dashboard (alertStats). */
  alerts24h: AlertStats;
  /** Tenge: start price minus alert price, per tracking; "saved" only where the person answered «Да, купил». */
  savings: { confirmed: number; confirmedCount: number; dropsCaught: number; dropsCaughtCount: number };
}

/** Kazakhstan is one zone, UTC+5, since March 2024: Almaty and Atyrau days are the same. */
const DAY = "Asia/Almaty";

export async function ownerReport(sql: postgres.Sql): Promise<OwnerReport> {
  const [today] = await sql<{ day: string }[]>`
    select to_char((now() at time zone ${DAY})::date - 1, 'YYYY-MM-DD') as day`;
  const day = today!.day;
  // Before migration 0025 there is no browser id: visitors are then counted by tab.
  const [col] = await sql<{ hasVid: boolean }[]>`
    select exists (select 1 from information_schema.columns where table_name = 'events' and column_name = 'vid') as "hasVid"`;
  const vid = col!.hasVid ? sql`vid` : sql`null::text`;
  const funnelRows = await sql<(FunnelDay & { d: string })[]>`
    with e as (
      select (at at time zone ${DAY})::date as d, name, sid, ${vid} as vid from events
      where at >= ((${day}::date - 7)::timestamp at time zone ${DAY}) and at < ((${day}::date + 1)::timestamp at time zone ${DAY})
    ), firsts as (
      select ${vid} as vid, min((at at time zone ${DAY})::date) as first_day from events where ${vid} is not null group by 1
    )
    select to_char(e.d, 'YYYY-MM-DD') as d,
      count(distinct e.vid)::int as people,
      count(distinct e.vid) filter (where f.first_day < e.d)::int as returning,
      count(distinct e.sid)::int as tabs,
      count(distinct e.sid) filter (where e.name = 'product_view')::int as "productViews",
      count(distinct e.sid) filter (where e.name = 'paste')::int as pastes,
      count(distinct e.sid) filter (where e.name = 'track')::int as tracks,
      count(distinct e.sid) filter (where e.name = 'channel')::int as channels
    from e left join firsts f on f.vid = e.vid group by e.d`;
  const empty: FunnelDay = { people: 0, returning: 0, tabs: 0, productViews: 0, pastes: 0, tracks: 0, channels: 0 };
  const funnel = { ...empty, ...stripDay(funnelRows.find((r) => r.d === day)) };
  const week = funnelRows.filter((r) => r.d !== day);
  const funnelWeek = Object.fromEntries(
    (Object.keys(empty) as (keyof FunnelDay)[]).map((k) => [k, Math.round((week.reduce((s, r) => s + r[k], 0) / 7) * 10) / 10]),
  ) as unknown as FunnelDay;

  const sources = await sql<{ source: string; n: number }[]>`
    select coalesce(source, 'direct') as source, count(distinct sid)::int as n from events
    where name = 'visit' and at >= (${day}::timestamp at time zone ${DAY}) and at < ((${day}::date + 1)::timestamp at time zone ${DAY})
    group by 1 order by 2 desc limit 8`;
  const [utm] = await sql<{ n: number }[]>`
    select count(distinct sid)::int as n from events
    where name = 'visit' and source is not null and source !~ '\\.' and source <> 'direct'
      and at >= (${day}::timestamp at time zone ${DAY}) and at < ((${day}::date + 1)::timestamp at time zone ${DAY})`;

  // Products checked and lowest prices changed today come from product_state and observations, so a report during a run is already right
  // (collection_runs.checked is written when a run ends).
  const [collector] = await sql<(Omit<OwnerReport["collector"], "aborted"> & { aborted: string[] | null })[]>`
    with today as (select ((now() at time zone ${DAY})::date::timestamp at time zone ${DAY}) as t)
    select count(r.id)::int as runs, coalesce(sum(r.requests), 0)::int as requests,
      bool_or(r.finished_at is null) is true as running,
      (select count(*) from product_state, today where last_checked_at >= today.t)::int as checked,
      -- Products whose lowest price moved today against their previous observation (not seller-count changes).
      (select count(distinct o.product_id) from (
         select product_id, observed_at, min_price, lag(min_price) over (partition by product_id order by observed_at) as prev
         from price_observations where product_id in (select product_id from price_observations, today where observed_at >= today.t)
       ) o, today where o.observed_at >= today.t and o.prev is not null and o.min_price is distinct from o.prev)::int as changed,
      coalesce(sum(r.failed), 0)::int as failed,
      array_remove(array_agg(distinct r.aborted_reason), null) as aborted,
      coalesce((select l.finished_at is not null and l.aborted_reason is null from collection_runs l, today
        where l.started_at >= today.t order by l.started_at desc limit 1), false) as "lastOk"
    from today left join collection_runs r on r.started_at >= today.t`;

  const [catalog] = await sql<OwnerReport["catalog"][]>`
    select count(*)::int as products,
      count(*) filter (where s.last_checked_at > now() - interval '3 days')::int as "fresh3d",
      count(*) filter (where s.in_stock)::int as "inStock",
      count(*) filter (where s.observed_since < now() - interval '7 days')::int as "history7d",
      count(*) filter (where s.observed_since < now() - interval '30 days')::int as "history30d",
      (select count(*) from seed_queue)::int as "seedQueue",
      (select count(*) from short_link_queue where status = 'pending')::int as "linksWaiting"
    from products p join product_state s on s.product_id = p.id where p.status = 'active'`;

  // Store runs of the last 24 h together: the main run plus backup starts that find nothing due.
  const [lastStore] = await sql<{ startedAt: string | null; requests: number; priced: number; failed: number; aborted: string | null }[]>`
    select (select max(started_at) from store_runs)::text as "startedAt",
      coalesce(sum(requests), 0)::int as requests, coalesce(sum(priced), 0)::int as priced, coalesce(sum(failed), 0)::int as failed,
      string_agg(distinct aborted_reason, '; ') as aborted
    from store_runs where started_at > now() - interval '24 hours'`;
  const [cmp] = await sql<{ pending: number; compared: number; cheaper: number }[]>`
    with lp as (select distinct on (match_id) match_id, price, in_stock, observed_at from store_prices order by match_id, observed_at desc)
    select (select count(*) from store_matches where status = 'pending')::int as pending,
      count(lp.match_id)::int as compared,
      count(*) filter (where lp.price < s.current_min_price * 0.99)::int as cheaper
    from store_matches m join lp on lp.match_id = m.id join product_state s on s.product_id = m.product_id
    where m.status = 'confirmed' and lp.in_stock and s.in_stock and lp.observed_at > now() - interval '3 days'`;

  const [city] = await sql<{ n: number }[]>`select count(*)::int as n from city_prices where observed_at > now() - interval '24 hours'`;
  const [manual] = await sql<OwnerReport["manual24h"][]>`
    select count(*) filter (where status = 'done')::int as done, count(*) filter (where status = 'failed')::int as failed,
      count(*) filter (where status = 'blocked')::int as blocked
    from manual_checks where requested_at > now() - interval '24 hours'`;

  const [people] = await sql<OwnerReport["people"][]>`
    select (select count(*) from watchers where not internal)::int as watchers,
      (select count(*) from watchers where not internal and created_at > now() - interval '24 hours')::int as "newWatchers",
      (select count(*) from watchers where not internal and (telegram_chat_id is not null or email_confirmed_at is not null))::int as connected,
      (select count(*) from trackings where watcher_id is not null and not exists (select 1 from watchers tw where tw.id = trackings.watcher_id and tw.internal) and status = 'active')::int as "activeTrackings",
      (select count(*) from trackings where watcher_id is not null and not exists (select 1 from watchers tw where tw.id = trackings.watcher_id and tw.internal) and created_at > now() - interval '24 hours')::int as "newTrackings",
      (select count(*) from trackings where watcher_id is not null and not exists (select 1 from watchers tw where tw.id = trackings.watcher_id and tw.internal) and created_at > now() - interval '7 days')::int as "newTrackings7d"`;

  const [alerts] = await sql<OwnerReport["alerts"][]>`
    select count(*) filter (where type = 'target_reached' and status = 'sent' and sent_at > now() - interval '24 hours')::int as "targetSent24h",
      count(*) filter (where type = 'first_price' and status = 'sent' and sent_at > now() - interval '24 hours')::int as "firstPriceSent24h",
      count(*) filter (where status = 'failed' and created_at > now() - interval '24 hours')::int as "failed24h",
      (select count(*) from trackings where bought = 'yes' and not exists (select 1 from watchers tw where tw.id = trackings.watcher_id and tw.internal))::int as "boughtYes",
      (select count(*) from trackings where bought is not null and not exists (select 1 from watchers tw where tw.id = trackings.watcher_id and tw.internal))::int as "boughtAnswered"
    from notifications`;

  // Start price: the lowest price we had observed when the tracking began (else the first one after it);
  // alert price: the lowest price a target alert reported. Only positive differences count.
  const [savings] = await sql<OwnerReport["savings"][]>`
    with hit as (
      select n.tracking_id, min(n.price) as alert_price from notifications n
      where n.type = 'target_reached' and n.status = 'sent' group by n.tracking_id
    ), d as (
      select t.bought, coalesce(
        (select o.min_price from price_observations o where o.product_id = t.product_id and o.observed_at <= t.created_at
           and o.min_price is not null order by o.observed_at desc limit 1),
        (select o.min_price from price_observations o where o.product_id = t.product_id and o.observed_at > t.created_at
           and o.min_price is not null order by o.observed_at limit 1)) - h.alert_price as drop
      from hit h join trackings t on t.id = h.tracking_id where not exists (select 1 from watchers tw where tw.id = t.watcher_id and tw.internal)
    )
    select coalesce(sum(drop) filter (where bought = 'yes'), 0)::int as confirmed,
      count(*) filter (where bought = 'yes' and drop > 0)::int as "confirmedCount",
      coalesce(sum(drop), 0)::int as "dropsCaught", count(*)::int as "dropsCaughtCount"
    from d where drop > 0`;

  return {
    day, funnel, funnelWeek, utmVisits: utm?.n ?? 0, sources,
    peopleReliable: personReliable(day),
    weekPeopleReliable: personReliable(new Date(Date.parse(`${day}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10)),
    alerts24h: await alertStats(sql, { from: new Date(Date.now() - 86_400_000), to: new Date() }),
    collector: { ...collector!, aborted: collector!.aborted ?? [] },
    catalog: catalog!,
    store: { startedAt: lastStore?.startedAt ?? null, requests: lastStore?.requests ?? 0, priced: lastStore?.priced ?? 0,
      failed: lastStore?.failed ?? 0, aborted: lastStore?.aborted ?? null, pendingMatches: cmp?.pending ?? 0,
      compared: cmp?.compared ?? 0, cheaperThere: cmp?.cheaper ?? 0 },
    cityPrices24h: city?.n ?? 0, manual24h: manual!, people: people!, alerts: alerts!, savings: savings!,
  };
}

function stripDay(r: (FunnelDay & { d: string }) | undefined): Partial<FunnelDay> {
  if (!r) return {};
  const { d: _d, ...rest } = r;
  return rest;
}
