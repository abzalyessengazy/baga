import type postgres from "postgres";

/** One collector run as the admin page shows it: checks counted from saved observations, so a running or cancelled run counts too. */
export interface AdminRun {
  id: number; runner: string; startedAt: Date; finishedAt: Date | null; lastCheckAt: Date | null;
  checks: number; failed: number; aborted: string | null;
  /** Requests sent to Kaspi (migration 0017); null for older runs. */
  requests: number | null;
  /** Seconds per request over the run so far (null without requests): ~11–12 s is the robots.txt pace. */
  pace: number | null;
}

/** A run slower than this per request is losing checks to work between requests (6 Nov 2026: 13.8 s). */
export const RUN_PACE_WARN_S = 13;
export interface AdminCount { label: string; n: number }
export interface AdminError { where: string; error: string; n: number; last: Date | null }

export interface AdminHealth {
  runs: AdminRun[];
  checksToday: number;
  schedule: { total: number; due: number; failing: number };
  seedQueue: AdminCount[];
  shortLinks: AdminCount[];
  errors: AdminError[];
  notifications: { channel: string; type: string; status: string; n: number; clicked: number; last: Date | null }[];
  people: {
    watchers: number; new24h: number; new7d: number; telegram: number; emailConfirmed: number; emailPending: number;
    both: number; none: number; noneWithTrackings: number;
  };
  trackings: { total: number; active: number; products: number; byPreset: number; pctWaiting: number; waiting: number };
  perWatcher: { trackings: number; watchers: number }[];
  catalog: { products: number; seeded: number; inStock: number; withPrice: number; viewed24h: number };
}

/** Everything the owner's health page shows (DECISIONS.md, 2026-11-03 "Admin page"). Read-only. */
export async function getAdminHealth(sql: postgres.Sql): Promise<AdminHealth> {
  const runs = await sql<AdminRun[]>`
    select r.id::int, r.runner, r.started_at as "startedAt", r.finished_at as "finishedAt",
           (select max(observed_at) from price_observations o where o.run_id = r.id) as "lastCheckAt",
           (select count(*)::int from price_observations o where o.run_id = r.id) as checks,
           r.failed, r.aborted_reason as aborted, r.requests,
           case when r.requests > 20 then round((extract(epoch from coalesce(r.finished_at, now()) - r.started_at) / r.requests)::numeric, 1)::float end as pace
    from collection_runs r order by r.id desc limit 10`;
  const [today] = await sql<{ n: number }[]>`
    select count(*)::int as n from price_observations
    where (observed_at at time zone 'Asia/Almaty')::date = (now() at time zone 'Asia/Almaty')::date`;
  const [schedule] = await sql<AdminHealth["schedule"][]>`
    select count(*)::int as total, count(*) filter (where next_check_at <= now())::int as due,
           count(*) filter (where fail_count > 0)::int as failing from collection_schedule`;
  const seedQueue = await sql<AdminCount[]>`
    select source || ' · ' || status || case when attempts >= 3 then ' · 3 tries' else '' end as label, count(*)::int as n
    from seed_queue group by 1 order by 1`;
  const shortLinks = await sql<AdminCount[]>`
    select case when path like '/shop/p/%' then 'variant' else 'short' end || ' · ' || status as label, count(*)::int as n
    from short_link_queue group by 1 order by 1`;
  const errors = await sql<AdminError[]>`
    select * from (
      select 'schedule' as "where", left(last_error, 200) as error, count(*)::int as n, null::timestamptz as last
        from collection_schedule where last_error is not null group by 2
      union all
      select 'seed_queue ' || source, left(last_error, 200), count(*)::int, max(added_at)
        from seed_queue where last_error is not null group by 1, 2
      union all
      select 'short link', left(last_error, 200), count(*)::int, null
        from short_link_queue where last_error is not null group by 2
    ) e order by n desc limit 12`;
  const notifications = await sql<AdminHealth["notifications"]>`
    select channel, type, status, count(*)::int as n, count(clicked_at)::int as clicked, max(created_at) as last
    from notifications group by 1, 2, 3 order by 1, 2, 3`;
  const [people] = await sql<AdminHealth["people"][]>`
    select count(*)::int as watchers,
      count(*) filter (where w.created_at > now() - interval '1 day')::int as "new24h",
      count(*) filter (where w.created_at > now() - interval '7 days')::int as "new7d",
      count(*) filter (where telegram_chat_id is not null)::int as telegram,
      count(*) filter (where email_confirmed_at is not null)::int as "emailConfirmed",
      count(*) filter (where email is not null and email_confirmed_at is null)::int as "emailPending",
      count(*) filter (where telegram_chat_id is not null and email_confirmed_at is not null)::int as both,
      count(*) filter (where telegram_chat_id is null and email_confirmed_at is null)::int as none,
      count(*) filter (where telegram_chat_id is null and email_confirmed_at is null
        and exists (select 1 from trackings t where t.watcher_id = w.id and t.status = 'active'))::int as "noneWithTrackings"
    from watchers w`;
  const [trackings] = await sql<AdminHealth["trackings"][]>`
    select count(*)::int as total, count(*) filter (where status = 'active')::int as active,
      count(distinct product_id)::int as products,
      count(*) filter (where target_drop_pct is not null)::int as "byPreset",
      count(*) filter (where target_price is null)::int as "pctWaiting",
      count(*) filter (where product_id is null)::int as waiting
    from trackings where watcher_id is not null`;
  const perWatcher = await sql<AdminHealth["perWatcher"]>`
    select n::int as trackings, count(*)::int as watchers
    from (select count(*) as n from trackings where watcher_id is not null group by watcher_id) x group by n order by n`;
  const [catalog] = await sql<AdminHealth["catalog"][]>`
    select count(*)::int as products, count(*) filter (where p.is_seed)::int as seeded,
      count(*) filter (where s.in_stock)::int as "inStock", count(s.current_min_price)::int as "withPrice",
      count(*) filter (where p.last_viewed_at > now() - interval '1 day')::int as "viewed24h"
    from products p left join product_state s on s.product_id = p.id where p.status = 'active'`;
  return {
    runs, checksToday: today!.n, schedule: schedule!, seedQueue, shortLinks, errors, notifications,
    people: people!, trackings: trackings!, perWatcher, catalog: catalog!,
  };
}
