import { NextResponse } from "next/server";
import { answerBought, BOUGHT_ANSWERS, getSql, type BoughtAnswer } from "@baga/db";
import { allow } from "@/lib/rateLimit";
import { clientIp } from "@/lib/turnstile";
import { currentWatcher } from "@/lib/watcher";

/**
 * "Вы купили?" answer: POST { answer, code } from the email's answer page, or { answer, trackingId } from "Мои
 * товары" (this browser's list). "yes" ends the tracking.
 */
export async function POST(req: Request) {
  if (!allow(`bought:${clientIp(req)}`, 30, 60 * 60 * 1000)) return NextResponse.json({ code: "rate_limited" }, { status: 429 });
  const b = (await req.json().catch(() => ({}))) as { answer?: unknown; code?: unknown; trackingId?: unknown };
  if (!BOUGHT_ANSWERS.includes(b.answer as BoughtAnswer)) return NextResponse.json({ code: "invalid" }, { status: 400 });
  const answer = b.answer as BoughtAnswer;
  const sql = getSql();
  if (!sql) return NextResponse.json({ code: "not_ready" }, { status: 503 });
  let r = null;
  if (typeof b.code === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(b.code)) r = await answerBought(sql, { code: b.code }, answer);
  else if (typeof b.trackingId === "string" && /^[0-9a-f-]{36}$/.test(b.trackingId)) {
    const w = await currentWatcher();
    if (w) r = await answerBought(sql, { watcherId: w.watcher.id, trackingId: b.trackingId }, answer);
  }
  return r ? NextResponse.json({ code: "ok", answer: r.bought }) : NextResponse.json({ code: "not_found" }, { status: 404 });
}
