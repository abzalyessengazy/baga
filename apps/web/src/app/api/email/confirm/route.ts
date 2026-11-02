import { NextResponse } from "next/server";
import { getSql, confirmWatcherEmail } from "@baga/db";
import { hashSecret } from "@/lib/watcher";

/**
 * The button on /[locale]/email?confirm=<token>. A POST, not the link itself, so mail scanners that open links
 * cannot confirm an address on their own.
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const token = String(form?.get("t") ?? "");
  const locale = form?.get("l") === "kk" ? "kk" : "ru";
  const sql = getSql();
  const ok = sql && /^[A-Za-z0-9_-]{43}$/.test(token) ? !!(await confirmWatcherEmail(sql, hashSecret(token))) : false;
  return NextResponse.redirect(new URL(`/${locale}/email?done=${ok ? "confirmed" : "invalid"}`, req.url), 303);
}
