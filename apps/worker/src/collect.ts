/**
 * One daily collection run inside Kaspi's robots.txt visit window (04:00–08:45 UTC; we use 04:05–08:30), one request per ≥10 s:
 * fetch visitor requests first, then check due products (offers only; product page weekly), then queued seed
 * products; poll for new visitor requests until the window closes; evaluate alerts; send the first price and
 * target alerts to Telegram right after each check, queued emails at the end. Started by .github/workflows/collect.yml at 03:50 UTC; waits for 04:05.
 */
import { createKaspiClient, buildSnapshot, KaspiHttpError, KaspiParseError, canonicalProductUrl, parseKaspiUrl, shortLinkUrl } from "@baga/kaspi";
import { saveSnapshot, connectionOptions, requestProduct, attachShortLinkTrackings } from "@baga/db";
import {
  evaluateAlert, priorityFor, INTERVAL_MINUTES, backoffMinutes, isSuspiciousJump, type TrackingAlertState,
  KASPI_CRAWL_DELAY_MS, isInVisitWindow, msUntilVisitWindow, targetForDrop,
} from "@baga/core";
import postgres from "postgres";
import { env } from "./env";
import { CircuitBreaker } from "./breaker";
import { renderAlertEmail, sendViaResend } from "./email";
import { renderTelegramAlert, sendTelegram } from "./telegram";

const sql = postgres(env.databaseUrl(), { max: 2, ...connectionOptions(env.databaseUrl()) });
// Every request this run makes (page, offers, re-checks, alert confirmations) goes through this gate.
const kaspi = createKaspiClient({ minIntervalMs: KASPI_CRAWL_DELAY_MS, jitterMs: 2_000 });
const breaker = new CircuitBreaker();

const PAGE_REFRESH_MS = 7 * 24 * 3_600_000;
// Worst case for one product: page + offers + suspicious re-check + alert confirmation = 4 requests ≈ 48 s.
// Stop starting new products when less than this remains, so no request lands after 08:30 UTC.
const WINDOW_MARGIN_MS = 60_000;
const inWindow = () => isInVisitWindow(new Date(), WINDOW_MARGIN_MS);

type DueRow = {
  product_id: number; external_id: string; slug: string | null; fail_count: number; interval_minutes: number;
  current_min_price: number | null; title: string; image_url: string | null; category_path: string[];
  page_checked_at: Date | null;
};

