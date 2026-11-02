import { NextResponse } from "next/server";
import { getSql, stopWatcherEmailByCode } from "@baga/db";

const isCode = (v: string) => /^[A-Za-z0-9_-]{16,64}$/.test(v);

/**
 * Unsubscribe. Mail apps POST here with "List-Unsubscribe=One-Click" (RFC 8058); the button on
 * /[locale]/email?stop=<code> posts the same form with `l` and is sent back to the page. A plain GET (a click on
 * the header link in an older client) only opens that page, so a prefetch never unsubscribes anyone.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const form = await req.formData().catch(() => null);
  const code = String(form?.get("c") ?? url.searchParams.get("c") ?? "");
  const sql = getSql();
  const ok = sql && isCode(code) ? await stopWatcherEmailByCode(sql, code) : false;
  const l = form?.get("l");
  if (l !== "ru" && l !== "kk") return new NextResponse(null, { status: ok ? 200 : 404 });
  return NextResponse.redirect(new URL(`/${l}/email?done=${ok ? "stopped" : "invalid"}`, req.url), 303);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("c") ?? "";
  const l = url.searchParams.get("l") === "kk" ? "kk" : "ru";
  return NextResponse.redirect(new URL(isCode(code) ? `/${l}/email?stop=${code}` : `/${l}/email?done=invalid`, req.url), 303);
}
