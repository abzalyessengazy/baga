/**
 * One daily collection run inside Kaspi's robots.txt visit window (04:00–08:45 UTC; we use 04:05–08:30), one request per ≥10 s:
 * fetch visitor requests first, then check due products (offers only; product page weekly), then queued seed
 * products; poll for new visitor requests until the window closes; evaluate alerts; send the first price and
 * target alerts to Telegram right after each check, queued emails at the end. Started by .github/workflows/collect.yml at 03:50 UTC; waits for 04:05.
 */
import { createKaspiClient, buildSnapshot, KaspiHttpError, KaspiParseError, KaspiRequestRefused, canonicalProductUrl, parseKaspiUrl, queuedLinkUrl, variantLinkCode } from "@baga/kaspi";
import { saveSnapshot, claimNotifications, startSend, markSent, markFailed, tidyDeliveries, connectionOptions, requestProduct, attachShortLinkTrackings, weekMovers } from "@baga/db";
import {
  evaluateAlert, priorityFor, newProductTurn, INTERVAL_MINUTES, PRIORITY_ORDER, USER_INTEREST, CATALOG, SEED_MIN_PRICE, backoffMinutes, isSuspiciousJump, type TrackingAlertState,
  KASPI_CRAWL_DELAY_MS, isInVisitWindow, needsPageRefresh, msUntilVisitWindow, targetForDrop, almatyDay, runningSale, type Priority,
} from "@baga/core";
import postgres from "postgres";
import { env } from "./env";
import { CircuitBreaker } from "./breaker";
import { renderAlertEmail, renderBoughtEmail, sendViaResend } from "./email";
import { renderTelegramAlert, renderTelegramBoughtAsk, sendTelegram, DeliveryError } from "./telegram";
import { renderChannelPost } from "./channel";

const sql = postgres(env.databaseUrl(), { max: 2, ...connectionOptions(env.databaseUrl()) });
// Every request this run makes (page, offers, re-checks, alert confirmations) goes through this gate.
// The last word before each request, after its pacing wait: nothing is sent once the breaker is open or the window
// (04:05–08:30 UTC) has closed, whatever the caller planned.
const breaker = new CircuitBreaker();
// Every request that passes the guard is sent: counted for collection_runs.requests (migration 0017).
let requests = 0;
const kaspi = createKaspiClient({
  minIntervalMs: KASPI_CRAWL_DELAY_MS, jitterMs: 2_000,
  beforeRequest: () => {
    if (breaker.openReason) throw new KaspiRequestRefused(breaker.openReason);
    if (!isInVisitWindow(new Date(), 0)) throw new KaspiRequestRefused("outside the visit window");
    requests++;
  },
});

// Worst case for one product: page + offers + suspicious re-check + alert confirmation = 4 requests ≈ 48 s.
// Stop starting new products when less than this remains, so no request lands after 08:30 UTC.
const WINDOW_MARGIN_MS = 60_000;
const inWindow = () => isInVisitWindow(new Date(), WINDOW_MARGIN_MS);

type DueRow = {
  product_id: number; external_id: string; slug: string | null; fail_count: number; interval_minutes: number;
  current_min_price: number | null; title: string; image_url: string | null; category_path: string[];
  page_checked_at: Date | null; priority: Priority;
};

