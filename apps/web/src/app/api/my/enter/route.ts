import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getSql, watcherIdByAccessCode } from "@baga/db";
import { allow } from "@/lib/rateLimit";
import { clientIp } from "@/lib/turnstile";
import { giveBrowserKey } from "@/lib/browserKey";

const isCode = (v: string | null): v is string => !!v && /^[A-Za-z0-9_-]{24,64}$/.test(v);
/** Only our own pages: /ru/… or /kk/…, never another site. */
const safeTo = (v: string | null, locale: "ru" | "kk") => (v && /^\/(ru|kk)(\/[^\s\\]*)?$/.test(v) && !v.startsWith("//") ? v : `/${locale}/my`);

/**
 * A sign-in link from a Telegram or email alert (DECISIONS.md, 2026-11-16 "Sign-in links in alerts"):
 * /api/my/enter?c=<access code>&to=/ru/my. This browser gets its own key to the visitor's list (Telegram's own
 * browser keeps no cookies from the one they started in), then the page opens. A browser that already belongs to
 * this visitor, or to someone else, keeps what it has; a wrong or old code just opens the page. Rate-limited.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const locale = url.searchParams.get("l") === "kk" ? "kk" : "ru";
  const to = safeTo(url.searchParams.get("to"), locale);
  // An alert's product link opens the price that alert is about, not the cached page of up to an hour ago
  // (DECISIONS.md, 2026-11-16 "Cached product pages").
  const product = /^\/(ru|kk)\/p\/(\d{5,12})(?:[?#]|$)/.exec(to);
  if (product) revalidatePath(`/${product[1]}/p/${product[2]}`);
  const res = NextResponse.redirect(new URL(to, url), 303);
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set("Cache-Control", "private, no-store");
  const code = url.searchParams.get("c");
  const sql = getSql();
  if (!sql || !isCode(code) || !allow(`enter:${clientIp(req)}`, 30, 60 * 60 * 1000)) return res;
  try {
    const id = await watcherIdByAccessCode(sql, code);
    if (!id) return res;
    await giveBrowserKey(sql, id, res);
  } catch (e) {
    console.error(`[enter] ${e}`);
  }
  return res;
}
