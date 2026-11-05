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
import { requestWatcherEmail, EMAIL_REQUEST_LIMITS } from "./watchers";

const url = process.env.TEST_DATABASE_URL;
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
    await sql`truncate notifications, trackings, email_requests, watchers restart identity cascade`;
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
      insert into trackings (watcher_id, external_id, target_price, status) values (${watcherId}, '100000001', 1000, 'active')
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
});