async function main() {
  const wait = msUntilVisitWindow(new Date());
  if (wait > env.windowWaitMaxMs()) {
    console.log(JSON.stringify({ skipped: "outside collection window (04:05-08:30 UTC)", opensInMinutes: Math.round(wait / 60_000) }));
    await cleanUp();
    await sendQueued(); // Telegram and email only, no Kaspi requests
    return;
  }
  if (wait > 0) {
    console.log(`waiting ${Math.ceil(wait / 1000)} s for Kaspi visit window`);
    await new Promise((r) => setTimeout(r, wait));
  }

  const [run] = await sql<{ id: number }[]>`insert into collection_runs (runner) values (${env.runner()}) returning id`;
  await cleanUp();
  await sendQueued(); // the full round once at the start: retries and asks left from yesterday go out first
  // A visitor's product that failed three times today gets three more tries tomorrow, for two weeks (3 Nov 2026:
  // a MacBook used up its tries on a parser bug fixed the same day and was never asked for again).
  await sql`update seed_queue set attempts = 0 where source = 'visitor' and status = 'pending' and attempts >= 3
    and added_at > now() - interval '14 days'`;
  const runId = run!.id;
  let changed = 0;
  let seeded = 0;
  const tried = new Set<string>(); // each queued product gets at most one attempt per run

  // Order on every turn (DECISIONS.md, 2026-11-05 "What people want is checked first"): new products someone tracks,
  // then due tracked products (lane 0), then other products visitors pasted, then products people opened since their
  // last check (lane 1), then catalog enrichment (lane 2), with new seed products taking a fixed share of the requests
  // in between (growCatalog, DECISIONS.md 2026-11-06). When there is nothing to do, poll for new visitor requests.
  // Called before every product, so a visitor waits for at most one product in progress, not a whole chunk.
  async function serveVisitors(): Promise<boolean> {
    const links = await resolveShortLinks();
    let visitors = await nextQueued("visitor", tried, true);
    if (!visitors.length && !(await watchedDue())) visitors = await nextQueued("visitor", tried, false);
    for (const q of visitors) {
      if (breaker.openReason || !inWindow()) break;
      tried.add(q.external_id);
      if (await addQueued(q, runId)) seeded++;
    }
    return links > 0 || visitors.length > 0;
  }

  // New products get their share of the requests (newProductTurn), between re-checks, so re-checks can never take
  // the whole window (6 Nov 2026: the catalog grew by 4). A due tracked product still goes first.
  let newRequests = 0;
  let seedsLeft = true;
  async function growCatalog() {
    while (seedsLeft && newProductTurn(newRequests, requests) && !breaker.openReason && inWindow()) {
      if (await watchedDue()) return;
      const [q] = await nextQueued("seed", tried);
      if (!q) { seedsLeft = false; return; }
      tried.add(q.external_id);
      const before = requests;
      if (await addQueued(q, runId)) seeded++;
      newRequests += Math.max(1, requests - before);
    }
  }

  // The request count is saved as the run goes, so a crashed or cancelled run keeps it.
  let savedRequests = -1;
  const saveRequests = async () => {
    if (requests === savedRequests) return;
    await sql`update collection_runs set requests = ${requests} where id = ${runId}`;
    savedRequests = requests;
  };
  while (!breaker.openReason && inWindow()) {
    await saveRequests();
    if (await serveVisitors()) continue;
    const due = await claimDue(env.chunkSize());
    if (due.length) {
      for (const row of due) {
        if (!breaker.openReason && inWindow()) await serveVisitors();
        if (breaker.openReason || !inWindow()) { await release(row.product_id); continue; }
        if (await checkProduct(row, runId)) changed++;
        await growCatalog();
      }
      continue;
    }
    const seeds = await nextQueued("seed", tried);
    if (seeds.length) {
      for (const q of seeds) {
        if (!breaker.openReason && inWindow()) await serveVisitors();
        if (breaker.openReason || !inWindow()) break;
        tried.add(q.external_id);
        if (await addQueued(q, runId)) seeded++;
      }
      continue;
    }
    await new Promise((r) => setTimeout(r, env.idlePollMs()));
  }

  await sendQueued();
  const aborted = breaker.openReason;
  await sql`update collection_runs set finished_at = now(), checked = ${breaker.checked}, changed = ${changed},
    failed = ${breaker.failed}, aborted_reason = ${aborted}, requests = ${requests} where id = ${runId}`;
  const [left] = await sql<{ due: number; queued: number }[]>`
    select (select count(*)::int from collection_schedule where next_check_at <= now() and fail_count < 10) as due,
           (select count(*)::int from seed_queue where status = 'pending' and attempts < 3) as queued`;
  console.log(JSON.stringify({ runId, requests, checked: breaker.checked, changed, seeded, failed: breaker.failed, aborted, stillDue: left?.due, stillQueued: left?.queued }));
  if (!aborted) await postToChannel(runId).catch((e) => console.error(`channel post: ${e}`));
  const hc = env.healthcheckUrl();
  if (hc) await fetch(aborted ? `${hc}/fail` : hc, { method: "POST", body: aborted ?? "ok" }).catch(() => {});
  if (aborted) process.exitCode = 2;
}

