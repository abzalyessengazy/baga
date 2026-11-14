import type postgres from "postgres";
import { DIGEST, INTERESTS, moveDirection, type Interest } from "@baga/core";

/**
 * Profiles, the leaderboard and the 3-day note (DECISIONS.md, 2026-11-13; migration 0027). Every number is a sum of
 * the watcher's own trackings at observed prices: nothing is estimated, and «сэкономил» counts only purchases the
 * person confirmed («Да, купил») after a target alert, by the same rule as the owner's report.
 */
export interface Profile {
  nickname: string | null; avatar: string | null; visitReason: string | null; interests: string[]; saveGoal: number | null;
  /** When the questions were answered; null = not yet. */
  profileAt: Date | null; onBoard: boolean; digest: boolean; since: Date;
  /** A team browser (migration 0030): never on the board, not in the numbers. */
  internal: boolean;
}

export async function getProfile(sql: postgres.Sql, watcherId: string): Promise<Profile | null> {
  const [p] = await sql<Profile[]>`
    select nickname, avatar, visit_reason as "visitReason", interests, save_goal as "saveGoal", profile_at as "profileAt",
           on_board as "onBoard", digest, created_at as since, internal
    from watchers where id = ${watcherId}`;
  return p ?? null;
}

export type ProfileInput = { nickname: string; avatar: string; visitReason: string | null; interests: string[]; saveGoal: number | null };

/** Saves the answers. "taken" when another watcher already has the nickname (compared without case). */
export async function saveProfile(sql: postgres.Sql, watcherId: string, x: ProfileInput): Promise<"ok" | "taken"> {
  try {
    await sql`update watchers set nickname = ${x.nickname}, avatar = ${x.avatar}, visit_reason = ${x.visitReason},
      interests = ${sql.array(x.interests)}::text[], save_goal = ${x.saveGoal}, profile_at = coalesce(profile_at, now()) where id = ${watcherId}`;
    return "ok";
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return "taken";
    throw e;
  }
}

export async function setProfileFlags(sql: postgres.Sql, watcherId: string, x: { onBoard?: boolean; digest?: boolean }): Promise<void> {
  if (x.onBoard !== undefined) await sql`update watchers set on_board = ${x.onBoard} where id = ${watcherId}`;
  if (x.digest !== undefined) await sql`update watchers set digest = ${x.digest} where id = ${watcherId}`;
}

/** Stops the 3-day note from an email's link (the address and its alerts stay). */
export async function stopDigestByCode(sql: postgres.Sql, code: string): Promise<boolean> {
  const r = await sql`update watchers set digest = false where email_stop_code = ${code}`;
  return r.count > 0;
}
export async function stopDigestByChat(sql: postgres.Sql, chatId: string): Promise<boolean> {
  const r = await sql`update watchers set digest = false where telegram_chat_id = ${chatId}::bigint`;
  return r.count > 0;
}

export interface BoardRow {
  /** A short code of the watcher (not its id), so a browser can find its own row. */
  tag: string; rank: number; nickname: string | null; avatar: string | null;
  tracked: number; total: number; potential: number; saved: number;
}

/**
 * Everyone with an active tracking, ranked by «хочет сэкономить» (the current price above their own price, summed),
 * then by products tracked, then the earlier visitor. Hidden watchers are left out. Small while BAĞA is small: all
 * rows are ranked in one query.
 */
