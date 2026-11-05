import { NextResponse } from "next/server";
import { SHOP_FEEDBACK, type ShopFeedbackOutcome } from "@baga/core";
import { getSql, saveShopFeedback } from "@baga/db";
import { allow } from "@/lib/rateLimit";
import { clientIp } from "@/lib/turnstile";
import { currentWatcher } from "@/lib/watcher";

/**
 * How a purchase went (migration 0016), after "Вы купили? — Да": POST { outcome, seller?, code } from the email's
 * answer page, or { outcome, seller?, trackingId } from this browser's "Мои товары". Only a tracking answered
 * "yes" can carry it, one answer per tracking (a new one replaces it).
 */
export async function POST(req: Request) {
  if (!allow(`shopfb:${clientIp(req)}`, 30, 60 * 60 * 1000)) return NextResponse.json({ code: "rate_limited" }, { status: 429 });
  const b = (await req.json().catch(() => ({}))) as { outcome?: unknown; seller?: unknown; code?: unknown; trackingId?: unknown };
  if (!SHOP_FEEDBACK.outcomes.includes(b.outcome as ShopFeedbackOutcome)) return NextResponse.json({ code: "invalid" }, { status: 400 });
  const seller = typeof b.seller === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(b.seller) ? b.seller : null;
  const sql = getSql();
  if (!sql) return NextResponse.json({ code: "not_ready" }, { status: 503 });
  let ok = false;
  if (typeof b.code === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(b.code)) {
    ok = await saveShopFeedback(sql, { code: b.code }, seller, b.outcome as ShopFeedbackOutcome);
  } else if (typeof b.trackingId === "string" && /^[0-9a-f-]{36}$/.test(b.trackingId)) {
    const w = await currentWatcher();
    if (w) ok = await saveShopFeedback(sql, { watcherId: w.watcher.id, trackingId: b.trackingId }, seller, b.outcome as ShopFeedbackOutcome);
  }
  return ok ? NextResponse.json({ code: "ok" }) : NextResponse.json({ code: "not_found" }, { status: 404 });
}