/**
 * Short links the website could not resolve (Kaspi does not answer Vercel), and variant links (clothes, shoes):
 * one non-following GET of https://l.kaspi.kz or https://kaspi.kz/shop/p/-<code>/ + the validated path each, then
 * the product is queued as a visitor request. A short link that points to a variant link takes one more GET.
 */
async function resolveShortLinks(): Promise<number> {
  const rows = await sql<{ code: string; path: string }[]>`
    select code, path from short_link_queue where status = 'pending' and attempts < 3 order by added_at limit 5`;
  for (const r of rows) {
    try {
      let target = await kaspi.resolveShortLink(queuedLinkUrl(r.path));
      const variant = target ? variantLinkCode(target) : null;
      if (variant) target = await kaspi.resolveShortLink(queuedLinkUrl(variant.path));
      const p = target ? parseKaspiUrl(target) : null;
      if (!p?.ok) {
        await sql`update short_link_queue set status = 'failed', attempts = attempts + 1, last_error = ${`points to ${target}`.slice(0, 500)} where code = ${r.code}`;
        continue;
      }
      await requestProduct(sql, p.productId, p.slug, 10_000);
      await sql`update short_link_queue set status = 'resolved', external_id = ${p.productId}, slug = ${p.slug}, resolved_at = now() where code = ${r.code}`;
      // Prices set on the waiting page move onto the product (migration 0009).
      await attachShortLinkTrackings(sql, r.code, p.productId);
      breaker.record(true);
    } catch (e) {
      if (e instanceof KaspiRequestRefused) break; // not sent: the link keeps its tries
      const http = e instanceof KaspiHttpError ? e : null;
      breaker.record(false, http?.isBlocking ?? false, e instanceof KaspiParseError);
      await sql`update short_link_queue set attempts = attempts + 1, last_error = ${String(e).slice(0, 500)},
        status = case when attempts + 1 >= 3 then 'failed' else 'pending' end where code = ${r.code}`;
      console.error(`short link ${r.code}: ${e}`);
    }
  }
  return rows.length;
}

/**
 * Queue lanes, worked out from live data on every claim (queueLane in packages/core/src/schedule.ts; DECISIONS.md,
 * 2026-11-05 "What people want is checked first"): 0 = tracked (due by its tier or USER_INTEREST.trackedMaxAgeMin after
 * its last check), 1 = opened by a person since its last check and not checked today, 2 = catalog enrichment by its tier.
 * A stale stored priority can never hold back a product someone wants.
 */
const lanes = () => sql`
  select cs.product_id, cs.priority, cs.next_check_at,
    case
      when exists (select 1 from trackings t where t.product_id = cs.product_id and t.status = 'active') then 0
      when p.last_viewed_at > now() - make_interval(days => ${USER_INTEREST.viewedWithinDays})
        and p.last_viewed_at > coalesce(s.last_checked_at, '-infinity')
        and (s.last_checked_at is null
          or (s.last_checked_at at time zone 'Asia/Almaty')::date < (now() at time zone 'Asia/Almaty')::date) then 1
      else 2 end as lane,
    coalesce(s.last_checked_at, '-infinity') as last_checked_at, cs.interval_minutes, cs.fail_count
  from collection_schedule cs join products p on p.id = cs.product_id left join product_state s on s.product_id = cs.product_id
  where p.status = 'active' and cs.fail_count < 10 and (cs.locked_until is null or cs.locked_until < now())`;
// A failing product (fail_count > 0) waits for its retry time in every lane (queueLane).
const isDue = () => sql`(l.next_check_at <= now() or (l.fail_count = 0 and (l.lane = 1
  or (l.lane = 0 and l.last_checked_at <= now() - make_interval(mins => least(l.interval_minutes, ${USER_INTEREST.trackedMaxAgeMin}))))))`;

/**
 * Claims due rows: lane first, then the tier (PRIORITY_ORDER), then the longest overdue, so when the day's requests
 * run short the catalog slips, never a product someone wants. locked_until stops an overlapping run from taking it.
 */
