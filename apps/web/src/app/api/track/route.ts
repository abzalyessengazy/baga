import { NextResponse } from "next/server";
import { getSql, upsertWatcherTracking, deleteWatcherTracking, setWatcherLocale } from "@baga/db";
import { allow } from "@/lib/rateLimit";
import { clientIp } from "@/lib/turnstile";
import { ensureWatcher, currentWatcher, telegramConnectUrl, WATCHER_LIMIT } from "@/lib/watcher";

/**
 * Starts (or updates) tracking a product for this visitor, before registration exists (DECISIONS.md, 2026-11-02).
 * Body: { productId, target, locale }. The product must be in the catalog or queued. No Kaspi request.
 * Returns the Telegram deep link while alerts are not connected yet.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!allow(`track:${ip}`, 30, 60 * 60 * 1000)) return NextResponse.json({ code: "rate_limited" }, { status: 429 });
  const b = (await req.json().catch(() => ({}))) as { productId?: unknown; target?: unknown; locale?: unknown };
  const productId = typeof b.productId === "string" && /^\d{5,12}$/.test(b.productId) ? b.productId : null;
  const target = typeof b.target === "number" && Number.isInteger(b.target) && b.target > 0 && b.target < 100_000_000 ? b.target : null;
  const locale = b.locale === "kk" ? "kk" : "ru";
  if (!productId) return NextResponse.json({ code: "unknown_product" }, { status: 400 });
  if (!target) return NextResponse.json({ code: "invalid_target" }, { status: 400 });
  const sql = getSql();
  const watcher = sql ? await ensureWatcher(locale) : null;
  if (!sql || !watcher) return NextResponse.json({ code: "not_ready" }, { status: 503 });
  await setWatcherLocale(sql, watcher.id, locale);
  const r = await upsertWatcherTracking(sql, watcher.id, productId, target, WATCHER_LIMIT);
  if (!r.ok) return NextResponse.json({ code: r.reason }, { status: r.reason === "limit" ? 409 : 404 });
  return NextResponse.json({ code: "tracking", linked: !!watcher.telegramChatId, telegramUrl: await telegramConnectUrl(watcher) });
}

/** Stops tracking: DELETE /api/track?id=<tracking id>. Only the owner's cookie can do it. */
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ code: "bad_request" }, { status: 400 });
  const sql = getSql();
  const w = await currentWatcher();
  if (!sql || !w) return NextResponse.json({ code: "not_found" }, { status: 404 });
  const ok = await deleteWatcherTracking(sql, w.watcher.id, id);
  return NextResponse.json({ code: ok ? "deleted" : "not_found" }, { status: ok ? 200 : 404 });
}