async function boardRows(sql: postgres.Sql): Promise<(BoardRow & { id: string })[]> {
  return sql<(BoardRow & { id: string })[]>`
    with t as (
      select t.watcher_id, s.current_min_price as now, t.target_price as target
      from trackings t left join product_state s on s.product_id = t.product_id
      where t.watcher_id is not null and t.status = 'active'),
    agg as (
      select watcher_id, count(*)::int as tracked, coalesce(sum(now), 0)::int as total,
             coalesce(sum(greatest(now - target, 0)), 0)::int as potential
      from t group by 1),
    hit as (
      select n.tracking_id, min(n.price) as alert from notifications n
      where n.type = 'target_reached' and n.status = 'sent' group by 1),
    saved as (
      select t.watcher_id, sum(greatest(st.start - h.alert, 0))::int as saved
      from hit h join trackings t on t.id = h.tracking_id and t.bought = 'yes' and t.watcher_id is not null
      cross join lateral (select coalesce(
        (select o.min_price from price_observations o where o.product_id = t.product_id and o.observed_at <= t.created_at
           and o.min_price is not null order by o.observed_at desc limit 1),
        (select o.min_price from price_observations o where o.product_id = t.product_id and o.observed_at > t.created_at
           and o.min_price is not null order by o.observed_at limit 1)) as start) st
      group by 1)
    select w.id, substr(md5(w.id::text), 1, 6) as tag, w.nickname, w.avatar, a.tracked, a.total, a.potential,
           coalesce(sv.saved, 0)::int as saved,
           (row_number() over (order by a.potential desc, a.tracked desc, w.created_at))::int as rank
    from agg a join watchers w on w.id = a.watcher_id left join saved sv on sv.watcher_id = w.id
    where w.on_board and not w.internal
    order by rank`;
}

const publicRow = ({ id: _id, ...r }: BoardRow & { id: string }): BoardRow => r;

/** The top of the board and how many are on it. */
export async function getBoard(sql: postgres.Sql, limit = 10): Promise<{ rows: BoardRow[]; total: number }> {
  const all = await boardRows(sql);
  return { rows: all.slice(0, limit).map(publicRow), total: all.length };
}

export interface ProfileStats {
  tracked: number; total: number; potential: number; saved: number;
  /** Null when hidden from the board or nothing is tracked. */
  rank: number | null; boardSize: number; tag: string | null;
  /** The row one place above: how much more «хочу сэкономить» passes it. */
  ahead: { rank: number; gap: number } | null;
}

export async function getProfileStats(sql: postgres.Sql, watcherId: string): Promise<ProfileStats> {
  const all = await boardRows(sql);
  const me = all.find((r) => r.id === watcherId);
  if (me) {
    const up = all[me.rank - 2];
    return { tracked: me.tracked, total: me.total, potential: me.potential, saved: me.saved, rank: me.rank, boardSize: all.length, tag: me.tag,
      ahead: up ? { rank: up.rank, gap: Math.max(1, up.potential - me.potential + 1) } : null };
  }
  // Hidden from the board, or nothing active: the same sums for this watcher alone.
  const [own] = await sql<{ tracked: number; total: number; potential: number }[]>`
    select count(*)::int as tracked, coalesce(sum(s.current_min_price), 0)::int as total,
           coalesce(sum(greatest(s.current_min_price - t.target_price, 0)), 0)::int as potential
    from trackings t left join product_state s on s.product_id = t.product_id
    where t.watcher_id = ${watcherId} and t.status = 'active'`;
  return { tracked: own?.tracked ?? 0, total: own?.total ?? 0, potential: own?.potential ?? 0, saved: 0, rank: null, boardSize: all.length, tag: null, ahead: null };
}

export interface Suggestion {
  externalId: string; title: string; titleKk: string | null; imageUrl: string | null; price: number;
  /** The highest daily low of the last 30 days and how far below it the price is now (0 = no drop). */
  high: number; pct: number; observedDays: number;
  /** In a category the visitor already tracks (else: one they said interests them, or simply a drop). */
  same: boolean;
}

/**
 * «Почему бы не следить и за этими?»: products the watcher does not track, in stock, from the categories of their
 * tracked products and the interests they named, the ones furthest below their own 30-day high first. With no
 * category to go by, the same order over the whole catalog. Observed prices only.
 */