function claimDue(limit: number) {
  return sql<DueRow[]>`
    update collection_schedule cs set locked_until = now() + interval '45 minutes'
    from products p left join product_state s on s.product_id = p.id
    where cs.product_id = p.id and cs.product_id in (
      select l.product_id from (${lanes()}) l join collection_schedule c on c.product_id = l.product_id
      where ${isDue()}
      order by l.lane, array_position(${sql.array(PRIORITY_ORDER)}::text[], l.priority), l.next_check_at
      limit ${limit} for update of c skip locked)
    returning cs.product_id, p.external_id, p.slug, cs.fail_count, cs.interval_minutes, s.current_min_price,
              p.title, p.image_url, p.category_path, p.page_checked_at, cs.priority`;
}

/** Due products someone tracks, not yet claimed: while there are any, a pasted product nobody tracks waits. */
async function watchedDue(): Promise<boolean> {
  const rows = await sql`select 1 from (${lanes()}) l where l.lane = 0 and ${isDue()} limit 1`;
  return rows.length > 0;
}

function release(productId: number) {
  return sql`update collection_schedule set locked_until = null where product_id = ${productId}`;
}

/**
 * Routine check: offers only (1 request); the product page too when it is older than its tier allows (7 or 30
 * days), for unwatched products at most CATALOG.pageRefreshPerRun per run.
 */
let pagesRefreshed = 0;
async function checkProduct(row: DueRow, runId: number): Promise<boolean> {
  try {
    const needPage = needsPageRefresh({ pageCheckedAt: row.page_checked_at, priority: row.priority, refreshedThisRun: pagesRefreshed, now: new Date() });
    if (needPage) pagesRefreshed++;
    const page = needPage
      ? await kaspi.fetchProductPage(row.external_id)
      : { id: row.external_id, title: row.title, imageUrl: row.image_url, categoryPath: row.category_path };
    let offers = await kaspi.fetchOffers(row.external_id);
    const min = offers[0]?.price ?? null;
    if (min !== null && isSuspiciousJump(row.current_min_price, min)) {
      const again = await kaspi.fetchOffers(row.external_id);
      if ((again[0]?.price ?? null) !== min) throw new Error(`unstable price ${min} vs ${again[0]?.price ?? null}`);
      offers = again;
    }
    const snap = buildSnapshot(page, offers);
    const saved = await saveSnapshot(sql, snap, row.slug, runId, { pageFetched: needPage });
    await afterSave(row.product_id, row.external_id, snap.minPrice, snap.offers[0]?.sellerName ?? null);
    await reschedule(row.product_id, snap.minPrice);
    breaker.record(true);
    return saved.priceChanged;
  } catch (e) {
    if (e instanceof KaspiRequestRefused) { await release(row.product_id); return false; } // not sent: no failure
    const http = e instanceof KaspiHttpError ? e : null;
    breaker.record(false, http?.isBlocking ?? false, e instanceof KaspiParseError);
    if (http?.isNotFound) await sql`update products set status = 'delisted' where id = ${row.product_id}`;
    const fails = row.fail_count + 1;
    await sql`update collection_schedule set fail_count = ${fails}, last_error = ${String(e).slice(0, 500)},
      locked_until = null, next_check_at = now() + make_interval(mins => ${backoffMinutes(fails, row.interval_minutes)})
      where product_id = ${row.product_id}`;
    console.error(`product ${row.external_id}: ${e}`);
    return false;
  }
}

type Queued = { external_id: string; slug: string | null; source: "seed" | "visitor"; min_price: number | null };

/** Queued rows, oldest first; `tracked` true = only products someone already tracks, false = only the others. */
function nextQueued(source: "seed" | "visitor", tried: Set<string>, tracked?: boolean) {
  const has = sql`exists (select 1 from trackings t where t.external_id = q.external_id and t.status = 'active')`;
  return sql<Queued[]>`
    select q.external_id, q.slug, q.source, q.min_price from seed_queue q
    where q.source = ${source} and q.status = 'pending' and q.attempts < 3 and q.external_id <> all(${sql.array([...tried])})
      ${tracked === undefined ? sql`` : tracked ? sql`and ${has}` : sql`and not ${has}`}
    order by q.added_at limit ${env.chunkSize()}`;
}

/**
 * First fetch of a queued product (page + offers = 2 requests). Seed rows become seed products, unless the row
 * has a min_price (rare categories) and the first price is below it: then the product keeps its observed price
 * but is checked like any product nobody watches.
 */