async function main() {
  const wait = msUntilVisitWindow(new Date());
  if (wait > env.windowWaitMaxMs()) {
    console.log(JSON.stringify({ skipped: "outside collection window (04:05-08:30 UTC)", opensInMinutes: Math.round(wait / 60_000) }));
    await sendQueued(); // Telegram and email only, no Kaspi requests
    return;
  }
  if (wait > 0) {
    console.log(`waiting ${Math.ceil(wait / 1000)} s for Kaspi visit window`);
    await new Promise((r) => setTimeout(r, wait));
  }

  const [run] = await sql<{ id: number }[]>`insert into collection_runs (runner) values (${env.runner()}) returning id`;
  const runId = run!.id;
  let changed = 0;
  let seeded = 0;
  const tried = new Set<string>(); // each queued product gets at most one attempt per run

  // Order on every turn: visitor requests (someone is waiting), then due products, then seed rows.
  // When there is nothing to do, poll for new visitor requests until the window closes.
  // Someone is looking at a "Получаем цену…" page: called before every product, so a visitor waits for at
  // most one product in progress, not a whole chunk.
  async function serveVisitors(): Promise<boolean> {
    const links = await resolveShortLinks();
    const visitors = await nextQueued("visitor", tried);
    for (const q of visitors) {
      if (breaker.openReason || !inWindow()) break;
      tried.add(q.external_id);
      if (await addQueued(q, runId)) seeded++;
    }
    return links > 0 || visitors.length > 0;
  }

  while (!breaker.openReason && inWindow()) {
    if (await serveVisitors()) continue;
    const due = await claimDue(env.chunkSize());
    if (due.length) {
      for (const row of due) {
        if (!breaker.openReason && inWindow()) await serveVisitors();
        if (breaker.openReason || !inWindow()) { await release(row.product_id); continue; }
        if (await checkProduct(row, runId)) changed++;
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
    failed = ${breaker.failed}, aborted_reason = ${aborted} where id = ${runId}`;
  const [left] = await sql<{ due: number; queued: number }[]>`
    select (select count(*)::int from collection_schedule where next_check_at <= now() and fail_count < 10) as due,
           (select count(*)::int from seed_queue where status = 'pending' and attempts < 3) as queued`;
  console.log(JSON.stringify({ runId, checked: breaker.checked, changed, seeded, failed: breaker.failed, aborted, stillDue: left?.due, stillQueued: left?.queued }));
  const hc = env.healthcheckUrl();
  if (hc) await fetch(aborted ? `${hc}/fail` : hc, { method: "POST", body: aborted ?? "ok" }).catch(() => {});
  if (aborted) process.exitCode = 2;
}

/**
 * Short links the website could not resolve (Kaspi does not answer Vercel): one non-following GET of
 * https://l.kaspi.kz + the validated path each, then the product is queued as a visitor request.
 */
async function resolveShortLinks(): Promise<number> {
  const rows = await sql<{ code: string; path: string }[]>`
    select code, path from short_link_queue where status = 'pending' and attempts < 3 order by added_at limit 5`;
  for (const r of rows) {
    try {
      const target = await kaspi.resolveShortLink(shortLinkUrl(r.path));
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
      const http = e instanceof KaspiHttpError ? e : null;
      breaker.record(false, http?.isBlocking ?? false, e instanceof KaspiParseError);
      await sql`update short_link_queue set attempts = attempts + 1, last_error = ${String(e).slice(0, 500)},
        status = case when attempts + 1 >= 3 then 'failed' else 'pending' end where code = ${r.code}`;
      console.error(`short link ${r.code}: ${e}`);
    }
  }
  return rows.length;
}

/** Claims due rows; locked_until stops an overlapping run from taking the same product. */
function claimDue(limit: number) {
  return sql<DueRow[]>`
    update collection_schedule cs set locked_until = now() + interval '45 minutes'
    from products p left join product_state s on s.product_id = p.id
    where cs.product_id = p.id and cs.product_id in (
      select product_id from collection_schedule
      where next_check_at <= now() and fail_count < 10 and (locked_until is null or locked_until < now())
      order by next_check_at limit ${limit} for update skip locked)
    returning cs.product_id, p.external_id, p.slug, cs.fail_count, cs.interval_minutes, s.current_min_price,
              p.title, p.image_url, p.category_path, p.page_checked_at`;
}

function release(productId: number) {
  return sql`update collection_schedule set locked_until = null where product_id = ${productId}`;
}

/** Routine check: offers only (1 request); the product page too when it is older than a week. */
async function checkProduct(row: DueRow, runId: number): Promise<boolean> {
  try {
    const needPage = !row.page_checked_at || Date.now() - row.page_checked_at.getTime() > PAGE_REFRESH_MS;
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

type Queued = { external_id: string; slug: string | null; source: "seed" | "visitor" };

function nextQueued(source: "seed" | "visitor", tried: Set<string>) {
  return sql<Queued[]>`
    select external_id, slug, source from seed_queue
    where source = ${source} and status = 'pending' and attempts < 3 and external_id <> all(${sql.array([...tried])})
    order by added_at limit ${env.chunkSize()}`;
}

/** First fetch of a queued product (page + offers = 2 requests). Seed rows become seed products. */
async function addQueued(q: Queued, runId: number): Promise<boolean> {
  try {
    const snap = await kaspi.fetchSnapshot(q.external_id);
    const { productId } = await saveSnapshot(sql, snap, q.slug, runId);
    if (q.source === "seed") await sql`update products set is_seed = true where id = ${productId}`;
    else await sql`update products set last_viewed_at = now() where id = ${productId}`;
    await afterSave(productId, q.external_id, snap.minPrice, snap.offers[0]?.sellerName ?? null);
    await reschedule(productId, snap.minPrice); // next check in 18 h, not again in this window
    await sql`delete from seed_queue where external_id = ${q.external_id}`;
    breaker.record(true);
    return true;
  } catch (e) {
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
  const [p] = await sql<{ is_seed: boolean; viewed_days: number | null }[]>`
    select is_seed, extract(day from now() - last_viewed_at)::int as viewed_days from products where id = ${productId}`;
  const priority = priorityFor({
    activeTrackings: t?.n ?? 0, minDistanceToTargetPct: minPrice === null ? null : (t?.dist ?? null),
    isSeed: p?.is_seed ?? false, lastViewedDaysAgo: p?.viewed_days ?? null,
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
  const waiting = await sql<{ id: string; tg: boolean; mail: boolean }[]>`
    update trackings t set first_price_sent_at = now()
    from watchers w
    where t.product_id = ${productId} and t.watcher_id = w.id and t.status = 'active' and t.first_price_sent_at is null
    returning t.id, w.telegram_chat_id is not null as tg, w.email_confirmed_at is not null as mail`;
  for (const w of waiting) await queueNotification(w, "first_price", price ?? 0, `${w.id}:first`);
  if (price !== null) await evaluateTrackings(productId, externalId, price, seller);
  await sendQueued();
}

/**
 * One notification row per connected channel. Telegram keeps the plain idempotency key (rows from before email
 * existed use it); email adds ":email". The unique key makes a duplicate impossible, even with overlapping runs.
 */
async function queueNotification(t: { id: string; tg: boolean; mail: boolean }, type: "first_price" | "target_reached", price: number, key: string) {
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
  for (const r of rows) {
    const state: TrackingAlertState = {
      trackingId: r.id, targetPrice: r.target_price, state: r.alert_state, episode: r.episode,
      lastTriggeredAt: r.last_triggered_at, aboveSince: r.above_since,
    };
    const now = new Date();
    let d = evaluateAlert(state, price, now, false);
    if (d.action === "confirm") {
      // Re-fetch once before alerting so a glitch never reaches an inbox.
      const offers = await kaspi.fetchOffers(externalId).catch(() => []);
      const confirmedPrice = offers[0]?.price;
      d = confirmedPrice !== undefined && confirmedPrice <= r.target_price
        ? evaluateAlert(state, confirmedPrice, now, true)
        : { action: "none", next: state };
    }
    const n = d.next;
    await sql`update trackings set alert_state = ${n.state}, episode = ${n.episode},
      last_triggered_at = ${n.lastTriggeredAt}, above_since = ${n.aboveSince} where id = ${r.id}`;
    // A watcher with no channel has nowhere to be told; the page and "Мои товары" still show the price.
    if (d.action === "send") await queueNotification(r, "target_reached", price, d.idempotencyKey);
    void seller;
  }
}

/** Queued Telegram messages for watchers (first price, target reached). Only the Telegram API is called. */
async function sendTelegramQueued() {
  const token = env.telegramBotToken();
  if (!token) return;
  const queued = await sql<{ id: number; type: "first_price" | "target_reached"; price: number; target_price: number | null; chat_id: string; locale: "ru" | "kk"; title: string; external_id: string; current: number | null; offer_count: number }[]>`
    select n.id, n.type, n.price, t.target_price, w.telegram_chat_id::text as chat_id, w.locale, p.title, p.external_id,
           s.current_min_price as current, coalesce(s.offer_count, 0) as offer_count
    from notifications n
    join trackings t on t.id = n.tracking_id
    join watchers w on w.id = t.watcher_id
    join products p on p.id = t.product_id
    left join product_state s on s.product_id = p.id
    where n.status = 'queued' and n.channel = 'telegram' and w.telegram_chat_id is not null
      and n.created_at > now() - interval '2 days'
    order by n.created_at limit 30`;
  for (const q of queued) {
    const site = env.siteUrl();
    const msg = renderTelegramAlert({
      type: q.type, locale: q.locale, title: q.title,
      price: q.type === "first_price" ? q.current : q.price, target: q.target_price, offerCount: q.offer_count,
      productUrl: `${site}/${q.locale}/p/${q.external_id}`, kaspiUrl: `${site}/go/${q.external_id}?n=${q.id}`,
    });
    try {
      const messageId = await sendTelegram(token, q.chat_id, msg);
      await sql`update notifications set status = 'sent', sent_at = now(), provider_message_id = ${String(messageId)} where id = ${q.id}`;
    } catch (e) {
      await sql`update notifications set status = 'failed' where id = ${q.id}`;
      console.error(`notification ${q.id}: ${e}`);
    }
  }
}

async function sendQueued() {
  await sendTelegramQueued();
  await sendEmailQueued();
}

/**
 * Queued emails for watchers with a confirmed address (migration 0008). Only the Resend API is called, at most two
 * requests a second (Resend's limit). Every email carries the one-click unsubscribe header.
 */
async function sendEmailQueued() {
  const key = env.resendApiKey();
  if (!key) return;
  const queued = await sql<{ id: number; type: "first_price" | "target_reached"; price: number; target_price: number | null; email: string; stop_code: string; locale: "ru" | "kk"; title: string; external_id: string; current: number | null; offer_count: number }[]>`
    select n.id, n.type, n.price, t.target_price, w.email, w.email_stop_code as stop_code, w.locale, p.title, p.external_id,
           s.current_min_price as current, coalesce(s.offer_count, 0) as offer_count
    from notifications n
    join trackings t on t.id = n.tracking_id
    join watchers w on w.id = t.watcher_id
    join products p on p.id = t.product_id
    left join product_state s on s.product_id = p.id
    where n.status = 'queued' and n.channel = 'email' and w.email_confirmed_at is not null and w.email_stop_code is not null
      and n.created_at > now() - interval '2 days'
    order by n.created_at limit 30`;
  for (const q of queued) {
    const site = env.siteUrl();
    const [top] = q.type === "target_reached" ? await sql<{ name: string }[]>`
      select se.name from offers_current o join sellers se on se.id = o.seller_id
      join products p on p.id = o.product_id where p.external_id = ${q.external_id} order by o.price limit 1` : [];
    const msg = renderAlertEmail({
      type: q.type, locale: q.locale, title: q.title,
      price: q.type === "first_price" ? q.current : q.price, target: q.target_price,
      seller: top?.name ?? null, offerCount: q.offer_count,
      productUrl: `${site}/${q.locale}/p/${q.external_id}`, kaspiUrl: `${site}/go/${q.external_id}?n=${q.id}`,
      stopUrl: `${site}/${q.locale}/email?stop=${q.stop_code}`,
    });
    try {
      const r = await sendViaResend(key, env.emailFrom(), q.email, msg, `${site}/api/email/stop?c=${q.stop_code}`);
      await sql`update notifications set status = 'sent', sent_at = now(), provider_message_id = ${r.id} where id = ${q.id}`;
    } catch (e) {
      await sql`update notifications set status = 'failed' where id = ${q.id}`;
      console.error(`notification ${q.id}: ${e}`);
    }
    await new Promise((r) => setTimeout(r, 600));
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => sql.end());

export { canonicalProductUrl };
