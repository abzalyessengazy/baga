import { NextResponse } from "next/server";
import { currentWatcher } from "@/lib/watcher";

/**
 * Where this visitor's alerts can go: { telegram, email } (email = a confirmed address). The coupon asks again when
 * the visitor comes back from the Telegram app, so "connect Telegram" turns into "connected" without a reload.
 */
export async function GET() {
  const w = await currentWatcher().catch(() => null);
  return NextResponse.json(
    { telegram: !!w?.watcher.telegramChatId, email: !!w?.watcher.emailConfirmed },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