async function addQueued(q: Queued, runId: number): Promise<boolean> {
  try {
    const snap = await kaspi.fetchSnapshot(q.external_id);
    const { productId } = await saveSnapshot(sql, snap, q.slug, runId);
    const keep = q.min_price === null || (snap.minPrice !== null && snap.minPrice >= q.min_price);
    if (q.source === "seed" && keep) await sql`update products set is_seed = true where id = ${productId}`;
    else await sql`update products set last_viewed_at = now() where id = ${productId}`;
    await afterSave(productId, q.external_id, snap.minPrice, snap.offers[0]?.sellerName ?? null);
    await reschedule(productId, snap.minPrice); // next check in 18 h, not again in this window
    await sql`delete from seed_queue where external_id = ${q.external_id}`;
    breaker.record(true);
    return true;
  } catch (e) {
    if (e instanceof KaspiRequestRefused) return false; // not sent: the row keeps its tries
    const http = e instanceof KaspiHttpError ? e : null;
    breaker.record(false, http?.isBlocking ?? false, e instanceof KaspiParseError);
    if (http?.isNotFound) await sql`update seed_queue set status = 'not_found', last_error = ${String(e).slice(0, 500)} where external_id = ${q.external_id}`;
    else await sql`update seed_queue set attempts = attempts + 1, last_error = ${String(e).slice(0, 500)} where external_id = ${q.external_id}`;
    console.error(`queued ${q.source} ${q.external_id}: ${e}`);
    return false;
  }
}

async function reschedule(productId: number, minPrice: number | null) {
  const [t] = await sql<{ n: number; dist: number | null }[]>`
    select count(*)::int as n, min((${minPrice}::int - target_price)::float / target_price * 100) as dist
    from trackings where product_id = ${productId} and status = 'active'`;
  // seed_rank: active seed products ahead of this one: priced SEED_MIN_PRICE.premium or more before cheaper ones,
  // then more Kaspi reviews. A product whose reviews are not known yet ranks 0 (daily) until its page is
  // refreshed, and does not push known ones down.
  const premium = SEED_MIN_PRICE.premium;
  const [p] = await sql<{ is_seed: boolean; viewed_days: number | null; seed_rank: number }[]>`
    with x as (
      select p.id, p.is_seed, p.last_viewed_at, p.kaspi_reviews, coalesce(s.current_min_price, 0) >= ${premium} as top
      from products p left join product_state s on s.product_id = p.id where p.id = ${productId})
    select is_seed, extract(day from now() - last_viewed_at)::int as viewed_days,
           case when kaspi_reviews is null then 0 else (select count(*)::int from products o
             left join product_state os on os.product_id = o.id
             where o.is_seed and o.status = 'active' and o.kaspi_reviews is not null
               and ((coalesce(os.current_min_price, 0) >= ${premium}) > x.top
                 or ((coalesce(os.current_min_price, 0) >= ${premium}) = x.top and o.kaspi_reviews > x.kaspi_reviews))) end as seed_rank
    from x`;
  const priority = priorityFor({
    activeTrackings: t?.n ?? 0, minDistanceToTargetPct: minPrice === null ? null : (t?.dist ?? null),
    isSeed: p?.is_seed ?? false, lastViewedDaysAgo: p?.viewed_days ?? null, seedRank: p?.seed_rank ?? 0,
  });
  const minutes = INTERVAL_MINUTES[priority];
  await sql`update collection_schedule set priority = ${priority}, interval_minutes = ${minutes}, fail_count = 0,
    last_error = null, locked_until = null, next_check_at = now() + make_interval(mins => ${minutes})
    where product_id = ${productId}`;
}

/**
 * After every saved check: percentage targets set before the first price become prices (migration 0010), watchers
 * who set a price while the product was queued get its first price (with their price in tenge), then target
 * alerts are evaluated; messages go out at once to every channel the watcher connected (Telegram, a confirmed
 * email address), with no Kaspi request, so a visitor hears within minutes.
 */
