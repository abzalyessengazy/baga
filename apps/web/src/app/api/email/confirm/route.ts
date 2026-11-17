import { NextResponse } from "next/server";
import { getSql, confirmWatcherEmail } from "@baga/db";
import { hashSecret } from "@/lib/watcher";
import { giveBrowserKey } from "@/lib/browserKey";

/**
 * The button on /[locale]/email?confirm=<token>. A POST, not the link itself, so mail scanners that open links
 * cannot confirm an address on their own. The button's browser gets a key to the visitor's list.
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const token = String(form?.get("t") ?? "");
  const locale = form?.get("l") === "kk" ? "kk" : "ru";
  const sql = getSql();
  const r = sql && /^[A-Za-z0-9_-]{43}$/.test(token) ? await confirmWatcherEmail(sql, hashSecret(token)) : null;
  const res = NextResponse.redirect(new URL(`/${locale}/email?done=${r ? "confirmed" : "invalid"}`, req.url), 303);
  // The confirmation often opens in another browser than the one the list was made in (the mail app's own, or
  // Safari): it gets a key to the list, so «Мои товары» shows it there too (the owner, 17 Nov: it was empty).
  if (sql && r) await giveBrowserKey(sql, r.id, res).catch((e) => console.error(`[email confirm] ${e}`));
  return res;
}
