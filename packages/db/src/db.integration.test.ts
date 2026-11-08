/**
 * Integration tests against a real, disposable Postgres (review of 5 Nov 2026, item 21). They run only when
 * TEST_DATABASE_URL is set: CI starts an empty postgres:17 service for them (.github/workflows/ci.yml). They wipe
 * the public schema, so NEVER point TEST_DATABASE_URL at the production database.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DELIVERY } from "@baga/core";
import { claimNotifications, markFailed, markSent, startSend, tidyDeliveries } from "./delivery";
import { requestWatcherEmail, EMAIL_REQUEST_LIMITS, deleteWatcherTracking, listWatched } from "./watchers";
import { saveSnapshot } from "./queries";
import { dayMoves } from "./movers";
import { getShop, productSellers, saveShopFeedback } from "./shops";
import { decideMatch, matchesToPrice, saveMatch, saveStorePrice, storeMarketplaceId, storeOffers } from "./stores";
import type { ProductSnapshot } from "@baga/kaspi";

const url = process.env.TEST_DATABASE_URL;
/** saveSnapshot's statement budget (begin and commit included), independent of the number of sellers. */
const SAVE_SNAPSHOT_STATEMENTS = 14;
const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

describe.skipIf(!url)("database (disposable Postgres)", () => {
  let sql: postgres.Sql;
  let n = 0;
  const hex64 = () => (++n).toString(16).padStart(64, "0");

  beforeAll(async () => {
    sql = postgres(url!, { max: 4, onnotice: () => {} });
    if (!/localhost|127\.0\.0\.1/.test(url!)) throw new Error("TEST_DATABASE_URL must be a local scratch database");
    // What Supabase provides and our migrations expect (the same stubs as the restore drill in backup.yml).
    await sql.unsafe(`
      drop schema if exists public cascade; create schema public;
      drop schema if exists auth cascade; create schema auth;
      create table auth.users (id uuid primary key, email text);
      create function auth.uid() returns uuid language sql stable as 'select null::uuid';
      do $$ begin
        if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
        if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
        if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
      end $$;
      create table _migrations (name text primary key, applied_at timestamptz not null default now());`);
    // Every migration, in order, each in its own transaction (as migrate.ts does, which also creates _migrations).
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      await sql.begin((tx) => tx.unsafe(readFileSync(join(dir, file), "utf8")));
    }
  }, 60_000);

  afterAll(async () => { await sql?.end(); });

  beforeEach(async () => {
    await sql`truncate store_prices, store_matches, store_runs, notifications, trackings, email_requests, watchers, seller_feedback, seller_daily, offers_current,
      sellers, price_observations, product_state, collection_schedule, products restart identity cascade`;
  });

  async function watcher(opts: { chat?: number; email?: string } = {}) {
    const [w] = await sql<{ id: string }[]>`
      insert into watchers (secret_hash, telegram_chat_id, email, email_confirmed_at, email_stop_code)
      values (${hex64()}, ${opts.chat ?? null}, ${opts.email ?? null}, ${opts.email ? sql`now()` : null},
              ${opts.email ? `stop${hex64().slice(-20)}` : null})
      returning id`;
    return w!.id;
  }
  async function notification(watcherId: string, channel: "telegram" | "email", age = "0 minutes") {
    const [t] = await sql<{ id: string }[]>`
      insert into trackings (watcher_id, external_id, target_price, status) values (${watcherId}, ${String(100_000_000 + ++n)}, 1000, 'active')
      returning id`;
    const [row] = await sql<{ id: number }[]>`
      insert into notifications (tracking_id, type, channel, price, idempotency_key, created_at)
      values (${t!.id}, 'target_reached', ${channel}, 1000, ${`k${hex64()}`}, now() - ${age}::interval) returning id`;
    return Number(row!.id);
  }
  const status = async (id: number) =>
    (await sql<{ status: string }[]>`select status from notifications where id = ${id}`)[0]!.status;

  it("applies every migration to an empty database", async () => {
    const [t] = await sql<{ n: number }[]>`
      select count(*)::int as n from information_schema.columns
      where table_name = 'notifications' and column_name in ('attempts', 'next_attempt_at', 'claimed_at', 'send_started_at', 'last_error')`;
    expect(t!.n).toBe(5);
  });

  describe("delivery", () => {
    it("never gives one message to two overlapping runs", async () => {
      const w = await watcher({ chat: 42 });
      const ids = [];
      for (let i = 0; i < 7; i++) ids.push(await notification(w, "telegram"));
      const [a, b] = await Promise.all([claimNotifications(sql, "telegram", 4), claimNotifications(sql, "telegram", 4)]);
      expect(a.filter((id) => b.includes(id))).toEqual([]);
      expect([...a, ...b].sort((x, y) => x - y)).toEqual(ids);
      expect(await claimNotifications(sql, "telegram")).toEqual([]); // all claimed
    });

    it("claims only messages the watcher can receive, on that channel", async () => {
      const noChat = await watcher();
      const mail = await watcher({ email: "a@example.com" });
      await notification(noChat, "telegram");
      const e = await notification(mail, "email");
      expect(await claimNotifications(sql, "telegram")).toEqual([]);
      expect(await claimNotifications(sql, "email")).toEqual([e]);
    });

    it("retries a passing failure later, fails a permanent one, records a success", async () => {
      const w = await watcher({ chat: 42 });
      const [x, y, z] = [await notification(w, "telegram"), await notification(w, "telegram"), await notification(w, "telegram")];
      await claimNotifications(sql, "telegram");
      for (const id of [x, y, z]) await startSend(sql, id);
      expect(await markFailed(sql, x, false, "telegram 502")).toEqual({ status: "queued", retryInMinutes: DELIVERY.retryMinutes[0] });
      expect(await markFailed(sql, y, true, "telegram 403: bot was blocked")).toEqual({ status: "failed" });
      await markSent(sql, z, "777");
      expect([await status(x), await status(y), await status(z)]).toEqual(["queued", "failed", "sent"]);
      expect(await claimNotifications(sql, "telegram")).toEqual([]); // x waits for its retry time
      await sql`update notifications set next_attempt_at = now() where id = ${x}`;
      expect(await claimNotifications(sql, "telegram")).toEqual([x]);
    });

    it("gives up after the last attempt", async () => {
      const w = await watcher({ chat: 42 });
      const x = await notification(w, "telegram");
      await sql`update notifications set attempts = ${DELIVERY.maxAttempts - 1} where id = ${x}`;
      await claimNotifications(sql, "telegram");
      await startSend(sql, x);
      expect(await markFailed(sql, x, false, "timeout")).toEqual({ status: "failed" });
    });

    it("after a crash: re-queues unsent claims and emails, gives up a Telegram message whose send had started", async () => {
      const tg = await watcher({ chat: 42 });
      const mail = await watcher({ email: "b@example.com" });
      const [started, waiting, email] = [await notification(tg, "telegram"), await notification(tg, "telegram"), await notification(mail, "email")];
      await claimNotifications(sql, "telegram");
      await claimNotifications(sql, "email");
      await startSend(sql, started);
      await startSend(sql, email);
      await tidyDeliveries(sql);
      expect([await status(started), await status(waiting), await status(email)]).toEqual(["sending", "sending", "sending"]); // fresh claims stay
      await sql`update notifications set claimed_at = now() - make_interval(mins => ${DELIVERY.staleClaimMinutes + 1})`;
      await tidyDeliveries(sql);
      expect([await status(started), await status(waiting), await status(email)]).toEqual(["failed", "queued", "queued"]);
    });

    it("does not send messages older than the limit", async () => {
      const w = await watcher({ chat: 42 });
      const old = await notification(w, "telegram", `${DELIVERY.maxAgeHours + 1} hours`);
      expect(await claimNotifications(sql, "telegram")).toEqual([]);
      await tidyDeliveries(sql);
      expect(await status(old)).toBe("failed");
    });
  });

  describe("email confirmation limits", () => {
    const ask = (w: string, email: string) => requestWatcherEmail(sql, w, email, hex64(), `code${hex64().slice(-20)}`);

    it("one request a minute per browser, however often it asks", async () => {
      const w = await watcher();
      expect(await ask(w, "c@example.com")).toEqual({ ok: true, send: true });
      expect(await ask(w, "c@example.com")).toEqual({ ok: false, reason: "too_soon" });
      expect(await ask(w, "d@example.com")).toEqual({ ok: false, reason: "too_soon" });
    });

    it("caps a browser's requests a day, across addresses", async () => {
      const w = await watcher();
      for (let i = 0; i < EMAIL_REQUEST_LIMITS.perWatcherPerDay; i++) {
        await sql`insert into email_requests (email_hash, watcher_id, at) values (sha256(${`x${i}`}::bytea), ${w}, now() - interval '10 minutes')`;
      }
      expect(await ask(w, "e@example.com")).toEqual({ ok: false, reason: "too_many" });
    });

    it("caps one address a day across browsers, also when they ask at the same moment", async () => {
      const ws = [];
      for (let i = 0; i < EMAIL_REQUEST_LIMITS.perAddressPerDay + 3; i++) ws.push(await watcher());
      const results = await Promise.all(ws.map((w) => ask(w, "f@example.com")));
      expect(results.filter((r) => r.ok).length).toBe(EMAIL_REQUEST_LIMITS.perAddressPerDay);
      expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.reason === "too_many")).toBe(true);
    });

    it("needs no email for an address this browser already confirmed", async () => {
      const w = await watcher({ email: "g@example.com" });
      expect(await ask(w, "g@example.com")).toEqual({ ok: true, send: false });
    });
  });

  describe("shops", () => {
    const offer = (sellerId: string, price: number, rating: number | null, reviews: number | null) => ({
      sellerId, sellerName: `Shop ${sellerId}`, sellerRating: rating, sellerReviews: reviews, price, deliveryDuration: "TOMORROW", preorderDays: 0,
    });
    const snap = (externalId: string, offers: ReturnType<typeof offer>[]): ProductSnapshot => ({
      marketplace: "kaspi", externalId, title: `Product ${externalId}`, imageUrl: null, categoryPath: ["Cat"], reviews: null, rating: null,
      offers, minPrice: offers[0]?.price ?? null, offerCount: offers.length, inStock: offers.length > 0, fetchedAt: new Date().toISOString(),
    });

    it("records each shop's rating and reviews once a day, the day's latest value", async () => {
      await saveSnapshot(sql, snap("200000001", [offer("m1", 60_000, 4.9, 100), offer("m2", 100_000, 4.5, 30), offer("m3", 101_000, 0, 0)]), null, null);
      await saveSnapshot(sql, snap("200000002", [offer("m1", 5_000, 4.9, 104)]), null, null);
      const rows = await sql<{ external_id: string; reviews: number; first_seen: boolean }[]>`
        select se.external_id, d.reviews, se.first_seen_at is not null as first_seen
        from seller_daily d join sellers se on se.id = d.seller_id order by 1`;
      expect(rows.map((r) => [r.external_id, r.reviews])).toEqual([["m1", 104], ["m2", 30], ["m3", 0]]);
      expect(rows.every((r) => r.first_seen)).toBe(true);
    });

    it("writes a product in a fixed number of statements, however many sellers it has (6 Nov 2026: per-seller writes slowed the run 17%)", async () => {
      let statements = 0;
      const counted = postgres(url!, { max: 1, onnotice: () => {}, debug: () => { statements++; } });
      const many = (n: number) => Array.from({ length: n }, (_, i) => offer(`s${i}`, 10_000 + i * 100, 4.8, 100 + i));
      try {
        await counted`select 1`; // a new connection looks up types once: not part of saveSnapshot
        statements = 0;
        await saveSnapshot(counted, snap("200000011", many(3)), null, null);
        const three = statements;
        statements = 0;
        await saveSnapshot(counted, snap("200000012", many(30)), null, null);
        expect(statements).toBe(three);
        expect(statements).toBeLessThanOrEqual(SAVE_SNAPSHOT_STATEMENTS);
      } finally {
        await counted.end();
      }
      const [n] = await sql<{ offers: number; daily: number }[]>`
        select (select count(*)::int from offers_current) as offers, (select count(*)::int from seller_daily) as daily`;
      expect(n).toEqual({ offers: 33, daily: 30 }); // s0–s2 sold both products: one daily row each
    });

    it("keeps a seller's cheaper offer when Kaspi lists it twice", async () => {
      await saveSnapshot(sql, snap("200000013", [offer("dup", 5_000, 4.9, 10), offer("x", 6_000, 4.9, 10), offer("dup", 7_000, 4.9, 10)]), null, null);
      const rows = await sql<{ external_id: string; price: number }[]>`
        select se.external_id, o.price from offers_current o join sellers se on se.id = o.seller_id order by o.price`;
      expect(rows).toEqual([{ external_id: "dup", price: 5_000 }, { external_id: "x", price: 6_000 }]);
    });

    it("shows a shop with its products and the other sellers' prices", async () => {
      await saveSnapshot(sql, snap("200000001", [offer("m1", 60_000, 4.9, 100), offer("m2", 100_000, 4.5, 30), offer("m3", 101_000, 0, 0)]), null, null);
      const shop = await getShop(sql, "m1");
      expect(shop).toMatchObject({ name: "Shop m1", reviews: 100, productCount: 1 });
      expect(shop!.products[0]).toMatchObject({ externalId: "200000001", price: 60_000, minPrice: 60_000 });
      expect(shop!.products[0]!.others.sort()).toEqual([100_000, 101_000]);
      expect(shop!.daily).toHaveLength(1);
      expect(await getShop(sql, "nobody")).toBeNull();
      expect((await productSellers(sql, "200000001")).map((s) => s.sellerId)).toEqual(["m1", "m2", "m3"]);
    });

    it("takes purchase feedback only after 'bought: yes', one per tracking, and only for a shop selling the product", async () => {
      await saveSnapshot(sql, snap("200000001", [offer("m1", 60_000, 4.9, 100)]), null, null);
      await saveSnapshot(sql, snap("200000009", [offer("m9", 9_000, 4.9, 100)]), null, null);
      const w = await watcher();
      const [t] = await sql<{ id: string }[]>`
        insert into trackings (watcher_id, external_id, product_id, target_price, status, bought_code)
        values (${w}, '200000001', (select id from products where external_id = '200000001'), 1000, 'active', ${"c".repeat(20)}) returning id`;
      expect(await saveShopFeedback(sql, { code: "c".repeat(20) }, "m1", "ok")).toBe(false); // not bought yet
      await sql`update trackings set bought = 'yes' where id = ${t!.id}`;
      expect(await saveShopFeedback(sql, { code: "c".repeat(20) }, "m1", "late")).toBe(true);
      expect(await saveShopFeedback(sql, { watcherId: w, trackingId: t!.id }, "m1", "not_delivered")).toBe(true); // replaces
      expect(await saveShopFeedback(sql, { code: "c".repeat(20) }, "m9", "ok")).toBe(true); // m9 does not sell it: no shop
      const rows = await sql<{ seller_id: number | null; outcome: string }[]>`select seller_id, outcome from seller_feedback`;
      expect(rows).toEqual([{ seller_id: null, outcome: "ok" }]);
      await saveShopFeedback(sql, { code: "c".repeat(20) }, "m1", "not_delivered");
      expect((await getShop(sql, "m1"))!.feedback).toMatchObject({ n: 1, not_delivered: 1, ok: 0 });
    });
  });

  describe("removing a tracking (migration 0019)", () => {
    it("keeps it as history, hides it, drops its queued messages and sends nothing more", async () => {
      const w = await watcher({ chat: 42 });
      const n = await notification(w, "telegram");
      const [t] = await sql<{ id: string }[]>`select tracking_id as id from notifications where id = ${n}`;
      expect(await deleteWatcherTracking(sql, w, t!.id)).toBe(true);
      const [row] = await sql<{ status: string; removed_at: Date | null }[]>`select status, removed_at from trackings where id = ${t!.id}`;
      expect(row!.status).toBe("removed");
      expect(row!.removed_at).not.toBeNull();
      expect(await status(n)).toBe("failed");
      expect(await listWatched(sql, w)).toEqual([]);
      expect(await claimNotifications(sql, "telegram")).toEqual([]);
      expect(await deleteWatcherTracking(sql, w, t!.id)).toBe(false); // already removed
    });
  });

  describe("day moves (docs/STATS.md rule D)", () => {
    it("compares with the day before only: a change across a missed day is not today's move (8 Nov 2026)", async () => {
      const day = (back: number) => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() - back, 5));
      const add = async (externalId: string, obs: [number, number][]) => {
        const [p] = await sql<{ id: number }[]>`insert into products (marketplace_id, external_id, title)
          values ((select id from marketplaces where code = 'kaspi'), ${externalId}, ${externalId}) returning id`;
        for (const [back, price] of obs) await sql`insert into price_observations (product_id, observed_at, min_price, offer_count, in_stock)
          values (${p!.id}, ${day(back)}, ${price}, 1, true)`;
      };
      await add("200000001", [[3, 400_000], [1, 320_000]]); // checked 3 days ago and on the shift, missed in between
      await add("200000002", [[2, 400_000], [1, 320_000]]); // checked the day before the shift
      const m = await dayMoves(sql, new Date(day(1).getTime() + 6 * 3_600_000)); // after that shift ended
      expect(m.down.map((x) => x.externalId)).toEqual(["200000002"]);
      expect(m.compared).toBe(1);
      expect(m.checked).toBe(2);
    });
  });

  describe("other stores (migration 0018)", () => {
    async function product(externalId: string) {
      await saveSnapshot(sql, { marketplace: "kaspi", externalId, title: `Product ${externalId}`, imageUrl: null, categoryPath: ["Cat"], reviews: null, rating: null,
        offers: [{ sellerId: "m1", sellerName: "Shop", sellerRating: 4.9, sellerReviews: 100, price: 50_000, deliveryDuration: null, preorderDays: 0 }],
        minPrice: 50_000, offerCount: 1, inStock: true, fetchedAt: new Date().toISOString() }, null, null);
      return (await sql<{ id: number }[]>`select id from products where external_id = ${externalId}`)[0]!.id;
    }

    it("keeps one confirmed item per product; a second one waits for the owner", async () => {
      const mid = await storeMarketplaceId(sql, "technodom");
      const p = await product("300000001");
      const a = await saveMatch(sql, { productId: p, marketplaceId: mid, sku: "1", slug: "item-1", title: "Item", method: "exact", status: "confirmed" });
      const b = await saveMatch(sql, { productId: p, marketplaceId: mid, sku: "2", slug: "item-2", title: "Item 2", method: "strict", status: "confirmed" });
      expect([a.status, b.status]).toEqual(["confirmed", "pending"]);
      expect(await decideMatch(sql, b.id, true)).toBe(true); // the owner picks the second: the first is replaced
      const rows = await sql<{ store_sku: string; status: string; method: string }[]>`select store_sku, status, method from store_matches order by store_sku`;
      expect(rows).toEqual([{ store_sku: "1", status: "rejected", method: "exact" }, { store_sku: "2", status: "confirmed", method: "manual" }]);
    });

    it("shows only fresh, in-stock prices of confirmed items, and prices each match once a day", async () => {
      const mid = await storeMarketplaceId(sql, "technodom");
      const p = await product("300000002");
      const m = await saveMatch(sql, { productId: p, marketplaceId: mid, sku: "9", slug: "item-9", title: "Item 9", method: "exact", status: "confirmed" });
      expect(await matchesToPrice(sql, mid, 10)).toHaveLength(1);
      await saveStorePrice(sql, m.id, { price: 45_990, oldPrice: 49_990, inStock: true });
      expect(await matchesToPrice(sql, mid, 10)).toHaveLength(0); // priced today
      expect((await storeOffers(sql, p)).map((o) => [o.store, o.price])).toEqual([["technodom", 45_990]]);
      await saveStorePrice(sql, m.id, { price: 45_990, oldPrice: null, inStock: false });
      expect(await storeOffers(sql, p)).toEqual([]); // out of stock now
      await sql`update store_prices set in_stock = true, observed_at = now() - interval '3 days'`;
      expect(await storeOffers(sql, p)).toEqual([]); // too old to show
    });

    it("shows a colour-only pair as similar, never other doubts, and never next to an exact item of the same store", async () => {
      const mid = await storeMarketplaceId(sql, "technodom");
      const p = await product("300000003");
      const colour = await saveMatch(sql, { productId: p, marketplaceId: mid, sku: "21", slug: "item-21", title: "Item White", method: "strict", status: "pending", reason: "colour differs" });
      const memory = await saveMatch(sql, { productId: p, marketplaceId: mid, sku: "22", slug: "item-22", title: "Item 6/128", method: "strict", status: "pending", reason: "ram differs" });
      for (const id of [colour.id, memory.id]) await saveStorePrice(sql, id, { price: 30_000, oldPrice: null, inStock: true });
      expect((await storeOffers(sql, p)).map((o) => [o.kind, o.title])).toEqual([["similar", "Item White"]]);
      expect((await matchesToPrice(sql, mid, 10)).map((m) => m.sku)).toEqual([]); // both priced today; the memory one never
      const exact = await saveMatch(sql, { productId: p, marketplaceId: mid, sku: "23", slug: "item-23", title: "Item", method: "exact", status: "confirmed" });
      await saveStorePrice(sql, exact.id, { price: 31_000, oldPrice: null, inStock: true });
      expect((await storeOffers(sql, p)).map((o) => o.kind)).toEqual(["exact"]);
    });
  });
});