async function afterSave(productId: number, externalId: string, price: number | null, seller: string | null) {
  if (price !== null) {
    const pending = await sql<{ id: string; pct: number }[]>`
      select id, target_drop_pct as pct from trackings
      where product_id = ${productId} and target_price is null and target_drop_pct is not null`;
    for (const p of pending) {
      const target = targetForDrop(price, p.pct);
      if (target) await sql`update trackings set target_price = ${target} where id = ${p.id} and target_price is null`;
    }
  }
  // The first price goes out once there is a price and somewhere to send it: a watcher who connects Telegram or
  // confirms an email later gets it after the next check, and nobody is ever told "0 ₸". Marking and queueing
  // happen in one transaction, so a crash cannot mark a tracking as told without its message.
  if (price !== null) {
    await sql.begin(async (tx) => {
      const waiting = await tx<{ id: string; tg: boolean; mail: boolean }[]>`
        update trackings t set first_price_sent_at = now()
        from watchers w
        where t.product_id = ${productId} and t.watcher_id = w.id and t.status = 'active' and t.first_price_sent_at is null
          and (w.telegram_chat_id is not null or w.email_confirmed_at is not null)
        returning t.id, w.telegram_chat_id is not null as tg, w.email_confirmed_at is not null as mail`;
      for (const w of waiting) await queueNotification(tx, w, "first_price", price, `${w.id}:first`);
    });
  }
  if (price !== null) await evaluateTrackings(productId, externalId, price, seller);
  await sendAfterCheck();
}

/**
 * One notification row per connected channel. Telegram keeps the plain idempotency key (rows from before email
 * existed use it); email adds ":email". The unique key makes a duplicate impossible, even with overlapping runs.
 */
async function queueNotification(sql: postgres.Sql | postgres.TransactionSql, t: { id: string; tg: boolean; mail: boolean }, type: "first_price" | "target_reached" | "bought_ask", price: number, key: string) {
  if (t.tg || t.mail) newMessages = true;
  if (t.tg) await sql`insert into notifications (tracking_id, type, channel, price, idempotency_key)
    values (${t.id}, ${type}, 'telegram', ${price}, ${key}) on conflict (idempotency_key) do nothing`;
  if (t.mail) await sql`insert into notifications (tracking_id, type, channel, price, idempotency_key)
    values (${t.id}, ${type}, 'email', ${price}, ${`${key}:email`}) on conflict (idempotency_key) do nothing`;
}

async function evaluateTrackings(productId: number, externalId: string, price: number, seller: string | null) {
  const rows = await sql<{ id: string; target_price: number; alert_state: "armed" | "triggered"; episode: number; last_triggered_at: Date | null; above_since: Date | null; tg: boolean; mail: boolean }[]>`
    select t.id, t.target_price, t.alert_state, t.episode, t.last_triggered_at, t.above_since,
           coalesce(w.telegram_chat_id is not null, false) as tg, coalesce(w.email_confirmed_at is not null, false) as mail
    from trackings t left join watchers w on w.id = t.watcher_id
    where t.product_id = ${productId} and t.status = 'active' and t.target_price is not null`;
  // One confirmation request per product and check, however many watchers crossed their price. A failed or refused
  // confirmation sends nothing (the next check tries again); a 403/429 stops the run like any other request.
  let confirmed: Promise<number | null> | undefined;
  const confirm = () => (confirmed ??= kaspi.fetchOffers(externalId).then((o) => o[0]?.price ?? null, (e) => {
    if (e instanceof KaspiHttpError && e.isBlocking) breaker.blockedOnce();
    if (!(e instanceof KaspiRequestRefused)) console.error(`confirmation ${externalId}: ${e}`);
    return null;
  }));
  for (const r of rows) {
    const state: TrackingAlertState = {
      trackingId: r.id, targetPrice: r.target_price, state: r.alert_state, episode: r.episode,
      lastTriggeredAt: r.last_triggered_at, aboveSince: r.above_since,
    };
    const now = new Date();
    let d = evaluateAlert(state, price, now, false);
    if (d.action === "confirm") {
      // Re-fetch once before alerting so a glitch never reaches an inbox.
      const confirmedPrice = await confirm();
      d = confirmedPrice !== null && confirmedPrice <= r.target_price
        ? evaluateAlert(state, confirmedPrice, now, true)
        : { action: "none", next: state };
    }
    const n = d.next;
    // The new alert state and its messages are saved together: a crash in between can neither lose an alert
    // (state "triggered", nothing queued) nor queue one twice (the idempotency key).
    await sql.begin(async (tx) => {
      await tx`update trackings set alert_state = ${n.state}, episode = ${n.episode},
        last_triggered_at = ${n.lastTriggeredAt}, above_since = ${n.aboveSince} where id = ${r.id}`;
      // A watcher with no channel has nowhere to be told; the page and "Мои товары" still show the price.
      if (d.action === "send") await queueNotification(tx, r, "target_reached", price, d.idempotencyKey);
    });
    void seller;
  }
}

