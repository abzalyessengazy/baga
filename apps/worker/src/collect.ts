/**
 * One collection run: claim due products, fetch Kaspi, store changes, evaluate alerts, send queued emails.
 * Safe to run every 15–30 minutes from GitHub Actions or a cron on a VPS.
 */
import { createKaspiClient, KaspiHttpError, canonicalProductUrl } from "@baga/kaspi";
import { saveSnapshot, connectionOptions } from "@baga/db";
import {
  evaluateAlert, priorityFor, INTERVAL_MINUTES, backoffMinutes, isSuspiciousJump, type TrackingAlertState,
} from "@baga/core";
import postgres from "postgres";
import { env } from "./env";
import { CircuitBreaker } from "./breaker";
import { renderTargetEmail, sendViaResend } from "./email";

const sql = postgres(env.databaseUrl(), { max: 2, ...connectionOptions(env.databaseUrl()) });
const kaspi = createKaspiClient();
const breaker = new CircuitBreaker();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms + Math.random() * ms * 0.5));

async function main() {
  const [run] = await sql<{ id: number }[]>`insert into collection_runs (runner) values (${env.runner()}) returning id`;
  const runId = run!.id;
  let changed = 0;

  // Claim due rows; locked_until prevents two overlapping runs from taking the same product.
  const due = await sql<{ product_id: number; external_id: string; slug: string | null; fail_count: number; interval_minutes: number; current_min_price: number | null }[]>`
    update collection_schedule cs set locked_until = now() + interval '20 minutes'
    from products p left join product_state s on s.product_id = p.id
    where cs.product_id = p.id and cs.product_id in (
      select product_id from collection_schedule
      where next_check_at <= now() and fail_count < 10 and (locked_until is null or locked_until < now())
      order by next_check_at limit ${env.batchSize()} for update skip locked)
    returning cs.product_id, p.external_id, p.slug, cs.fail_count, cs.interval_minutes, s.current_min_price`;

  for (const row of due) {
    if (breaker.openReason) break;
    try {
      let snap = await kaspi.fetchSnapshot(row.external_id);
      if (snap.minPrice !== null && isSuspiciousJump(row.current_min_price, snap.minPrice)) {
        await sleep(env.requestDelayMs());
        const again = await kaspi.fetchSnapshot(row.external_id);
        if (again.minPrice !== snap.minPrice) throw new Error(`unstable price ${snap.minPrice} vs ${again.minPrice}`);
        snap = again;
      }
      const saved = await saveSnapshot(sql, snap, row.slug, runId);
      if (saved.priceChanged) changed++;
      if (snap.minPrice !== null) await evaluateTrackings(row.product_id, row.external_id, snap.minPrice, snap.offers[0]?.sellerName ?? null);
      await reschedule(row.product_id, snap.minPrice);
      breaker.record(true);
    } catch (e) {
      const http = e instanceof KaspiHttpError ? e : null;
      breaker.record(false, http?.isBlocking ?? false);
      if (http?.isNotFound) await sql`update products set status = 'delisted' where id = ${row.product_id}`;
      const fails = row.fail_count + 1;
      await sql`update collection_schedule set fail_count = ${fails}, last_error = ${String(e).slice(0, 500)},
        locked_until = null, next_check_at = now() + make_interval(mins => ${backoffMinutes(fails, row.interval_minutes)})
        where product_id = ${row.product_id}`;
      console.error(`product ${row.external_id}: ${e}`);
    }
    await sleep(env.requestDelayMs());
  }

  await sendQueued();
  const aborted = breaker.openReason;
  await sql`update collection_runs set finished_at = now(), checked = ${breaker.checked}, changed = ${changed},
    failed = ${breaker.failed}, aborted_reason = ${aborted} where id = ${runId}`;
  console.log(JSON.stringify({ runId, checked: breaker.checked, changed, failed: breaker.failed, aborted }));
  const hc = env.healthcheckUrl();
  if (hc) await fetch(aborted ? `${hc}/fail` : hc, { method: "POST", body: aborted ?? "ok" }).catch(() => {});
  if (aborted) process.exitCode = 2;
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

async function evaluateTrackings(productId: number, externalId: string, price: number, seller: string | null) {
  const rows = await sql<{ id: string; target_price: number; alert_state: "armed" | "triggered"; episode: number; last_triggered_at: Date | null; above_since: Date | null }[]>`
    select id, target_price, alert_state, episode, last_triggered_at, above_since
    from trackings where product_id = ${productId} and status = 'active'`;
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
    if (d.action === "send") {
      // The unique idempotency key makes a duplicate alert impossible, even with overlapping runs.
      await sql`insert into notifications (tracking_id, price, idempotency_key)
        values (${r.id}, ${price}, ${d.idempotencyKey}) on conflict (idempotency_key) do nothing`;
    }
    void seller;
  }
}

async function sendQueued() {
  const key = env.resendApiKey();
  if (!key) return;
  const queued = await sql<{ id: number; price: number; target_price: number; email: string; locale: "ru" | "kk"; title: string; external_id: string; slug: string | null; tracking_id: string }[]>`
    select n.id, n.price, t.target_price, u.email, coalesce(pr.locale, 'ru') as locale, p.title, p.external_id, p.slug, t.id as tracking_id
    from notifications n
    join trackings t on t.id = n.tracking_id
    join auth.users u on u.id = t.user_id
    left join profiles pr on pr.user_id = t.user_id
    join products p on p.id = t.product_id
    where n.status = 'queued' and coalesce(pr.email_alerts_enabled, true)
    order by n.created_at limit 80`;
  for (const q of queued) {
    const site = env.siteUrl();
    const productUrl = `${site}/${q.locale}/p/${q.external_id}`;
    const unsubscribeUrl = `${site}/api/unsubscribe?t=${q.tracking_id}`;
    const kaspiUrl = `${site}/go/${q.external_id}?n=${q.id}`;
    const [top] = await sql<{ name: string }[]>`
      select se.name from offers_current o join sellers se on se.id = o.seller_id
      join products p on p.id = o.product_id where p.external_id = ${q.external_id} order by o.price limit 1`;
    const { subject, html } = renderTargetEmail({
      locale: q.locale, title: q.title, price: q.price, target: q.target_price, seller: top?.name ?? null,
      productUrl, kaspiUrl, unsubscribeUrl,
    });
    try {
      const r = await sendViaResend(key, env.emailFrom(), q.email, subject, html, unsubscribeUrl);
      await sql`update notifications set status = 'sent', sent_at = now(), provider_message_id = ${r.id} where id = ${q.id}`;
    } catch (e) {
      await sql`update notifications set status = 'failed' where id = ${q.id}`;
      console.error(`notification ${q.id}: ${e}`);
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => sql.end());

export { canonicalProductUrl };
