import { NextResponse } from "next/server";
import { deletePushSubscription, getSql, savePushSubscription, validPushSubscription } from "@baga/db";
import { currentWatcher } from "@/lib/watcher";
import { allow } from "@/lib/rateLimit";
import { clientIp } from "@/lib/turnstile";

/**
 * Browser notifications (migration 0038): POST saves this browser's subscription for the visitor behind the cookie,
 * DELETE { endpoint } removes it. Only addresses of known push services are kept (packages/db/src/push.ts).
 */
export async function POST(req: Request) {
  if (!allow(`push:${clientIp(req)}`, 20, 60 * 60 * 1000)) return NextResponse.json({ code: "rate_limited" }, { status: 429 });
  const sql = getSql();
  const me = await currentWatcher().catch(() => null);
  if (!sql || !me) return NextResponse.json({ code: "no_watcher" }, { status: 401 });
  const sub = validPushSubscription(await req.json().catch(() => null));
  if (!sub) return NextResponse.json({ code: "invalid" }, { status: 400 });
  await savePushSubscription(sql, me.watcher.id, sub);
  return NextResponse.json({ code: "on" });
}

export async function DELETE(req: Request) {
  const sql = getSql();
  const me = await currentWatcher().catch(() => null);
  const b = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (!sql || !me || typeof b?.endpoint !== "string") return NextResponse.json({ code: "invalid" }, { status: 400 });
  await deletePushSubscription(sql, me.watcher.id, b.endpoint);
  return NextResponse.json({ code: "off" });
}
