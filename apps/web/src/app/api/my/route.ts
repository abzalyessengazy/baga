import { NextResponse } from "next/server";
import { getSql, getWatcherBySecret } from "@baga/db";
import { allow } from "@/lib/rateLimit";
import { clientIp } from "@/lib/turnstile";
import { WATCHER_COOKIE, cookieOptions, hashSecret, isValidSecret } from "@/lib/watcher";

/**
 * The private "Мои товары" link: /api/my?k=<secret>&l=ru. Remembers the secret in this browser, then opens the
 * list. Unknown secrets just open the (empty) list. Rate-limited so secrets cannot be guessed at speed.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const locale = url.searchParams.get("l") === "kk" ? "kk" : "ru";
  const k = url.searchParams.get("k");
  const res = NextResponse.redirect(new URL(`/${locale}/my`, url), 303);
  res.headers.set("Referrer-Policy", "no-referrer");
  if (!allow(`my:${clientIp(req)}`, 20, 60 * 60 * 1000) || !isValidSecret(k)) return res;
  const sql = getSql();
  if (sql && (await getWatcherBySecret(sql, hashSecret(k)))) res.cookies.set(WATCHER_COOKIE, k, cookieOptions());
  return res;
}
