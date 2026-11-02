import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { normalizeEmail } from "@baga/core";
import { getSql, requestWatcherEmail, removeWatcherEmail, setWatcherLocale } from "@baga/db";
import { allow } from "@/lib/rateLimit";
import { clientIp, verifyTurnstile } from "@/lib/turnstile";
import { ensureWatcher, currentWatcher, hashSecret, randomCode } from "@/lib/watcher";
import { renderConfirmEmail, sendEmail, resendKey } from "@/lib/email";
import { siteUrl } from "@/lib/site";

/**
 * Email alerts for this visitor (DECISIONS.md, 2026-11-02 "Email alerts with confirmation").
 * POST { email, locale, token }: after Turnstile, stores the address and sends a confirmation link; alerts go to it
 * only once confirmed. DELETE: forget the address.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!allow(`email:${ip}`, 5, 60 * 60 * 1000)) return NextResponse.json({ code: "rate_limited" }, { status: 429 });
  const b = (await req.json().catch(() => ({}))) as { email?: unknown; locale?: unknown; token?: unknown };
  const locale = b.locale === "kk" ? "kk" : "ru";
  const email = normalizeEmail(b.email);
  if (!email) return NextResponse.json({ code: "invalid_email" }, { status: 400 });
  const sql = getSql();
  if (!sql || (process.env.NODE_ENV === "production" && !resendKey())) return NextResponse.json({ code: "not_ready" }, { status: 503 });
  const check = await verifyTurnstile(b.token, ip, { expectedAction: "email" });
  if (!check.ok) return NextResponse.json({ code: "check_failed" }, { status: 403 });

  const watcher = await ensureWatcher(locale);
  if (!watcher) return NextResponse.json({ code: "not_ready" }, { status: 503 });
  await setWatcherLocale(sql, watcher.id, locale);
  const token = randomBytes(32).toString("base64url");
  const r = await requestWatcherEmail(sql, watcher.id, email, hashSecret(token), randomCode());
  if (!r.ok) return NextResponse.json({ code: r.reason }, { status: 429 });
  if (!r.send) return NextResponse.json({ code: "confirmed", email });
  const sent = await sendEmail(email, await renderConfirmEmail(locale, `${siteUrl()}/${locale}/email?confirm=${token}`));
  if (!sent) {
    await removeWatcherEmail(sql, watcher.id);
    return NextResponse.json({ code: "not_ready" }, { status: 502 });
  }
  return NextResponse.json({ code: "sent", email });
}

export async function DELETE() {
  const sql = getSql();
  const w = await currentWatcher();
  if (!sql || !w) return NextResponse.json({ code: "not_found" }, { status: 404 });
  await removeWatcherEmail(sql, w.watcher.id);
  return NextResponse.json({ code: "removed" });
}
