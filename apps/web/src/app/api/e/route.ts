import { NextResponse } from "next/server";
import { addEvent, EVENT_NAMES, getSql, type EventName } from "@baga/db";
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
  await addEvent(sql, {
    name: b.name as EventName, sid,
    locale: b.locale === "kk" ? "kk" : b.locale === "ru" ? "ru" : null,
    device: b.device === "mobile" || b.device === "desktop" ? b.device : null,
    source: str(b.source, /^[a-z0-9.\-_]{1,64}$/i)?.toLowerCase() ?? null,
    externalId: str(b.externalId, /^\d{5,12}$/),
    detail: str(b.detail, /^[a-z_]{1,32}$/),
  }).catch(() => {}); // before migration 0011, or a blip: the funnel misses one step
  return done;
}
