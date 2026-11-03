import { NextResponse } from "next/server";
import { DROP_PRESETS, targetForDrop } from "@baga/core";
import { getSql, getProductByExternalId, type TrackTarget, upsertWatcherTracking, upsertWatcherShortLinkTracking, deleteWatcherTracking, setWatcherLocale } from "@baga/db";
import { allow } from "@/lib/rateLimit";
import { clientIp } from "@/lib/turnstile";
import { ensureWatcher, currentWatcher, telegramConnectUrl, WATCHER_LIMIT } from "@/lib/watcher";

/**
 * Starts (or updates) tracking a product for this visitor, before registration exists (DECISIONS.md, 2026-11-02).
 * Body: { productId | shortLink, target | dropPct, locale }. dropPct (a preset's percentage) is for a product with
 * no price yet: the collector turns it into a price with the first one (migration 0010). If the price has arrived
 * meanwhile, it is converted here. The product must be in the catalog or queued, or the short link
 * waiting in short_link_queue (migration 0009). No Kaspi request.
 * Returns the Telegram deep link while alerts are not connected yet.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!allow(`track:${ip}`, 30, 60 * 60 * 1000)) return NextResponse.json({ code: "rate_limited" }, { status: 429 });
  const b = (await req.json().catch(() => ({}))) as { productId?: unknown; shortLink?: unknown; target?: unknown; dropPct?: unknown; locale?: unknown };
  const productId = typeof b.productId === "string" && /^\d{5,12}$/.test(b.productId) ? b.productId : null;
  const shortLink = typeof b.shortLink === "string" && /^[A-Za-z0-9_-]{4,64}$/.test(b.shortLink) ? b.shortLink : null;
  const target = typeof b.target === "number" && Number.isInteger(b.target) && b.target > 0 && b.target < 100_000_000 ? b.target : null;
  const dropPct = DROP_PRESETS.some((p) => p.from === b.dropPct) ? (b.dropPct as number) : null;
  const locale = b.locale === "kk" ? "kk" : "ru";
  if (!productId && !shortLink) return NextResponse.json({ code: "unknown_product" }, { status: 400 });
  if (!target && !dropPct) return NextResponse.json({ code: "invalid_target" }, { status: 400 });
  const sql = getSql();
  const watcher = sql ? await ensureWatcher(locale) : null;
  if (!sql || !watcher) return NextResponse.json({ code: "not_ready" }, { status: 503 });
  await setWatcherLocale(sql, watcher.id, locale);
  let t: TrackTarget = target ? { price: target } : { dropPct: dropPct! };
  const current = !target && productId ? (await getProductByExternalId(sql, productId))?.currentMinPrice ?? null : null;
  if (current !== null) {
    const price = targetForDrop(current, dropPct!);
    if (!price) return NextResponse.json({ code: "invalid_target" }, { status: 400 });
    t = { price };
  }
  const r = productId
    ? await upsertWatcherTracking(sql, watcher.id, productId, t, WATCHER_LIMIT)
    : await upsertWatcherShortLinkTracking(sql, watcher.id, shortLink!, t, WATCHER_LIMIT);
  if (!r.ok) return NextResponse.json({ code: r.reason }, { status: r.reason === "limit" ? 409 : 404 });
  return NextResponse.json({
    code: "tracking", target: "price" in t ? t.price : null, dropPct: "dropPct" in t ? t.dropPct : null,
    linked: !!watcher.telegramChatId, telegramUrl: await telegramConnectUrl(watcher),
  });
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
