import { NextResponse } from "next/server";
import { addEvent, markViewed, dropTeamVisitor, EVENT_NAMES, getSql, type EventName } from "@baga/db";
import { currentWatcher } from "@/lib/watcher";
import { allow } from "@/lib/rateLimit";
import { clientIp } from "@/lib/turnstile";

const BOTS = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor/i;

/**
 * Funnel beacon (lib/analytics.ts): one step of a visit. Stores no IP and no user agent; the IP only feeds the
 * in-memory rate limit. Always answers 204, so a beacon never shows an error.
 */
export async function POST(req: Request) {
  const done = new NextResponse(null, { status: 204 });
  // Local dev servers share the production database: their visits are not real ones.
  if (new URL(req.url).hostname === "localhost") return done;
  if (BOTS.test(req.headers.get("user-agent") ?? "") || !allow(`e:${clientIp(req)}`, 120, 60 * 60 * 1000)) return done;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (v: unknown, re: RegExp) => (typeof v === "string" && re.test(v) ? v : null);
  if (!EVENT_NAMES.includes(b.name as EventName)) return done;
  const sid = str(b.sid, /^[A-Za-z0-9_-]{16,32}$/);
  const sql = getSql();
  if (!sid || !sql) return done;
  const vid = str(b.vid, /^[A-Za-z0-9_-]{16,32}$/);
  // The owner's own browsers (migration 0030) leave no trace in the numbers, past or future.
  const me = await currentWatcher().catch(() => null);
  if (me && (await dropTeamVisitor(sql, me.watcher.id, vid).catch(() => false))) return done;
  const externalId = str(b.externalId, /^\d{5,12}$/);
  if (b.name === "product_view" && externalId) await markViewed(sql, externalId).catch(() => {});
  await addEvent(sql, {
    name: b.name as EventName, sid, vid,
    locale: b.locale === "kk" ? "kk" : b.locale === "ru" ? "ru" : null,
    device: b.device === "mobile" || b.device === "desktop" ? b.device : null,
    source: str(b.source, /^[a-z0-9.\-_]{1,64}$/i)?.toLowerCase() ?? null,
    externalId,
    detail: str(b.detail, /^[a-z_]{1,32}$/),
  }).catch(() => {}); // before migration 0011, or a blip: the funnel misses one step
  return done;
}