/** Queued Telegram messages for watchers (first price, target reached). Only the Telegram API is called. */
async function sendTelegramQueued() {
  const token = env.telegramBotToken();
  if (!token) return;
  const queued = await sql<{ id: number; type: "first_price" | "target_reached" | "bought_ask"; price: number; target_price: number | null; chat_id: string; locale: "ru" | "kk"; title: string; external_id: string; current: number | null; offer_count: number; bought_code: string | null }[]>`
    select n.id, n.type, n.price, t.target_price, w.telegram_chat_id::text as chat_id, w.locale, p.title, p.external_id,
           s.current_min_price as current, coalesce(s.offer_count, 0) as offer_count, t.bought_code
    from notifications n
    join trackings t on t.id = n.tracking_id
    join watchers w on w.id = t.watcher_id
    join products p on p.id = t.product_id
    left join product_state s on s.product_id = p.id
    where n.id = any(${sql.array(await claimNotifications(sql, "telegram"))}::bigint[])`;
  for (const q of queued) {
    const site = env.siteUrl();
    const msg = q.type === "bought_ask" ? renderTelegramBoughtAsk({ locale: q.locale, title: q.title, code: q.bought_code ?? "" }) : renderTelegramAlert({
      type: q.type, locale: q.locale, title: q.title,
      price: q.type === "first_price" ? q.current : q.price, target: q.target_price, offerCount: q.offer_count,
      productUrl: `${site}/${q.locale}/p/${q.external_id}`, kaspiUrl: `${site}/go/${q.external_id}?n=${q.id}`,
    });
    try {
      await startSend(sql, q.id);
      const messageId = await sendTelegram(token, q.chat_id, msg);
      await markSent(sql, q.id, String(messageId));
    } catch (e) {
      await deliveryFailed(q.id, e);
    }
  }
}

/** A failed send, recorded with its retry (markFailed in packages/db/src/delivery.ts). */
async function deliveryFailed(id: number, e: unknown) {
  const next = await markFailed(sql, id, e instanceof DeliveryError && e.permanent, String(e));
  console.error(`notification ${id}: ${e} → ${next.status === "queued" ? `retry in ${next.retryInMinutes} min` : "failed"}`);
}

/**
 * Sending. The full round (crash recovery and expiry, "Вы купили?" asks, retries due) runs at the start and end of a
 * run and at most every FULL_SEND_EVERY_MS in between; after a check, messages go out at once only when that check
 * queued one (newMessages). Running the full round after every check cost ~2 s a check on 6 Nov (database round
 * trips from the runner), which the Kaspi pacing then had to wait for: 17% fewer checks.
 */
const FULL_SEND_EVERY_MS = 5 * 60_000;
let lastFullSend = 0;
let newMessages = false;
async function sendQueued(full = true) {
  if (full) {
    await tidyDeliveries(sql);
    await queueBoughtAsks();
    lastFullSend = Date.now();
  }
  newMessages = false;
  await sendTelegramQueued();
  await sendEmailQueued();
}
async function sendAfterCheck() {
  if (Date.now() - lastFullSend >= FULL_SEND_EVERY_MS) await sendQueued(true);
  else if (newMessages) await sendQueued(false);
}

/**
 * The daily drops post in the public channel, after a finished collection run. Once a day: skipped when another
 * run already finished checks today (a backup trigger after a crash). Database and Telegram only, no Kaspi.
 */
async function postToChannel(runId: number) {
  const token = env.telegramBotToken();
  const channel = env.telegramChannel();
  if (!token || !channel) return;
  const [earlier] = await sql<{ n: number }[]>`
    select count(*)::int as n from collection_runs where id <> ${runId} and checked > 0 and finished_at is not null
      and (finished_at at time zone 'Asia/Almaty')::date = (now() at time zone 'Asia/Almaty')::date`;
  if (earlier!.n > 0) return;
  const movers = await weekMovers(sql, "down", 5, 5);
  if (!movers.length) { console.log("channel post: no drops of 5% or more"); return; }
  const day = almatyDay();
  const msg = renderChannelPost({ locale: env.telegramChannelLocale(), movers, site: env.siteUrl(), day, saleId: runningSale(day)?.id ?? null });
  await sendTelegram(token, channel, msg);
  console.log(`channel post: ${movers.length} drops`);
}

