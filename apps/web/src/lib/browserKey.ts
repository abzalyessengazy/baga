import { randomBytes } from "node:crypto";
import type { NextResponse } from "next/server";
import { addWatcherKey, type getSql } from "@baga/db";
import { WATCHER_COOKIE, cookieOptions, currentWatcher, hashSecret } from "@/lib/watcher";

/**
 * Gives this browser a key to a visitor's list (DECISIONS.md 2026-11-16 "Sign-in links in alerts", 2026-11-17
 * "Confirming email signs the browser in"). A browser that already belongs to this visitor keeps it; one that belongs
 * to someone with their own list or channel keeps theirs; an empty profile (made by browsing here) gives way.
 */
export async function giveBrowserKey(sql: NonNullable<ReturnType<typeof getSql>>, watcherId: string, res: NextResponse): Promise<void> {
  if (!(await browserMayChange(sql, watcherId))) return;
  const secret = randomBytes(32).toString("base64url");
  await addWatcherKey(sql, watcherId, hashSecret(secret));
  res.cookies.set(WATCHER_COOKIE, secret, cookieOptions());
}

/**
 * Whether this browser may be switched to `watcherId`'s list: it has no profile, or an empty one (no products, no
 * channel). One that already is that visitor's, or belongs to someone with their own list or channel, stays as it is
 * (also for /api/my?k=: security audit 20 Nov 2026, a link with someone else's key must not replace a person's list).
 */
export async function browserMayChange(sql: NonNullable<ReturnType<typeof getSql>>, watcherId: string): Promise<boolean> {
  const here = await currentWatcher();
  if (!here) return true;
  if (here.watcher.id === watcherId) return false;
  const [busy] = await sql<{ n: number }[]>`select count(*)::int as n from trackings where watcher_id = ${here.watcher.id} and status <> 'removed'`;
  return !((busy?.n ?? 0) > 0 || here.watcher.telegramChatId || here.watcher.emailConfirmed || here.watcher.push);
}