export async function suggestFor(sql: postgres.Sql, watcherId: string, limit = 6): Promise<Suggestion[]> {
  const [w] = await sql<{ interests: string[] }[]>`select interests from watchers where id = ${watcherId}`;
  const tops = (w?.interests ?? []).filter((i): i is Interest => i in INTERESTS).map((i) => INTERESTS[i]);
  return sql<Suggestion[]>`
    with mine as (
      select t.product_id, p.category_path from trackings t join products p on p.id = t.product_id
      where t.watcher_id = ${watcherId} and t.status <> 'removed'),
    leafs as (select distinct category_path[array_length(category_path, 1)] as c from mine where array_length(category_path, 1) > 0),
    d as (
      select product_id, (observed_at at time zone 'Asia/Almaty')::date as day, min(min_price) as p
      from price_observations where min_price is not null and observed_at > now() - interval '30 days' group by 1, 2),
    h as (select product_id, max(p)::int as high, count(*)::int as days from d group by 1)
    select p.external_id as "externalId", p.title, p.title_kk as "titleKk", p.image_url as "imageUrl",
           s.current_min_price as price, greatest(h.high, s.current_min_price) as high,
           greatest(round((h.high - s.current_min_price) * 100.0 / h.high), 0)::int as pct, h.days as "observedDays",
           (p.category_path[array_length(p.category_path, 1)] in (select c from leafs)) as same
    from products p join product_state s on s.product_id = p.id join h on h.product_id = p.id
    where p.status = 'active' and s.in_stock and s.current_min_price is not null and h.days >= 3
      and p.id not in (select product_id from mine where product_id is not null)
    order by (p.category_path[array_length(p.category_path, 1)] in (select c from leafs)) desc,
             (p.category_path[1] = any(${sql.array(tops)}::text[])) desc,
             (h.high - s.current_min_price)::numeric / h.high desc, coalesce(p.kaspi_reviews, 0) desc, p.id
    limit ${limit}`;
}

export interface DigestItem { externalId: string; title: string; titleKk: string | null; now: number; was: number; move: -1 | 0 | 1; target: number | null }
export interface DigestDue {
  watcherId: string; locale: "ru" | "kk"; chatId: string | null; email: string | null; stopCode: string | null; nickname: string | null;
  items: DigestItem[];
}

/**
 * Watchers due their 3-day note: the note is on, alerts have somewhere to go, a product with a price is tracked,
 * and DIGEST.dueHours passed since the last note (or since they came). Each product's price now against its last
 * observed price from DIGEST.everyDays days ago or earlier (a product first seen later is left out).
 */
export async function digestDue(sql: postgres.Sql, limit = 200): Promise<DigestDue[]> {
  const rows = await sql<{ watcherId: string; locale: "ru" | "kk"; chatId: string | null; email: string | null; stopCode: string | null; nickname: string | null;
    externalId: string; title: string; titleKk: string | null; now: number; was: number | null; target: number | null }[]>`
    select w.id as "watcherId", w.locale, w.telegram_chat_id::text as "chatId",
           case when w.email_confirmed_at is not null then w.email end as email, w.email_stop_code as "stopCode", w.nickname,
           p.external_id as "externalId", p.title, p.title_kk as "titleKk", s.current_min_price as now, t.target_price as target,
           (select o.min_price from price_observations o where o.product_id = p.id and o.min_price is not null
              and o.observed_at <= now() - make_interval(days => ${DIGEST.everyDays}) order by o.observed_at desc limit 1) as was
    from watchers w join trackings t on t.watcher_id = w.id and t.status = 'active'
    join products p on p.id = t.product_id join product_state s on s.product_id = p.id
    where w.digest and (w.telegram_chat_id is not null or w.email_confirmed_at is not null)
      and s.current_min_price is not null
      and coalesce(w.digest_sent_at, w.created_at) < now() - make_interval(hours => ${DIGEST.dueHours})
    order by w.created_at, t.created_at
    limit ${limit * 20}`;
  const by = new Map<string, DigestDue>();
  for (const r of rows) {
    if (r.was === null) continue;
    let d = by.get(r.watcherId);
    if (!d) by.set(r.watcherId, d = { watcherId: r.watcherId, locale: r.locale, chatId: r.chatId, email: r.email, stopCode: r.stopCode, nickname: r.nickname, items: [] });
    d.items.push({ externalId: r.externalId, title: r.title, titleKk: r.titleKk, now: r.now, was: r.was, move: moveDirection(r.was, r.now), target: r.target });
  }
  return [...by.values()].slice(0, limit);
}

/** Marks the note as sent before sending it (at most one per period, even if two jobs run). False = already taken. */
export async function claimDigest(sql: postgres.Sql, watcherId: string): Promise<boolean> {
  const r = await sql`update watchers set digest_sent_at = now()
    where id = ${watcherId} and digest and coalesce(digest_sent_at, created_at) < now() - make_interval(hours => ${DIGEST.dueHours})`;
  return r.count > 0;
}