/**
 * "Вы купили?" (migration 0011): asked once per tracking, 20 hours to 7 days after its target alert went out, unless
 * the visitor already answered in "Мои товары". The ask gets the code its answer links carry. Also drops funnel
 * events older than 180 days, as the privacy page says. Database only, no Kaspi request.
 */
async function queueBoughtAsks() {
  await sql.begin(async (tx) => {
    const due = await tx<{ id: string; tg: boolean; mail: boolean }[]>`
      update trackings t set bought_asked_at = now(), bought_code = replace(gen_random_uuid()::text, '-', '')
      from watchers w
      where w.id = t.watcher_id and t.bought is null and t.bought_asked_at is null and t.product_id is not null
        and exists (select 1 from notifications n where n.tracking_id = t.id and n.type = 'target_reached' and n.status = 'sent'
                    and n.sent_at between now() - interval '7 days' and now() - interval '20 hours')
      returning t.id, w.telegram_chat_id is not null as tg, w.email_confirmed_at is not null as mail`;
    for (const t of due) await queueNotification(tx, t, "bought_ask", 0, `${t.id}:bought`);
  });
}

/** Once a run: funnel events older than 180 days (as the privacy page says) and email limit rows older than 2 days. */
async function cleanUp() {
  await sql`delete from events where at < now() - interval '180 days'`;
  await sql`delete from email_requests where at < now() - interval '2 days'`;
}

/**
 * Queued emails for watchers with a confirmed address (migration 0008). Only the Resend API is called, at most two
 * requests a second (Resend's limit). Every email carries the one-click unsubscribe header.
 */
async function sendEmailQueued() {
  const key = env.resendApiKey();
  if (!key) return;
  const queued = await sql<{ id: number; key: string; type: "first_price" | "target_reached" | "bought_ask"; price: number; target_price: number | null; email: string; stop_code: string; locale: "ru" | "kk"; title: string; external_id: string; current: number | null; offer_count: number; bought_code: string | null }[]>`
    select n.id, n.idempotency_key as key, n.type, n.price, t.target_price, w.email, w.email_stop_code as stop_code, w.locale, p.title, p.external_id,
           s.current_min_price as current, coalesce(s.offer_count, 0) as offer_count, t.bought_code
    from notifications n
    join trackings t on t.id = n.tracking_id
    join watchers w on w.id = t.watcher_id
    join products p on p.id = t.product_id
    left join product_state s on s.product_id = p.id
    where n.id = any(${sql.array(await claimNotifications(sql, "email"))}::bigint[])`;
  for (const q of queued) {
    const site = env.siteUrl();
    const [top] = q.type === "target_reached" ? await sql<{ name: string }[]>`
      select se.name from offers_current o join sellers se on se.id = o.seller_id
      join products p on p.id = o.product_id where p.external_id = ${q.external_id} order by o.price limit 1` : [];
    const stopUrl = `${site}/${q.locale}/email?stop=${q.stop_code}`;
    const msg = q.type === "bought_ask" ? renderBoughtEmail({
      locale: q.locale, title: q.title, stopUrl,
      answerUrl: (a) => `${site}/${q.locale}/bought/${q.bought_code}?a=${a}`,
    }) : renderAlertEmail({
      type: q.type, locale: q.locale, title: q.title,
      price: q.type === "first_price" ? q.current : q.price, target: q.target_price,
      seller: top?.name ?? null, offerCount: q.offer_count,
      productUrl: `${site}/${q.locale}/p/${q.external_id}`, kaspiUrl: `${site}/go/${q.external_id}?n=${q.id}`,
      stopUrl,
    });
    try {
      await startSend(sql, q.id);
      const r = await sendViaResend(key, env.emailFrom(), q.email, msg, `${site}/api/email/stop?c=${q.stop_code}`, q.key);
      await markSent(sql, q.id, r.id);
    } catch (e) {
      await deliveryFailed(q.id, e);
    }
    await new Promise((r) => setTimeout(r, 600));
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => sql.end());

export { canonicalProductUrl };
