/**
 * One test notification to the team's own browsers (watchers marked internal, migration 0030) — to see browser
 * notifications work end to end after a deploy. `pnpm --filter @baga/worker push:test`. Writes nothing but
 * last_ok_at, and removes a subscription its push service no longer knows.
 */
import postgres from "postgres";
import { connectionOptions, dropPushSubscription, pushWorked } from "@baga/db";
import { env } from "./env";
import { sendPush } from "./push";

const key = env.vapidPrivateKey();
if (!key) throw new Error("VAPID_PRIVATE_KEY is not set");
const sql = postgres(process.env.DATABASE_URL!, connectionOptions(process.env.DATABASE_URL!));
try {
  const subs = await sql<{ id: number; endpoint: string; p256dh: string; auth: string; locale: "ru" | "kk" }[]>`
    select ps.id, ps.endpoint, ps.p256dh, ps.auth, w.locale from push_subscriptions ps join watchers w on w.id = ps.watcher_id where w.internal`;
  if (!subs.length) console.log("No team browser has turned notifications on yet.");
  for (const s of subs) {
    const r = await sendPush(s, { title: "BAĞA", body: s.locale === "kk" ? "Сынақ хабарлама: бәрі жұмыс істейді ✓" : "Проверка уведомлений: всё работает ✓", url: `/${s.locale}/my`, tag: "baga-test" }, key, env.siteUrl())
      .catch((e) => String(e));
    if (r === "ok") await pushWorked(sql, Number(s.id)); else if (r === "gone") await dropPushSubscription(sql, Number(s.id));
    console.log(`${new URL(s.endpoint).hostname}: ${r}`);
  }
} finally {
  await sql.end();
}
